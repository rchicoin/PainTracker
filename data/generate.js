// Synthetic dataset generator for PainPal.
// FICTIONAL patients and FICTIONAL drugs ("Baselinol", "DemoRelief"). Not real data, not medical advice.
//
// Inputs we simulate are only what the app / n8n can collect:
//   walks (GPS km + minutes, never coordinates; manual walks have minutes only), step counts,
//   pain logs, medication times, meal times, weather, and calendar events (physio, planned walks)
//   that n8n reads from Google Calendar.
//
// Usage:
//   node data/generate.js                              # history ends now
//   node data/generate.js --now 2026-11-15T09:00       # history ends at this local Vancouver time
//   node data/generate.js --days 21 --patients 30 --seed 17
//
// Same --seed gives the same patients, doses and weather; --now only shifts the dates.
// Writes CSVs next to this file (see data/README.md).

const fs = require("fs");
const path = require("path");

// ---------- settings ----------
const args = parseArgs(process.argv.slice(2));
const DAYS = Number(args.days || 21);
const N_PATIENTS = Number(args.patients || 30);
const SEED = Number(args.seed || 17);
const TZ = vancouverOffset(); // e.g. "-07:00" (BC uses year-round daylight time), read from the tz database
const NOW = args.now ? parseLocal(args.now) : localNow();
const OUT = __dirname;

// Day 0 starts at local midnight, DAYS-1 days before NOW's date.
const DAY0 = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() - (DAYS - 1)));
const NOW_MIN = Math.floor((NOW - DAY0) / 60000); // simulation clock: minutes since DAY0 (local wall time)

// ---------- the "true" relief model we hide in the data ----------
// Hours until pain rises above the patient's goal after an as-needed dose.
// The ML model in ml/ has to rediscover these effects.
function trueReliefHours(f, personalOffset, rand) {
  let h = 3.9;
  h -= 0.6 * f.evening;                    // evenings are harder
  h -= 0.15 * (f.pain_at_dose - 5);        // higher pain at dose -> shorter relief
  h -= 0.4 * f.trueKm;                     // walking before the dose (real distance)
  h -= 0.006 * f.walk_min_prev_3h;         // ...and time spent walking
  h -= 0.00015 * f.steps_prev_3h;          // general movement (steps)
  h -= 0.8 * f.physio_next_2h;             // physio on the calendar soon after the dose
  h -= 0.05 * f.hours_since_scheduled_med; // late / missed Baselinol
  h -= 0.04 * f.hours_since_meal;          // skipped meals
  h += 0.08 * f.pressure_change_6h;        // falling pressure (negative) -> shorter relief
  h += 0.03 * (f.temp_c - 7);              // colder -> shorter relief
  h -= 0.15 * f.precip_mm;                 // rain -> shorter relief
  h += personalOffset;                     // each patient is different (this is what n8n learns)
  h += rand.normal(0, 0.65);               // day-to-day noise
  return clamp(h, 1, 7);
}

// ---------- fictional patients ----------
const FIRST = ["Sam", "Alex", "Jordan", "Riley", "Casey", "Morgan", "Taylor", "Jamie", "Quinn", "Avery",
  "Rowan", "Skyler", "Drew", "Parker", "Reese", "Emerson", "Hayden", "Kai", "Logan", "Sage",
  "Charlie", "Dakota", "Finley", "Harper", "Jesse", "Kendall", "Lee", "Marlowe", "Noel", "Robin"];
const LAST = ["Demo", "Sample", "Example", "Testwell", "Mockford", "Placeholder", "Fictional", "Synth"];
const MIN_PER_KM = 16; // average walking pace, used to estimate km for manual walks (minutes only)

function makePatients(rand) {
  const patients = [];
  for (let i = 0; i < N_PATIENTS; i++) {
    const id = "P" + String(i + 1).padStart(3, "0");
    const interval = rand.pick([4, 4, 4, 3, 6]);
    const doseMg = rand.pick([5, 5, 10]);
    patients.push({
      patientId: id,
      name: i === 0 ? "Sam Demo" : `${FIRST[i % FIRST.length]} ${rand.pick(LAST)}`,
      goal: i === 0 ? 3 : rand.pick([2, 3, 3, 4]),
      drug: "DemoRelief (fictional)",
      doseMg: i === 0 ? 5 : doseMg,
      minIntervalH: i === 0 ? 4 : interval,
      maxMg24h: i === 0 ? 20 : doseMg * (interval === 3 ? 5 : 4),
      email: `${id.toLowerCase()}@example.com`,
      offset: i === 0 ? -0.4 : rand.normal(0, 0.6), // hidden personal effect (hours)
      riseRate: rand.uniform(0.8, 1.4),             // pain points per hour once relief wears off
      walker: rand.uniform(0.3, 1.0),               // how often they walk
      physioDays: rand.pick([[0, 2, 4], [1, 3], [0, 3, 5], [1, 4]]), // day index % 7
      physioHour: rand.pick([10, 14, 15]),
    });
  }
  return patients;
}

// ---------- weather (shared, Vancouver-ish, hourly) ----------
function makeWeather(rand) {
  const ph1 = rand.uniform(0, 6.28), ph2 = rand.uniform(0, 6.28);
  const pressureAt = (hour) =>
    1013 + 9 * Math.sin((2 * Math.PI * hour) / (24 * 3.3) + ph1) + 4 * Math.sin((2 * Math.PI * hour) / (24 * 1.7) + ph2);
  const rows = [];
  for (let h = 0; h < DAYS * 24; h++) {
    const p = pressureAt(h);
    const temp = 7 + 3 * Math.sin((2 * Math.PI * ((h % 24) - 9)) / 24) - (1013 - p) * 0.05;
    const precip = p < 1008 && rand.next() < 0.6 ? rand.uniform(0.2, 3) : 0;
    rows.push({ time: iso(h * 60), pressureHpa: round(p, 1), tempC: round(temp, 1), precipMm: round(precip, 1) });
  }
  return { rows, pressureAt, at: (m) => rows[clamp(Math.floor(m / 60), 0, rows.length - 1)] };
}

// ---------- one patient's history ----------
function simulatePatient(p, weather, rand) {
  const meds = [], meals = [], walks = [], pain = [], training = [], calendar = [];
  const doses = []; // as-needed doses, minutes
  const days = [];

  // 1) daily routine: wake/bed, scheduled Baselinol, meals, walks, calendar (physio + planned walks)
  for (let d = 0; d < DAYS; d++) {
    const day = d * 1440;
    days.push({ wake: day + 7 * 60 + rand.int(0, 60), bed: day + 22 * 60 + rand.int(0, 60) });

    for (const hr of [8, 14, 20]) {
      const r = rand.next();
      if (r < 0.08) continue; // missed
      const late = r < 0.23 ? rand.int(60, 180) : rand.int(-20, 20);
      meds.push({ t: day + hr * 60 + late, drug: "Baselinol (fictional)", mg: 500, kind: "scheduled" });
    }
    for (const [meal, hr, skip] of [["breakfast", 8.25, 0.1], ["lunch", 12.5, 0.2], ["dinner", 18.5, 0.08]]) {
      if (rand.next() < skip) continue;
      meals.push({ t: day + Math.round(hr * 60) + rand.int(-30, 45), meal });
    }
    const nWalks = rand.next() < p.walker ? (rand.next() < 0.35 ? 2 : 1) : 0;
    for (let w = 0; w < nWalks; w++) {
      const km = round(rand.uniform(0.3, 2.5), 2);
      const t = day + rand.int(9 * 60 + 30, 19 * 60 + 30);
      const minutes = Math.round(km * rand.uniform(12, 20));
      const source = rand.pick(["auto", "auto", "manual"]);
      // manual walks have no GPS distance: the app sends km = null
      walks.push({ t, trueKm: km, km: source === "auto" ? km : null, minutes, source });
      if (rand.next() < 0.4) calendar.push({ t, end: t + minutes, title: "Walk" });
    }
    if (p.physioDays.includes(d % 7)) {
      const t = day + p.physioHour * 60;
      calendar.push({ t, end: t + 45, title: "Physio session" });
    }
  }
  calendar.sort((a, b) => a.t - b.t);
  const kmOf = (w) => (w.km ?? w.minutes / MIN_PER_KM); // same estimate n8n uses
  walks.sort((a, b) => a.t - b.t);
  meds.sort((a, b) => a.t - b.t);
  meals.sort((a, b) => a.t - b.t);

  // helpers for features (only things known at the time of the dose)
  const hoursSince = (list, t, cap) => {
    let last = null;
    for (const e of list) { if (e.t <= t) last = e; else break; }
    return last ? Math.min(cap, (t - last.t) / 60) : cap;
  };
  const walksPrev3h = (t) => walks.filter((w) => w.t + w.minutes <= t && w.t + w.minutes > t - 180);
  const nextAllowed = (t) => {
    let c = doses.length ? Math.max(t, doses[doses.length - 1] + p.minIntervalH * 60) : t;
    for (;;) {
      const inWindow = doses.filter((x) => x > c - 1440 && x <= c);
      if ((inWindow.length + 1) * p.doseMg <= p.maxMg24h) return c;
      c = inWindow[0] + 1440;
    }
  };
  const logPain = (t, score, note = "") => {
    if (t <= NOW_MIN) pain.push({ t, score: clamp(Math.round(score), 0, 10), note });
  };

  // 2) as-needed doses through each day
  const reliefWindows = []; // [doseTime, returnTime] while pain is at/below goal
  for (let d = 0; d < DAYS; d++) {
    const { wake, bed } = days[d];
    if (wake > NOW_MIN) break;
    let want = wake;
    let p0 = p.goal + rand.int(2, 4); // morning stiffness
    let note = rand.next() < 0.3 ? "woke up stiff" : "";

    for (;;) {
      const allowed = nextAllowed(want);
      if (allowed - want > 30) { logPain(want + 15, Math.min(9, p0 + 1), "waiting for next allowed dose"); note = ""; }
      const t = Math.max(want, allowed);
      if (t >= bed || t > NOW_MIN) break;
      const painAtDose = clamp(Math.round(p0 + (p.riseRate * (t - want)) / 60), p.goal + 1, 9);

      const hour = (t % 1440) / 60;
      const recent = walksPrev3h(t);
      const wx = weather.at(t);
      const f = {
        hour_sin: round(Math.sin((2 * Math.PI * hour) / 24), 4),
        hour_cos: round(Math.cos((2 * Math.PI * hour) / 24), 4),
        evening: hour >= 18 && hour < 22 ? 1 : 0,
        pain_at_dose: painAtDose,
        walk_km_prev_3h: round(recent.reduce((s, w) => s + kmOf(w), 0), 2),
        walk_min_prev_3h: recent.reduce((s, w) => s + w.minutes, 0),
        // the app has no step counter yet, so steps = household baseline + walking (n8n estimates the same way)
        steps_prev_3h: Math.round(rand.uniform(150, 350) * 3 + recent.reduce((s, w) => s + w.trueKm * 1300, 0)),
        physio_next_2h: calendar.some((e) => /physio/i.test(e.title) && e.t >= t && e.t < t + 120) ? 1 : 0,
        hours_since_scheduled_med: round(hoursSince(meds, t, 12), 2),
        hours_since_meal: round(hoursSince(meals, t, 12), 2),
        pressure_change_6h: round(weather.pressureAt(t / 60) - weather.pressureAt(t / 60 - 6), 2),
        temp_c: wx.tempC,
        precip_mm: wx.precipMm,
      };
      const relief = trueReliefHours({ ...f, trueKm: recent.reduce((s, w) => s + w.trueKm, 0) }, p.offset, rand);
      const ret = t + Math.round(relief * 60);

      doses.push(t);
      logPain(t, painAtDose, note);
      note = "";
      const nadir = Math.max(0, p.goal - rand.int(1, 2));
      if (t + 60 < Math.min(ret, bed)) logPain(t + rand.int(45, 75), nadir);

      const observed = ret <= bed && ret <= NOW_MIN;
      training.push({ patient_id: p.patientId, dose_time: iso(t), ...f,
        relief_hours: observed ? round(relief, 2) : "", censored: observed ? 0 : 1 });
      reliefWindows.push([t, observed ? ret : Math.min(bed, NOW_MIN)]);
      if (!observed) break;

      logPain(ret, p.goal + 1); // pain back above goal: this is what n8n learns from
      want = ret + rand.int(0, 45);
      p0 = p.goal + 1 + ((p.riseRate * (want - ret)) / 60) * (f.evening ? 1.3 : 1);
    }
  }

  // 3) a pain log ~1 h after longer walks (shows the "walks raise pain" pattern)
  for (const w of walks) {
    const t = w.t + w.minutes + rand.int(45, 90);
    const inRelief = reliefWindows.some(([a, b]) => t >= a && t < b);
    const bump = Math.round(0.9 * w.trueKm);
    if (bump < 1 || inRelief) continue; // during relief pain stays at/below goal by definition
    logPain(t, Math.min(9, p.goal + 1 + bump), "after walk");
  }

  // 4) output rows; every pain log carries the weather for that hour
  pain.sort((a, b) => a.t - b.t);
  const done = (list) => list.filter((e) => e.t <= NOW_MIN);
  const id = p.patientId;
  return {
    pain: pain.map((e) => ({ patientId: id, time: iso(e.t), score: e.score, note: e.note,
      ...pick(weather.at(e.t), ["pressureHpa", "tempC", "precipMm"]) })),
    meds: [
      ...done(meds).map((e) => ({ patientId: id, time: iso(e.t), drug: e.drug, mg: e.mg, kind: e.kind })),
      ...doses.map((t) => ({ patientId: id, time: iso(t), drug: p.drug, mg: p.doseMg, kind: "as-needed" })),
    ].sort((a, b) => a.time.localeCompare(b.time)),
    meals: done(meals).map((e) => ({ patientId: id, time: iso(e.t), meal: e.meal })),
    walks: walks.filter((w) => w.t + w.minutes <= NOW_MIN)
      .map((e) => ({ patientId: id, time: iso(e.t), km: e.km, minutes: e.minutes, source: e.source })),
    // calendar runs into the future too (it's a plan), like Google Calendar would
    schedule: calendar.map((e) => ({ patientId: id, start: iso(e.t), end: iso(e.end), title: e.title })),
    training,
  };
}

// ---------- main ----------
const rand = makeRand(SEED);
const patients = makePatients(rand);
const weather = makeWeather(rand);
const all = { pain: [], meds: [], meals: [], walks: [], schedule: [], training: [] };
for (const p of patients) {
  const r = simulatePatient(p, weather, makeRand(SEED * 1000 + Number(p.patientId.slice(1))));
  for (const k of Object.keys(all)) all[k].push(...r[k]);
}

writeCsv("prescription.csv", patients.map((p) => pick(p, ["patientId", "name", "goal", "drug", "doseMg", "minIntervalH", "maxMg24h", "email"])));
writeCsv("pain_log.csv", all.pain);
writeCsv("medications.csv", all.meds);
writeCsv("meals.csv", all.meals);
writeCsv("walks.csv", all.walks);
writeCsv("schedule.csv", all.schedule);
writeCsv("weather.csv", weather.rows.filter((w) => w.time <= iso(NOW_MIN)));
writeCsv("training_doses.csv", all.training);

const obs = all.training.filter((r) => r.censored === 0);
const meanRelief = obs.reduce((s, r) => s + r.relief_hours, 0) / obs.length;
console.log(`History: ${iso(0)} -> ${iso(NOW_MIN)} (${DAYS} days, ${N_PATIENTS} patients, seed ${SEED})`);
console.log(`training_doses.csv: ${all.training.length} doses, ${all.training.length - obs.length} censored, mean relief ${meanRelief.toFixed(2)} h`);
console.log(`pain_log.csv: ${all.pain.length} rows | medications.csv: ${all.meds.length} | meals: ${all.meals.length} | walks: ${all.walks.length}`);
console.log(`Demo patient P001: ${all.pain.filter((r) => r.patientId === "P001").length} pain logs, ` +
  `${all.training.filter((r) => r.patient_id === "P001").length} as-needed doses`);

// ---------- small helpers ----------
function makeRand(seed) {
  let a = seed >>> 0; // mulberry32
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    normal: (mu, sd) => mu + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
  };
}
function iso(min) { return new Date(DAY0.getTime() + min * 60000).toISOString().slice(0, 16) + ":00" + TZ; }
function parseLocal(s) { const [d, t = "00:00"] = s.split("T"); const [y, m, dd] = d.split("-").map(Number); const [hh, mm] = t.split(":").map(Number); return new Date(Date.UTC(y, m - 1, dd, hh, mm)); }
function vancouverOffset() {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", timeZoneName: "longOffset" })
    .formatToParts(new Date()).find((p) => p.type === "timeZoneName").value; // "GMT-07:00"
  return name.replace("GMT", "") || "+00:00";
}
function localNow() { const [h, m] = TZ.slice(1).split(":").map(Number); const sign = TZ[0] === "-" ? -1 : 1;
  const n = new Date(Date.now() + sign * (h * 60 + m) * 60000); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), n.getUTCHours(), n.getUTCMinutes())); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round(x, n) { const k = 10 ** n; return Math.round(x * k) / k; }
function pick(o, keys) { const r = {}; for (const k of keys) r[k] = o[k]; return r; }
function parseArgs(a) { const r = {}; for (let i = 0; i < a.length; i += 2) r[a[i].replace(/^--/, "")] = a[i + 1]; return r; }
function writeCsv(name, rows) {
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  fs.writeFileSync(path.join(OUT, name), [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n");
}
