// Runs the real Code-node JavaScript of B7 (email updates) and B9 (error alerts) against n8n/seed/*.csv.
// Usage: node n8n/test-b7-b9.js
const fs = require("fs");
const path = require("path");

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
const b7 = load("PainPal-B7-email-updates.json");
const b9 = load("PainPal-B9-error-alerts.json");
const codeOf = (wf, name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const withEmail = (c) => c.replace("const SEND_TO = 'you@example.com';", "const SEND_TO = 'team@example.org';");

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) =>
    [cols[i], v === "" ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));
}
const TABLES = ["prescription", "doses", "pain_log", "meals", "walks", "schedule", "patient_model"];
const db = Object.fromEntries(TABLES.map((t) => [t, readCsv(path.join(__dirname, "seed", `${t}.csv`))]));
const wrap = (rows) => rows.map((json) => ({ json }));
const run = (code, outputs, input) => new Function("$", "$input", code)(
  (n) => ({ all: () => outputs[n], first: () => outputs[n][0] }), { all: () => input, first: () => input[0] });
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// "now" = 10 min after the last seeded pain log (so "today" has data)
const lastPain = new Date(db.pain_log[db.pain_log.length - 1].time);
const NOW = new Date(lastPain.getTime() + 10 * 60000).toISOString();

function emailsFor(mode, { alertsSent = [], now = NOW, predictions = [] } = {}) {
  const out = Object.fromEntries(TABLES.map((t) => [`Get ${t}`, wrap(db[t])]));
  out["Get weather (Open-Meteo)"] = [{ json: {} }];
  out.Settings = run(withEmail(codeOf(b7, "Settings")), out, [{ json: { mode } }]);
  out.Settings[0].json.now = now;
  out["Compute status"] = run(codeOf(b7, "Compute status"), out, []);
  out["Get predictions"] = wrap(predictions);
  out["Get alerts"] = wrap(alertsSent);
  return run(codeOf(b7, "Decide emails"), out, []).map((i) => i.json);
}

let threw = null;
try { run(codeOf(b7, "Settings"), {}, [{ json: {} }]); } catch (e) { threw = e.message; }
console.log(`Settings with placeholder email -> error: "${threw}"`);

const learnedToday = [{ patientId: "P001", doseTime: db.doses.filter((d) => d.kind === "as-needed").slice(-2)[0].time,
  predictedHours: 2.1, actualHours: 2.6, error: 0.5 }];
const demo = emailsFor("demo", { predictions: learnedToday });
console.log(`\nDemo button -> ${demo.length} email(s):`);
demo.forEach((e) => console.log(`  [${e.key}] ${e.subject}\n    ${text(e.html)}`));

const daily = emailsFor("daily");
console.log(`\n8 PM daily -> ${daily.map((e) => e.key).join(", ")}`);
console.log(`8 PM daily again (already sent) -> ${emailsFor("daily", { alertsSent: daily.map((e) => ({ patientId: "P001", key: e.key })) }).length} email(s)`);

const quiet = emailsFor("headsups", { now: new Date(lastPain.getTime() + 13 * 3600000).toISOString() });
console.log(`Every-30-min check next morning -> ${quiet.map((e) => e.key).join(", ") || "nothing to send"} (no daily update outside 8 PM)`);

const err = run(withEmail(codeOf(b9, "Settings")), {}, [{ json: {
  workflow: { name: "PainPal · B4 · POST /log" },
  execution: { lastNodeExecuted: "Insert pain_log", url: "https://team17.app.n8n.cloud/execution/1", error: { message: "Table <x> not found" } },
} }])[0].json;
console.log(`\nB9 error email -> ${err.subject}\n  ${err.html}`);
