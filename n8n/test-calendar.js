// Tests the Calendar sync Code node with fake Google Calendar events, then checks that a synced physio
// appointment changes /dashboard (B6): shorter predicted relief + a physio heads-up. Usage: node n8n/test-calendar.js
const fs = require("fs");
const path = require("path");

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
const cal = load("PainPal-Calendar-sync.json");
const b6 = load("PainPal-B6-dashboard.json");
const codeOf = (wf, name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) =>
    [cols[i], v === "" ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));
}
const TABLES = ["prescription", "doses", "pain_log", "meals", "walks", "schedule", "patient_model"];
const db = Object.fromEntries(TABLES.map((t) => [t, readCsv(path.join(__dirname, "seed", `${t}.csv`))]));
const wrap = (rows) => rows.map((json) => ({ json }));
const run = (code, outputs) => new Function("$", "$input", code)(
  (n) => ({ all: () => outputs[n], first: () => outputs[n][0] }), { all: () => [], first: () => ({ json: {} }) });

// the last as-needed dose in the seed data, and "now" 10 min after it
const lastDose = db.doses.filter((d) => d.kind === "as-needed").slice(-1)[0];
const doseAt = new Date(lastDose.time);
const now = new Date(doseAt.getTime() + 10 * 60000);
const iso = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
const physioStart = iso(doseAt.getTime() + 60 * 60000); // physio 1 h after the dose

// 1) calendar sync
const googleEvents = [
  { summary: "Physio with Dr. Lee", start: { dateTime: physioStart }, end: { dateTime: iso(doseAt.getTime() + 105 * 60000) } },
  { summary: "Physio with Dr. Lee", start: { dateTime: physioStart }, end: { dateTime: physioStart } }, // duplicate
  { summary: "Dentist", start: { dateTime: physioStart } },                                            // not physio
  { summary: "physio (all day)", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } },
  { summary: db.schedule[0].title, start: { dateTime: db.schedule[0].start } },                        // already saved
];
const newRows = run(codeOf(cal, "New physio events"), {
  "Google Calendar: physio events": wrap(googleEvents), "Get schedule": wrap(db.schedule),
}).map((i) => i.json);
console.log(`Calendar sync: ${googleEvents.length} events from Google -> ${newRows.length} new rows:`);
newRows.forEach((r) => console.log(`  ${JSON.stringify(r)}`));
const empty = run(codeOf(cal, "New physio events"), { "Google Calendar: physio events": [{ json: {} }], "Get schedule": wrap(db.schedule) });
console.log(`No events in the calendar -> ${empty.length} rows (workflow stops, nothing breaks)`);

// 2) does /dashboard use it?
function dashboard(schedule) {
  const out = Object.fromEntries(TABLES.map((t) => [`Get ${t}`, wrap(t === "schedule" ? schedule : db[t])]));
  out["Get weather (Open-Meteo)"] = [{ json: {} }];
  out.Webhook = [{ json: { query: { patientId: "P001", now: now.toISOString() } } }];
  return run(codeOf(b6, "Compute status"), out)[0].json;
}
const before = dashboard(db.schedule);
const after = dashboard([...db.schedule, ...newRows]);
console.log(`\n/dashboard for the dose at ${lastDose.time}:`);
console.log(`  without the physio event: relief ${before.reliefHours} h, pain likely back ${before.painLikelyBackAt}, physio feature ${before.prediction.features.physio_next_2h}`);
console.log(`  with physio 1 h after it: relief ${after.reliefHours} h, pain likely back ${after.painLikelyBackAt}, physio feature ${after.prediction.features.physio_next_2h}`);
console.log(`  heads-ups: ${JSON.stringify(after.headsUps.filter((h) => /physio/i.test(h)))}`);
