// Runs the real Code-node JavaScript from the B4 (/log) and B6 (/dashboard) workflow files
// against n8n/seed/*.csv, with a fake `$` / `$input` like n8n's. Usage: node n8n/test-api.js
const fs = require("fs");
const path = require("path");

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
const b4 = load("PainPal-B4-log.json");
const b6 = load("PainPal-B6-dashboard.json");
const r3 = load("PainPal-R3-demo-clock.json");
const codeOf = (wf, name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) =>
    [cols[i], v === "" ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));
}
const TABLES = ["prescription", "doses", "pain_log", "meals", "walks", "schedule", "patient_model"];
const db = Object.fromEntries(TABLES.map((t) => [t, readCsv(path.join(__dirname, "seed", `${t}.csv`))]));
db.predictions = [];
db.demo_clock = []; // R3: empty = real time

function runCode(code, outputs, input) {
  const items = (name) => {
    if (!(name in outputs)) throw new Error(`node "${name}" has no output in this test`);
    return outputs[name];
  };
  const $ = (name) => ({ all: () => items(name), first: () => items(name)[0] });
  const $input = { all: () => input, first: () => input[0] };
  return new Function("$", "$input", code)($, $input);
}
const wrap = (rows) => rows.map((json) => ({ json }));
const tableOutputs = () => Object.fromEntries(TABLES.map((t) => [`Get ${t}`, wrap(db[t])]));
const weatherDown = { "Get weather (Open-Meteo)": [{ json: { error: "timeout" } }] };

// Simulates POST /log through the workflow: check -> row -> insert -> compute status -> reply
function postLog(body, weatherNow = { current: { temperature_2m: 8.1, pressure_msl: 1004.2, precipitation: 0.4 } }) {
  const webhookItem = [{ json: { body } }];
  const check = runCode(codeOf(b4, "Check request"), { Webhook: webhookItem, "Get demo_clock": wrap(db.demo_clock) }, []);
  if (!check[0].json.valid) return { status: 400, body: { ok: false, message: check[0].json.error } };
  const out = { "Check request": check };
  const type = check[0].json.type;
  const rowInput = type === "pain" ? [{ json: weatherNow }] : type === "dose" ? wrap(db.prescription) : [{ json: {} }];
  const row = runCode(codeOf(b4, `${type[0].toUpperCase()}${type.slice(1)} row`), out, rowInput)[0].json;
  db[{ pain: "pain_log", dose: "doses", meal: "meals", walk: "walks", physio: "schedule" }[type]].push(row); // Insert node
  Object.assign(out, tableOutputs(), weatherDown);
  out["Compute status"] = runCode(codeOf(b4, "Compute status"), out, []);
  out["Get predictions"] = wrap(db.predictions);
  out["B5: learn from last dose"] = runCode(codeOf(b4, "B5: learn from last dose"), out, []);
  const learned = out["B5: learn from last dose"][0].json;
  if (learned.learn) { // Update patient_model + Insert predictions nodes
    const modelRow = runCode(codeOf(b4, "Model row"), out, [])[0].json;
    db.patient_model = db.patient_model.map((r) => (r.patientId === modelRow.patientId ? { ...r, ...modelRow } : r));
    db.predictions.push(runCode(codeOf(b4, "Prediction row"), out, [])[0].json);
  }
  const reply = runCode(codeOf(b4, "Build reply"), out, out["Compute status"]);
  return { status: 200, body: reply[0].json, row };
}

const show = (label, r) => console.log(`\n${label} -> ${r.status}\n  ${JSON.stringify(r.body)}${r.row ? `\n  saved: ${JSON.stringify(r.row)}` : ""}`);

show("pain 6", postLog({ patientId: "P001", type: "pain", score: 6, note: "after stairs" }));
show("pain 9 (severe)", postLog({ patientId: "P001", type: "pain", score: 9 }));
show("dose (24 h max already reached in seed data)", postLog({ patientId: "P001", type: "dose" }));
show("meal", postLog({ patientId: "P001", type: "meal", meal: "lunch" }));
show("walk GPS", postLog({ patientId: "P001", type: "walk", km: 1.234, minutes: 18, source: "auto" }));
show("walk manual km null", postLog({ patientId: "P001", type: "walk", km: null, minutes: 25, source: "manual" }));
show("pain, weather API down", postLog({ patientId: "P001", type: "pain", score: 4 }, { error: "down" }));
show("bad: score 11", postLog({ patientId: "P001", type: "pain", score: 11 }));
show("bad: unknown type", postLog({ patientId: "P001", type: "sleep" }));
show("bad: walk without minutes", postLog({ patientId: "P001", type: "walk", km: 1 }));

// B5 learning: a dose 2.5 h ago, then pain comes back above goal (3)
console.log("\n=== B5 learning ===");
db.doses = db.doses.filter((d) => Date.now() - new Date(d.time) > 120000); // drop the test doses from above
db.pain_log = db.pain_log.filter((p) => Date.now() - new Date(p.time) > 120000);
console.log(`patient_model before: ${JSON.stringify(db.patient_model[0])}`);
postLog({ patientId: "P001", type: "dose" });
db.doses[db.doses.length - 1].time = new Date(Date.now() - 2.5 * 3600000).toISOString(); // pretend it was 2.5 h ago
show("pain 2 (at/below goal: nothing to learn)", postLog({ patientId: "P001", type: "pain", score: 2 }));
show("pain 5 (above goal: learn)", postLog({ patientId: "P001", type: "pain", score: 5 }));
show("pain 6 (same dose: already learned)", postLog({ patientId: "P001", type: "pain", score: 6 }));
console.log(`patient_model after:  ${JSON.stringify(db.patient_model[0])}`);
console.log(`predictions:          ${JSON.stringify(db.predictions)}`);

// R1: physio appointment. A dose 30 min ago; physio in 1 h is within 2 h after it, so pain is back sooner.
console.log("\n=== R1 physio ===");
const inH = (h) => new Date(Date.now() + h * 3600000).toISOString();
postLog({ patientId: "P001", type: "dose" });
db.doses[db.doses.length - 1].time = inH(-0.5);
show("physio in 1 h (moves the prediction)", postLog({ patientId: "P001", type: "physio", at: inH(1) }));
show("physio tomorrow (no change)", postLog({ patientId: "P001", type: "physio", at: inH(26) }));
show("bad: physio in 10 days", postLog({ patientId: "P001", type: "physio", at: inH(240) }));
show("bad: physio without at", postLog({ patientId: "P001", type: "physio" }));

// GET /dashboard
function getDashboard() {
  const out = { Webhook: [{ json: { query: { patientId: "P001" } } }], "Get demo_clock": wrap(db.demo_clock), ...tableOutputs(), ...weatherDown };
  out["Demo time"] = runCode(codeOf(b6, "Demo time"), out, []);
  return runCode(codeOf(b6, "Compute status"), out, [])[0].json;
}
// R3: simulates POST /demo-clock through its workflow (check -> get -> new offset -> update/insert -> reply)
function postClock(body) {
  const out = { Webhook: [{ json: { body } }] };
  out["Check request"] = runCode(codeOf(r3, "Check request"), out, out.Webhook);
  if (!out["Check request"][0].json.valid) return { status: 400, body: { ok: false, message: out["Check request"][0].json.error } };
  out["Get demo_clock"] = wrap(db.demo_clock);
  out["New offset"] = runCode(codeOf(r3, "New offset"), out, []);
  const n = out["New offset"][0].json;
  const row = runCode(codeOf(r3, n.exists ? "Row to update" : "Row to insert"), out, [])[0].json;
  db.demo_clock = [...db.demo_clock.filter((r) => r.patientId !== row.patientId), row];
  return { status: 200, body: runCode(codeOf(r3, "Build reply"), out, [])[0].json };
}
const dash = getDashboard();
const need = ["patient", "now", "painNow", "nextDoseAt", "doseAllowedNow", "mgUsed24h", "mgMax24h", "reliefHours",
  "painLikelyBackAt", "chart", "doses", "walks", "patterns", "headsUps", "model", "why", "upcoming"];
console.log(`\nGET /dashboard -> missing API fields: ${need.filter((k) => !(k in dash)).join(", ") || "none"}`);
console.log(`  painNow ${JSON.stringify(dash.painNow)}, mgUsed24h ${dash.mgUsed24h}/${dash.mgMax24h}, walks ${JSON.stringify(dash.walks)}`);
console.log(`  headsUps ${JSON.stringify(dash.headsUps)}`);
console.log(`  why ${JSON.stringify(dash.why)}`);
console.log(`  upcoming ${JSON.stringify(dash.upcoming)}`);
// R2: the "why" minutes + an average dose add up to the prediction (Ridge is linear; small rounding is fine)
const W = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "ml", "weights.json"), "utf8"));
const p = dash.prediction, shown = dash.why.reduce((s, w) => s + w.minutes, 0);
console.log(`  why check: average ${Math.round(W.intercept * 60)} min ${shown >= 0 ? "+" : ""}${shown} = ${Math.round(W.intercept * 60) + shown} min ` +
  `vs predicted ${Math.round(p.predictedHours * 60)} min (effects under 3 min and beyond the top 4 are left out)`);
console.log(`  has "Physio soon after your dose": ${dash.why.some((w) => w.label === "Physio soon after your dose")}`);

// ---------- R3: demo clock ----------
console.log("\n=== R3 demo clock ===");
show("bad: advance 0", postClock({ advanceMinutes: 0 }));
show("bad: empty body", postClock({}));
const realNow = getDashboard().now;
show("+60 min", postClock({ advanceMinutes: 60 }));
show("+60 min again", postClock({ advanceMinutes: 60 }));
const d2 = getDashboard();
console.log(`  dashboard now ${realNow} -> ${d2.now}, demo ${JSON.stringify(d2.demo)}`);
const logged = postLog({ patientId: "P001", type: "pain", score: 5 });
console.log(`  pain log saved at demo time: ${logged.row.time} (dashboard now ${d2.now})`);
show("reset", postClock({ reset: true }));
const d3 = getDashboard();
console.log(`  after reset: now ${d3.now}, demo field present: ${"demo" in d3}`);
