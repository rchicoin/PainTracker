// Runs the real Code-node JavaScript of B7 (heads-ups) and B9 (error alerts) against n8n/seed/*.csv.
// Usage: node n8n/test-b7-b9.js
const fs = require("fs");
const path = require("path");

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
const b7 = load("PainPal-B7-heads-ups.json");
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

function b7Run({ demo, alertsSent = [], now = null }) {
  const out = Object.fromEntries(TABLES.map((t) => [`Get ${t}`, wrap(db[t])]));
  out["Get weather (Open-Meteo)"] = [{ json: {} }];
  const settings = run(withEmail(codeOf(b7, "Settings")), out, [{ json: demo ? { demo: true } : {} }]);
  if (now) settings[0].json.now = now;
  out.Settings = settings;
  out["Compute status"] = run(codeOf(b7, "Compute status"), out, []);
  out["Get alerts"] = wrap(alertsSent);
  return run(codeOf(b7, "Decide heads-ups"), out, []).map((i) => i.json);
}

let threw = null;
try { run(codeOf(b7, "Settings"), {}, [{ json: {} }]); } catch (e) { threw = e.message; }
console.log(`Settings with placeholder email -> error: "${threw}"`);

const demo = b7Run({ demo: true });
console.log(`\nDemo mode -> ${demo.length} email(s):`);
demo.forEach((a) => console.log(`  [${a.key}] ${a.subject}\n    ${a.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`));

const pains = db.pain_log;
const later = new Date(new Date(pains[pains.length - 1].time).getTime() + 13 * 3600000).toISOString(); // next day, no logs for hours
const normal = b7Run({ demo: false, now: later });
console.log(`\nNormal run next morning (no pain log for hours) -> ${normal.map((a) => a.key).join(", ") || "nothing"}`);
const again = b7Run({ demo: false, now: later, alertsSent: normal.map((a) => ({ patientId: "P001", key: a.key })) });
console.log(`Same run again (already sent) -> ${again.map((a) => a.key).join(", ") || "nothing (deduplicated)"}`);

const err = run(withEmail(codeOf(b9, "Settings")), {}, [{ json: {
  workflow: { name: "PainPal · B4 · POST /log" },
  execution: { lastNodeExecuted: "Insert pain_log", url: "https://team17.app.n8n.cloud/execution/1", error: { message: "Table <x> not found" } },
} }])[0].json;
console.log(`\nB9 error email -> ${err.subject}\n  ${err.html}`);
