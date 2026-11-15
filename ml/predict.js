// PainPal prediction helpers (plain JavaScript, no imports).
// n8n/build.js copies the part between the CUT lines into the B3 Code node, so edit it here.
//
// predictHours(...)   -> hours until pain is likely back above the goal after the last dose
// updateOffset(...)   -> new personal offset after a dose's real relief time is known (B5)
// buildFeatures(...)  -> the model features from the n8n tables + weather + calendar
//
// Missing inputs are fine: a feature that is null/unknown is set to the training average,
// so it has no effect on the prediction (e.g. manual walks with km = null, no weather, no step counter).
//
// Synthetic data only. Never changes prescription limits (those are separate rules/IF nodes).

// ----------------------------- CUT: start -----------------------------
const TZ = "America/Vancouver";
const MIN_PER_KM = 16;          // average pace: estimates km for manual walks (km = null)
const HOUSEHOLD_STEPS_3H = 750; // steps in 3 h without a walk (no step counter in the app yet)
const STEPS_PER_KM = 1300;

const toDate = (t) => (t instanceof Date ? t : new Date(t));
const hoursBetween = (a, b) => (toDate(b) - toDate(a)) / 3600000;
const isNum = (x) => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x));

/** Local hour of day (0-24, with minutes) in Vancouver. */
function localHour(t) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(toDate(t));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get("hour") + get("minute") / 60;
}

/** Hours since the latest event at or before `time`; null if none in the last 24 h (unknown). */
function hoursSinceLast(times, time, cap = 12) {
  const h = times.map((t) => hoursBetween(t, time)).filter((x) => x >= 0 && x <= 24);
  return h.length ? Math.min(cap, Math.min(...h)) : null;
}

/** km for a walk: GPS distance, or estimated from minutes for manual walks (km = null). */
function walkKm(w) {
  return isNum(w.km) ? Number(w.km) : Number(w.minutes || 0) / MIN_PER_KM;
}

/**
 * doseTime:      time of the as-needed dose
 * painAtDose:    pain score at the dose (0-10), or null
 * walks:         [{ time, km|null, minutes }]  (time = walk start)
 * steps:         steps in the 3 h before the dose, or null (estimated from walks)
 * calendar:      [{ start, title }]            (from Google Calendar / schedule table)
 * scheduledMeds: [times]                       (scheduled medication taken)
 * meals:         [times]
 * weather:       { pressureNow, pressure6hAgo, tempC, precipMm } (any may be null)
 */
function buildFeatures({ doseTime, painAtDose = null, walks = [], steps = null, calendar = [],
  scheduledMeds = [], meals = [], weather = {} }) {
  const hour = localHour(doseTime);
  const recent = walks.filter((w) => {
    const end = new Date(toDate(w.time).getTime() + Number(w.minutes || 0) * 60000);
    const h = hoursBetween(end, doseTime);
    return h >= 0 && h < 3; // walk finished in the 3 h before the dose
  });
  const km = recent.reduce((s, w) => s + walkKm(w), 0);
  const physioSoon = calendar.some((e) => /physio/i.test(e.title || "") &&
    hoursBetween(doseTime, e.start) >= 0 && hoursBetween(doseTime, e.start) < 2);
  const w = weather || {};
  return {
    hour_sin: Math.sin((2 * Math.PI * hour) / 24),
    hour_cos: Math.cos((2 * Math.PI * hour) / 24),
    evening: hour >= 18 && hour < 22 ? 1 : 0,
    pain_at_dose: isNum(painAtDose) ? Number(painAtDose) : null,
    walk_km_prev_3h: km,
    walk_min_prev_3h: recent.reduce((s, x) => s + Number(x.minutes || 0), 0),
    steps_prev_3h: isNum(steps) ? Number(steps) : HOUSEHOLD_STEPS_3H + km * STEPS_PER_KM,
    physio_next_2h: physioSoon ? 1 : 0,
    hours_since_scheduled_med: hoursSinceLast(scheduledMeds, doseTime),
    hours_since_meal: hoursSinceLast(meals, doseTime),
    pressure_change_6h: isNum(w.pressureNow) && isNum(w.pressure6hAgo) ? w.pressureNow - w.pressure6hAgo : null,
    temp_c: isNum(w.tempC) ? Number(w.tempC) : null,
    precip_mm: isNum(w.precipMm) ? Number(w.precipMm) : null,
  };
}

/** Global model only (no personal offset). Unknown features count as average (no effect). */
function globalPrediction(weights, features) {
  return weights.features.reduce((h, name, i) => {
    const x = isNum(features[name]) ? Number(features[name]) : weights.mean[i];
    return h + weights.coef[i] * ((x - weights.mean[i]) / weights.scale[i]);
  }, weights.intercept);
}

/** Hours of relief for this patient = global model + their personal offset, kept in a sane range. */
function predictHours(weights, features, offsetHours = 0) {
  const offset = isNum(offsetHours) ? Number(offsetHours) : 0;
  return Math.min(8, Math.max(0.5, globalPrediction(weights, features) + offset));
}

/** B5 learning: after a dose's real relief time is known, nudge the patient's offset. */
function updateOffset(weights, offsetHours, actualHours, features) {
  const { keep, learn } = weights.offsetUpdate || { keep: 0.7, learn: 0.3 };
  const offset = isNum(offsetHours) ? Number(offsetHours) : 0;
  return keep * offset + learn * (actualHours - globalPrediction(weights, features));
}
// ----------------------------- CUT: end -------------------------------

if (typeof module !== "undefined") {
  module.exports = { buildFeatures, globalPrediction, predictHours, updateOffset, localHour, walkKm };
}

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
  const blank = buildFeatures({ doseTime: "2026-11-15T21:30:00Z", walks: [{ time: "2026-11-15T19:00:00Z", km: null, minutes: 32 }] });
  console.log(`Manual walk (km null, 32 min) -> walk_km_prev_3h ${blank.walk_km_prev_3h}, steps ${blank.steps_prev_3h}; ` +
    `no weather -> prediction ${predictHours(weights, blank).toFixed(2)} h (no crash, no NaN)`);
}
