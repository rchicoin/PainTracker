// Runs the real Code-node JavaScript from the B4 (/log) and B6 (/dashboard) workflow files
// against n8n/seed/*.csv, with a fake `$` / `$input` like n8n's. Usage: node n8n/test-api.js
const fs = require("fs");
const path = require("path");

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
const b4 = load("PainPal-B4-log.json");
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
  const check = runCode(codeOf(b4, "Check request"), {}, webhookItem);
  if (!check[0].json.valid) return { status: 400, body: { ok: false, message: check[0].json.error } };
  const out = { "Check request": check };
  const type = check[0].json.type;
  const rowInput = type === "pain" ? [{ json: weatherNow }] : type === "dose" ? wrap(db.prescription) : [{ json: {} }];
  const row = runCode(codeOf(b4, `${type[0].toUpperCase()}${type.slice(1)} row`), out, rowInput)[0].json;
  db[{ pain: "pain_log", dose: "doses", meal: "meals", walk: "walks" }[type]].push(row); // Insert node
  Object.assign(out, tableOutputs(), weatherDown);
  out["Compute status"] = runCode(codeOf(b4, "Compute status"), out, []);
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

// GET /dashboard
const out6 = { Webhook: [{ json: { query: { patientId: "P001" } } }], ...tableOutputs(), ...weatherDown };
const dash = runCode(codeOf(b6, "Compute status"), out6, [])[0].json;
const need = ["patient", "now", "painNow", "nextDoseAt", "doseAllowedNow", "mgUsed24h", "mgMax24h", "reliefHours",
  "painLikelyBackAt", "chart", "doses", "walks", "patterns", "headsUps", "model"];
console.log(`\nGET /dashboard -> missing API fields: ${need.filter((k) => !(k in dash)).join(", ") || "none"}`);
console.log(`  painNow ${JSON.stringify(dash.painNow)}, mgUsed24h ${dash.mgUsed24h}/${dash.mgMax24h}, walks ${JSON.stringify(dash.walks)}`);
console.log(`  headsUps ${JSON.stringify(dash.headsUps)}`);
