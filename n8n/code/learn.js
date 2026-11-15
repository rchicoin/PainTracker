// B5 · Personal learning: the logic of the "B5: learn from last dose" Code node in B4 (/log).
// Uses buildFeatures / globalPrediction / predictHours / updateOffset (ml/predict.js)
// and weatherAt / localIso / round (check-rules-and-predict.js); n8n/build.js pastes them all together.
//
// When a pain log is ABOVE the patient's goal and the last as-needed dose hasn't been learned from yet:
//   actualHours = first pain log above goal after the dose - dose time   (skip if < 15 min or > 8 h)
//   offset      = 0.7 x offset + 0.3 x (actual - globalPrediction)
// Returns the new patient_model row and a predictions row. Never touches prescription limits.

function learnFromPain({ patientId, painTime, painScore, weights, prescription, doses, pain, meals, walks, schedule,
  patientModel, predictions, weatherApi }) {
  const H = 3600000;
  const mine = (rows) => (rows || []).filter((r) => r && String(r.patientId) === String(patientId));
  const ms = (t) => new Date(t).getTime();
  const no = (reason) => ({ learn: false, reason });

  const rx = mine(prescription)[0];
  if (!rx) return no("no prescription");
  const goal = Number(rx.goal);
  const t = ms(painTime);
  if (!(Number(painScore) > goal)) return no("pain at or below goal");

  const asNeeded = mine(doses).filter((d) => (!d.kind || d.kind === "as-needed") && ms(d.time) < t).sort((a, b) => ms(a.time) - ms(b.time));
  if (!asNeeded.length) return no("no dose before this pain log");
  const t0 = ms(asNeeded[asNeeded.length - 1].time);

  if (mine(predictions).some((p) => Math.abs(ms(p.doseTime) - t0) < 60000 && isNum(p.actualHours))) {
    return no("already learned from this dose");
  }

  // relief ended at the FIRST pain log above goal after the dose (this one, or an earlier one)
  const painLog = mine(pain).sort((a, b) => ms(a.time) - ms(b.time));
  const back = painLog.find((p) => ms(p.time) > t0 && ms(p.time) <= t && Number(p.score) > goal);
  const actual = ((back ? ms(back.time) : t) - t0) / H;
  if (actual < 0.25 || actual > 8) return no(`relief time ${round(actual, 2)} h is outside 0.25–8 h`);

  const painBefore = painLog.filter((p) => ms(p.time) <= t0 && t0 - ms(p.time) <= H).pop();
  const features = buildFeatures({
    doseTime: new Date(t0),
    painAtDose: painBefore ? painBefore.score : null,
    walks: mine(walks),
    calendar: mine(schedule),
    scheduledMeds: mine(doses).filter((d) => d.kind === "scheduled").map((d) => d.time),
    meals: mine(meals).map((m) => m.time),
    weather: weatherAt(weatherApi, new Date(t0)),
  });

  const model = mine(patientModel)[0] || { offsetHours: 0, dosesLearned: 0 };
  const oldOffset = isNum(model.offsetHours) ? Number(model.offsetHours) : 0;
  const predicted = predictHours(weights, features, oldOffset);
  const newOffset = updateOffset(weights, oldOffset, actual, features);
  const dosesLearned = (Number(model.dosesLearned) || 0) + 1;

  return {
    learn: true,
    modelRow: { patientId, offsetHours: round(newOffset, 3), dosesLearned, lastUpdated: localIso(new Date(t)) },
    predictionRow: { patientId, doseTime: localIso(new Date(t0)), predictedHours: round(predicted, 2),
      actualHours: round(actual, 2), error: round(actual - predicted, 2) },
    summary: {
      actualHours: round(actual, 2), predictedHours: round(predicted, 2),
      offsetMinBefore: Math.round(oldOffset * 60), offsetMinAfter: Math.round(newOffset * 60), dosesLearned,
    },
  };
}

if (typeof module !== "undefined") module.exports = { learnFromPain };
