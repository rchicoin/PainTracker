// PainPal prediction helpers for n8n Code nodes (plain JavaScript, no imports).
// Paste the functions between the CUT lines into a Code node ("Run Once for All Items").
//
// predictHours(...)   -> hours until pain is likely back above the goal after the last dose
// updateOffset(...)   -> new personal offset after a dose's real relief time is known (B5)
// buildFeatures(...)  -> the 11 model features from the n8n tables + weather
//
// Weather for buildFeatures (Open-Meteo, Vancouver):
//   https://api.open-meteo.com/v1/forecast?latitude=49.26&longitude=-123.25
//     &hourly=pressure_msl,temperature_2m,precipitation&past_days=1&forecast_days=1&timezone=America/Vancouver
//   Use the hour of the dose and the hour 6 h before it.
//
// Synthetic data only. Never changes prescription limits (those are separate IF nodes).

// ----------------------------- CUT: paste from here -----------------------------
const TZ = "America/Vancouver";

/** Local hour of day (0-24, with minutes) in Vancouver for an ISO time. */
function localHour(iso) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(new Date(iso));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return get("hour") + get("minute") / 60;
}

const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 3600000;

/** Hours since the latest event at or before `time` (capped). */
function hoursSinceLast(times, time, cap = 12) {
  const past = times.filter((t) => new Date(t) <= new Date(time));
  if (!past.length) return cap;
  const latest = past.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
  return Math.min(cap, hoursBetween(latest, time));
}

/**
 * doseTime:      ISO time of the as-needed dose
 * painAtDose:    latest pain score at the dose (0-10)
 * walks:         [{ time, km, minutes }]   (time = walk start, from the walks table)
 * scheduledMeds: [ISO times]               (scheduled medication taken, e.g. Baselinol)
 * meals:         [ISO times]
 * weather:       { pressureNow, pressure6hAgo, tempC, precipMm }
 */
function buildFeatures({ doseTime, painAtDose, walks = [], scheduledMeds = [], meals = [], weather }) {
  const hour = localHour(doseTime);
  const recentWalks = walks.filter((w) => {
    const end = new Date(new Date(w.time).getTime() + w.minutes * 60000);
    const h = hoursBetween(end, doseTime);
    return h >= 0 && h < 3; // walk finished in the 3 h before the dose
  });
  return {
    hour_sin: Math.sin((2 * Math.PI * hour) / 24),
    hour_cos: Math.cos((2 * Math.PI * hour) / 24),
    evening: hour >= 18 && hour < 22 ? 1 : 0,
    pain_at_dose: Number(painAtDose),
    walk_km_prev_3h: recentWalks.reduce((s, w) => s + Number(w.km), 0),
    walk_min_prev_3h: recentWalks.reduce((s, w) => s + Number(w.minutes), 0),
    hours_since_scheduled_med: hoursSinceLast(scheduledMeds, doseTime),
    hours_since_meal: hoursSinceLast(meals, doseTime),
    pressure_change_6h: weather.pressureNow - weather.pressure6hAgo,
    temp_c: weather.tempC,
    precip_mm: weather.precipMm,
  };
}

/** Global model only (no personal offset). */
function globalPrediction(weights, features) {
  return weights.features.reduce(
    (h, name, i) => h + weights.coef[i] * ((features[name] - weights.mean[i]) / weights.scale[i]),
    weights.intercept
  );
}

/** Hours of relief for this patient = global model + their personal offset, kept in a sane range. */
function predictHours(weights, features, offsetHours = 0) {
  return Math.min(8, Math.max(0.5, globalPrediction(weights, features) + Number(offsetHours)));
}

/** ISO time when pain is likely back above goal. */
function painLikelyBackAt(doseTime, hours) {
  return new Date(new Date(doseTime).getTime() + hours * 3600000).toISOString();
}

/** B5 learning: after a dose's real relief time is known, nudge the patient's offset. */
function updateOffset(weights, offsetHours, actualHours, features) {
  const { keep, learn } = weights.offsetUpdate || { keep: 0.7, learn: 0.3 };
  return keep * Number(offsetHours) + learn * (actualHours - globalPrediction(weights, features));
}
// ----------------------------- CUT: paste to here -------------------------------

// Example Code node body (after the functions above):
//   const weights = $('Get weights').first().json;          // HTTP Request to raw GitHub ml/weights.json
//   const model = $('Get patient_model').first().json;      // { offsetHours, dosesLearned }
//   const f = buildFeatures({ doseTime, painAtDose, walks, scheduledMeds, meals, weather });
//   const hours = predictHours(weights, f, model.offsetHours);
//   return [{ json: { reliefHours: hours, painLikelyBackAt: painLikelyBackAt(doseTime, hours) } }];

// Self-check: `node ml/predict.js` compares against training_doses.csv using ml/weights.json.
if (typeof require !== "undefined" && require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const weights = JSON.parse(fs.readFileSync(path.join(__dirname, "weights.json"), "utf8"));
  const [head, ...lines] = fs.readFileSync(path.join(__dirname, "..", "data", "training_doses.csv"), "utf8").trim().split("\n");
  const cols = head.split(",");
  const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v]))).filter((r) => r.censored === "0");
  const err = rows.reduce((s, r) => {
    const f = Object.fromEntries(weights.features.map((n) => [n, Number(r[n])]));
    return s + Math.abs(globalPrediction(weights, f) - Number(r.relief_hours));
  }, 0) / rows.length;
  console.log(`JS global model on ${rows.length} observed doses: average error ${(err * 60).toFixed(1)} min`);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(new Date("2026-11-15T23:30:00Z")).find((p) => p.type === "timeZoneName").value;
  console.log(`Vancouver hour check: 23:30 UTC -> ${localHour("2026-11-15T23:30:00Z")} local (${offset})`);
}
