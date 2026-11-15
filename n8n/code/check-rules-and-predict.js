// B3 · Check rules & predict: the logic of the "Compute status" Code node.
// n8n/build.js pastes this file (plus the helpers from ml/predict.js and ml/weights.json) into the node.
// Test locally: node n8n/test-b3.js
//
// Returns everything GET /dashboard needs (docs/API.md) plus `status` (for the /log reply)
// and `prediction` (for B5 learning / the predictions table).
// Prescription limits are hard rules here. The model never changes them.

function checkRulesAndPredict({ patientId, now, weights, prescription, doses, pain, meals, walks, schedule, patientModel, weatherApi }) {
  const NOW = now ? new Date(now) : new Date();
  const H = 3600000;
  const mine = (rows) => (rows || []).filter((r) => r && String(r.patientId) === String(patientId));
  const byTime = (field) => (a, b) => new Date(a[field]) - new Date(b[field]);
  const upToNow = (field) => (r) => new Date(r[field]) <= NOW;

  // ---------- inputs ----------
  const rx = mine(prescription)[0];
  if (!rx) throw new Error(`No prescription row for patient ${patientId}`);
  const doseMg = Number(rx.doseMg), intervalH = Number(rx.minIntervalH), maxMg = Number(rx.maxMg24h), goal = Number(rx.goal);

  const allDoses = mine(doses).filter(upToNow("time")).sort(byTime("time"));
  const asNeeded = allDoses.filter((d) => !d.kind || d.kind === "as-needed");
  const scheduledMeds = allDoses.filter((d) => d.kind === "scheduled").map((d) => d.time);
  const painLog = mine(pain).filter(upToNow("time")).sort(byTime("time"));
  const mealTimes = mine(meals).filter(upToNow("time")).map((m) => m.time);
  const walkRows = mine(walks).filter(upToNow("time")).sort(byTime("time"));
  const calendar = mine(schedule).sort(byTime("start"));
  const model = mine(patientModel)[0] || { offsetHours: 0, dosesLearned: 0 };

  // ---------- prescription rules ----------
  const doseTimes = asNeeded.map((d) => new Date(d.time).getTime());
  const mgIn24h = (t) => asNeeded.filter((d) => {
    const x = new Date(d.time).getTime();
    return x > t - 24 * H && x <= t;
  }).reduce((s, d) => s + Number(d.mg || doseMg), 0);

  const mgUsed24h = mgIn24h(NOW.getTime());
  const lastDoseAt = doseTimes.length ? doseTimes[doseTimes.length - 1] : null;
  // earliest time that respects BOTH the minimum interval and the 24 h maximum
  let next = Math.max(NOW.getTime(), lastDoseAt === null ? 0 : lastDoseAt + intervalH * H);
  for (let i = 0; i < 50 && mgIn24h(next) + doseMg > maxMg; i++) {
    const inWindow = doseTimes.filter((x) => x > next - 24 * H && x <= next);
    next = inWindow[0] + 24 * H;
  }
  const doseAllowedNow = next <= NOW.getTime();
  const maxReached = mgUsed24h + doseMg > maxMg;

  // ---------- prediction for the last as-needed dose ----------
  let prediction = null;
  if (lastDoseAt !== null) {
    const doseTime = new Date(lastDoseAt);
    const painBefore = painLog.filter((p) => {
      const h = (doseTime - new Date(p.time)) / H;
      return h >= 0 && h <= 1;
    }).pop();
    const features = buildFeatures({
      doseTime,
      painAtDose: painBefore ? painBefore.score : null,
      walks: walkRows,
      calendar,
      scheduledMeds,
      meals: mealTimes,
      weather: weatherAt(weatherApi, doseTime),
    });
    const hours = predictHours(weights, features, model.offsetHours);
    prediction = {
      doseTime: localIso(doseTime),
      predictedHours: round(hours, 2),
      globalHours: round(globalPrediction(weights, features), 2),
      offsetHours: round(Number(model.offsetHours) || 0, 3),
      painLikelyBackAt: localIso(new Date(Math.round((lastDoseAt + hours * H) / 60000) * 60000)),
      features,
    };
  }

  // ---------- patterns (from the patient's own history) ----------
  const reliefHistory = asNeeded.map((d, i) => {
    const t = new Date(d.time).getTime();
    const until = i + 1 < asNeeded.length ? new Date(asNeeded[i + 1].time).getTime() : NOW.getTime();
    const back = painLog.find((p) => {
      const x = new Date(p.time).getTime();
      return x > t && x <= until && Number(p.score) > goal;
    });
    const h = back ? (new Date(back.time).getTime() - t) / H : null;
    return h !== null && h <= 8 ? h : null;
  }).filter((h) => h !== null);
  const reliefHours = reliefHistory.length ? median(reliefHistory) : null;

  const patterns = [];
  if (reliefHours !== null) patterns.push(`Your relief usually lasts about ${round(reliefHours, 1)} hours.`);

  const walkRises = walkRows.filter((w) => walkKm(w) > 1).map((w) => {
    const start = new Date(w.time).getTime();
    const end = start + Number(w.minutes || 0) * 60000;
    const before = painLog.filter((p) => new Date(p.time).getTime() <= start).pop();
    const after = painLog.filter((p) => { const x = new Date(p.time).getTime(); return x > end && x <= end + 2 * H; });
    if (!before || !after.length) return null;
    return Math.max(...after.map((p) => Number(p.score))) - Number(before.score);
  }).filter((x) => x !== null);
  const walkRise = walkRises.length >= 3 ? mean(walkRises) : 0;
  if (walkRise >= 1) patterns.push(`Walks over 1 km raise your pain about ${Math.round(walkRise)} points within 2 hours.`);

  const blocks = [["Mornings (6 AM–12 PM)", 6, 12], ["Afternoons (12–6 PM)", 12, 18], ["Evenings (6–10 PM)", 18, 22]]
    .map(([label, a, b]) => {
      const s = painLog.filter((p) => { const h = localHour(p.time); return h >= a && h < b; }).map((p) => Number(p.score));
      return { label, avg: s.length >= 5 ? mean(s) : null };
    }).filter((x) => x.avg !== null).sort((x, y) => y.avg - x.avg);
  if (blocks.length) patterns.push(`${blocks[0].label} are your hardest time.`);

  const wet = painLog.filter((p) => Number(p.precipMm) > 0).map((p) => Number(p.score));
  const dry = painLog.filter((p) => isNum(p.precipMm) && Number(p.precipMm) === 0).map((p) => Number(p.score));
  if (wet.length >= 5 && dry.length >= 5 && mean(wet) - mean(dry) >= 0.5) {
    patterns.push(`On rainy days your pain is about ${round(mean(wet) - mean(dry), 1)} points higher.`);
  }

  // ---------- heads-ups (never suggest anything outside the prescription) ----------
  const nextDoseAt = new Date(next);
  const headsUps = [];
  const backAt = prediction ? new Date(prediction.painLikelyBackAt) : null;
  if (maxReached) {
    headsUps.push(`You've reached today's maximum (${maxMg} mg). Your next dose is allowed at ${clock(nextDoseAt)}.`);
  }
  if (backAt && backAt > NOW && backAt - NOW <= 90 * 60000) {
    headsUps.push(`Pain likely back around ${clock(backAt)}. Your next dose is allowed ${doseAllowedNow ? "now" : "at " + clock(nextDoseAt)}.`);
  }
  const physio = calendar.find((e) => /physio/i.test(e.title || "") && new Date(e.start) > NOW && new Date(e.start) - NOW <= 3 * H);
  if (physio) {
    headsUps.push(`Physio at ${clock(new Date(physio.start))}. Pain may come back sooner afterwards. ` +
      `Your next dose is allowed ${doseAllowedNow ? "now" : "at " + clock(nextDoseAt)}.`);
  }

  // ---------- R5: forecast line (last dose -> relief -> pain likely back) ----------
  // A simple shape around the model's prediction: pain at the dose, lowest ~45 min later (goal - 1),
  // still at the goal 30 min before "pain likely back", then just above the goal. Only for a dose in the last 24 h.
  let forecast = [];
  if (prediction && NOW - lastDoseAt <= 24 * H) {
    const t0 = lastDoseAt, t1 = new Date(prediction.painLikelyBackAt).getTime();
    const atDose = isNum(prediction.features.pain_at_dose) ? Number(prediction.features.pain_at_dose) : Math.min(10, goal + 2);
    const lowAt = t0 + Math.min(45 * 60000, (t1 - t0) * 0.4);
    const goalAt = Math.max(lowAt, t1 - 30 * 60000);
    const at = (t) => localIso(new Date(Math.round(t / 60000) * 60000));
    forecast = [
      { time: at(t0), score: atDose },
      { time: at(lowAt), score: Math.max(0, goal - 1) },
      ...(goalAt > lowAt ? [{ time: at(goalAt), score: goal }] : []),
      { time: at(t1), score: Math.min(10, goal + 1) },
    ];
  }

  // ---------- R2: why + upcoming ----------
  const why = prediction ? explainPrediction(weights, prediction.features, model.offsetHours, new Date(lastDoseAt)) : [];
  const upcoming = calendar
    .filter((e) => /physio/i.test(e.title || "") && new Date(e.start) > NOW && new Date(e.start) - NOW <= 7 * 24 * H)
    .map((e) => ({ time: localIso(new Date(e.start)), title: "Physio" }));

  // ---------- output (docs/API.md) ----------
  const last24h = (t) => NOW - new Date(t) <= 24 * H;
  const painNow = painLog.length ? painLog[painLog.length - 1] : null;
  const status = {
    nextDoseAt: localIso(nextDoseAt),
    doseAllowedNow,
    mgUsed24h,
    mgMax24h: maxMg,
    painLikelyBackAt: prediction ? prediction.painLikelyBackAt : null,
  };
  return {
    patientId,
    patient: { name: rx.name, goal, drug: rx.drug, doseMg, minIntervalH: intervalH, maxMg24h: maxMg },
    now: localIso(NOW),
    painNow: painNow ? { score: Number(painNow.score), at: localIso(new Date(painNow.time)) } : null,
    ...status,
    maxReached,
    reliefHours: prediction ? prediction.predictedHours : reliefHours !== null ? round(reliefHours, 1) : null,
    chart: painLog.filter((p) => last24h(p.time)).map((p) => ({ time: localIso(new Date(p.time)), score: Number(p.score) })),
    doses: asNeeded.filter((d) => last24h(d.time)).map((d) => localIso(new Date(d.time))),
    walks: walkRows.filter((w) => last24h(w.time)).map((w) => ({
      time: localIso(new Date(w.time)), km: isNum(w.km) ? Number(w.km) : null, minutes: Number(w.minutes) })),
    patterns,
    headsUps,
    model: {
      type: "personalized ridge regression",
      personalOffsetMin: Math.round((Number(model.offsetHours) || 0) * 60),
      dosesLearnedFrom: Number(model.dosesLearned) || 0,
    },
    why,
    upcoming,
    forecast,
    status,
    prediction,
  };
}

// R2: what moved "pain likely back" for this dose, compared with an average dose (minutes; < 0 = sooner).
// Ridge is linear, so each feature's effect is exactly coef * (x - mean) / scale hours. Unknown features = average = 0.
// Labels stay the same between refreshes so the app can highlight what changed.
function explainPrediction(weights, f, offsetHours, doseTime) {
  const effect = (names) => names.reduce((s, name) => {
    const i = weights.features.indexOf(name);
    return i < 0 || !isNum(f[name]) ? s : s + weights.coef[i] * ((Number(f[name]) - weights.mean[i]) / weights.scale[i]);
  }, 0);
  const ago = (h) => (h >= 12 ? "12+ h" : h < 1 ? `${Math.round(h * 60)} min` : `${round(h, 1)} h`);
  const hour = localHour(doseTime);
  const timeLabel = hour >= 6 && hour < 12 ? "Morning (6 AM–12 PM)" : hour >= 12 && hour < 18 ? "Afternoon (12–6 PM)"
    : hour >= 18 && hour < 22 ? "Evening (6–10 PM)" : "Night (10 PM–6 AM)";
  const groups = [
    [timeLabel, ["hour_sin", "hour_cos", "evening"]],
    [isNum(f.pain_at_dose) ? `Pain was ${f.pain_at_dose}/10 at your dose` : null, ["pain_at_dose"]],
    [f.walk_km_prev_3h > 0 ? `Walked ${round(f.walk_km_prev_3h, 1)} km before the dose` : "No walk before the dose",
      ["walk_km_prev_3h", "walk_min_prev_3h", "steps_prev_3h"]],
    [f.physio_next_2h ? "Physio soon after your dose" : null, ["physio_next_2h"]],
    [isNum(f.hours_since_meal) ? `Ate ${ago(f.hours_since_meal)} before the dose` : null, ["hours_since_meal"]],
    [isNum(f.hours_since_scheduled_med) ? `Daily medicine ${ago(f.hours_since_scheduled_med)} before` : null,
      ["hours_since_scheduled_med"]],
    ["Weather (pressure, rain, temperature)", ["pressure_change_6h", "temp_c", "precip_mm"]],
  ];
  const items = groups.filter(([label]) => label)
    .map(([label, names]) => ({ label, minutes: Math.round(effect(names) * 60) }))
    .filter((x) => Math.abs(x.minutes) >= 3)
    .sort((a, b) => Math.abs(b.minutes) - Math.abs(a.minutes))
    .slice(0, 4);
  items.push({ label: "Your personal pattern", minutes: Math.round((isNum(offsetHours) ? Number(offsetHours) : 0) * 60) });
  return items;
}

// ---------- helpers ----------
function weatherAt(api, time) {
  const h = api && api.hourly;
  if (!h || !h.time) return {};
  const idx = (t) => h.time.findIndex((x) => Math.abs(new Date(x + "Z") - t) < 30 * 60000);
  const i = idx(time.getTime()), j = idx(time.getTime() - 6 * 3600000);
  if (i < 0) return {};
  return {
    pressureNow: h.pressure_msl[i],
    pressure6hAgo: j >= 0 ? h.pressure_msl[j] : null,
    tempC: h.temperature_2m[i],
    precipMm: h.precipitation[i],
  };
}
function localIso(d) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
  }).formatToParts(d).map((p) => [p.type, p.value]));
  const offset = parts.timeZoneName.replace("GMT", "") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}
function clock(d) {
  return d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}
function median(a) { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function round(x, n) { const k = 10 ** n; return Math.round(x * k) / k; }

if (typeof module !== "undefined") module.exports = { checkRulesAndPredict, localIso };
