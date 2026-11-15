// Builds the n8n files from the repo (run after data/generate.js and ml/train.py):
//   n8n/seed/*.csv                                -> B1: import into n8n Data Tables (demo patient only)
//   n8n/PainPal-B3-check-rules-and-predict.json   -> B3: import into n8n (Workflows -> Import from file)
//
// Usage: node n8n/build.js [--patient P001]

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PATIENT = process.argv.includes("--patient") ? process.argv[process.argv.indexOf("--patient") + 1] : "P001";

// ---------- B1: seed CSVs, one per Data Table ----------
const seedDir = path.join(__dirname, "seed");
fs.mkdirSync(seedDir, { recursive: true });

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = splitCsvLine(head);
  return lines.map((l) => Object.fromEntries(splitCsvLine(l).map((v, i) => [cols[i], v])));
}
function splitCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}
function writeCsv(name, cols, rows) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  fs.writeFileSync(path.join(seedDir, name), [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n");
  return rows.length;
}
const only = (rows, key = "patientId") => rows.filter((r) => r[key] === PATIENT);
const data = (f) => readCsv(path.join(ROOT, "data", f));

const counts = {
  prescription: writeCsv("prescription.csv", ["patientId", "name", "goal", "drug", "doseMg", "minIntervalH", "maxMg24h", "email"], only(data("prescription.csv"))),
  pain_log: writeCsv("pain_log.csv", ["patientId", "time", "score", "note", "pressureHpa", "tempC", "precipMm"], only(data("pain_log.csv"))),
  doses: writeCsv("doses.csv", ["patientId", "time", "mg", "drug", "kind"], only(data("medications.csv"))),
  meals: writeCsv("meals.csv", ["patientId", "time", "meal"], only(data("meals.csv"))),
  walks: writeCsv("walks.csv", ["patientId", "time", "km", "minutes", "source"], only(data("walks.csv"))),
  schedule: writeCsv("schedule.csv", ["patientId", "start", "end", "title"], only(data("schedule.csv"))),
  patient_model: writeCsv("patient_model.csv", ["patientId", "offsetHours", "dosesLearned", "lastUpdated"],
    only(readCsv(path.join(ROOT, "ml", "patient_offsets.csv")))),
};

// ---------- B3: workflow JSON ----------
const predictSrc = fs.readFileSync(path.join(ROOT, "ml", "predict.js"), "utf8");
const helpers = predictSrc.split("// ----------------------------- CUT: start -----------------------------")[1]
  .split("// ----------------------------- CUT: end -------------------------------")[0];
const logic = fs.readFileSync(path.join(__dirname, "code", "check-rules-and-predict.js"), "utf8")
  .replace(/\nif \(typeof module[^\n]*\n?/, "\n");
const weights = JSON.parse(fs.readFileSync(path.join(ROOT, "ml", "weights.json"), "utf8"));

const TABLES = ["prescription", "doses", "pain_log", "meals", "walks", "schedule", "patient_model"];
const tableNode = (t) => `Get ${t}`;

const jsCode = `// Built by n8n/build.js from ml/predict.js + n8n/code/check-rules-and-predict.js. Edit those, then rebuild.
// Model weights from ml/weights.json (${weights.trainedOn}).
const WEIGHTS = ${JSON.stringify(weights)};
${helpers}
${logic}
// ---------- run ----------
const input = $('When called by another workflow').first().json;
const rows = (node) => $(node).all().map((i) => i.json).filter((r) => r && Object.keys(r).length > 0);
let weatherApi = null;
try { weatherApi = $('Get weather (Open-Meteo)').first().json; } catch (e) { weatherApi = null; }

const result = checkRulesAndPredict({
  patientId: input.patientId || 'P001',
  now: input.now || null,            // demo mode: pass a "pretend now" ISO time
  weights: WEIGHTS,
${TABLES.map((t) => `  ${{ pain_log: "pain", patient_model: "patientModel" }[t] || t}: rows('${tableNode(t)}'),`).join("\n")}
  weatherApi,
});
return [{ json: result }];
`;

let x = 0;
const pos = () => [(x += 220) - 220, 300];
const id = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const nodes = [
  {
    parameters: { inputSource: "passthrough" },
    name: "When called by another workflow", type: "n8n-nodes-base.executeWorkflowTrigger", typeVersion: 1.1, position: pos(),
  },
  ...TABLES.map((t) => ({
    parameters: { resource: "row", operation: "get", dataTableId: { __rl: true, mode: "name", value: t }, returnAll: true },
    name: tableNode(t), type: "n8n-nodes-base.dataTable", typeVersion: 1, position: pos(),
    executeOnce: true, alwaysOutputData: true,
  })),
  {
    parameters: {
      url: "https://api.open-meteo.com/v1/forecast",
      sendQuery: true,
      queryParameters: { parameters: [
        { name: "latitude", value: "49.26" }, { name: "longitude", value: "-123.25" },
        { name: "hourly", value: "pressure_msl,temperature_2m,precipitation" },
        { name: "past_days", value: "2" }, { name: "forecast_days", value: "1" }, { name: "timezone", value: "GMT" },
      ] },
      options: {},
    },
    name: "Get weather (Open-Meteo)", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: pos(),
    executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput",
    notes: "If weather fails, prediction still works (weather counts as average)", notesInFlow: true,
  },
  {
    parameters: { jsCode },
    name: "Compute status", type: "n8n-nodes-base.code", typeVersion: 2, position: pos(),
    notes: "Prescription rules + Ridge prediction + personal offset + patterns", notesInFlow: true,
  },
];

const ifNode = (name, field, position) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
      conditions: [{ id: id(name), leftValue: `={{ $json.${field} }}`, rightValue: "",
        operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  },
  name, type: "n8n-nodes-base.if", typeVersion: 2.2, position,
});
const setRule = (name, text, position) => ({
  parameters: {
    mode: "manual",
    assignments: { assignments: [{ id: id(name), name: "rule", value: text, type: "string" }] },
    includeOtherFields: true,
    options: {},
  },
  name, type: "n8n-nodes-base.set", typeVersion: 3.4, position,
});
const [cx] = nodes[nodes.length - 1].position;
nodes.push(
  ifNode("24 h max reached?", "maxReached", [cx + 220, 300]),
  setRule("Rule: max reached", "=24 h maximum reached. Next dose allowed at {{ $json.nextDoseAt }}.", [cx + 440, 180]),
  ifNode("Dose allowed now?", "doseAllowedNow", [cx + 440, 420]),
  setRule("Rule: dose allowed", "Dose allowed now (within prescription).", [cx + 660, 340]),
  setRule("Rule: wait", "=Too early. Next dose allowed at {{ $json.nextDoseAt }}.", [cx + 660, 500]),
  {
    parameters: {
      content: "## PainPal · B3 · Check rules & predict\n**Purpose:** prescription rules (min interval, 24 h max), " +
        "Ridge prediction + personal offset, patterns, heads-ups. Returns the /dashboard JSON (docs/API.md).\n" +
        "**Owner:** Person B · **Status:** built from repo (n8n/build.js)\n\n" +
        "**Setup:** run *PainPal · Setup* first (creates and fills the tables; nodes find them by name). " +
        "Test: click Execute workflow (pinned data { patientId: P001 }).\n\n" +
        "*Synthetic data. Not medical advice.*",
      height: 260, width: 520,
    },
    name: "Sticky Note", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [0, 0],
  },
);
nodes.forEach((n, i) => { n.id = `b3-${i}-${id(n.name)}`.slice(0, 36); });

const chain = nodes.slice(0, TABLES.length + 3).map((n) => n.name); // trigger -> tables -> weather -> compute
const connections = {};
const link = (from, to, output = 0) => {
  connections[from] = connections[from] || { main: [] };
  while (connections[from].main.length <= output) connections[from].main.push([]);
  connections[from].main[output].push({ node: to, type: "main", index: 0 });
};
for (let i = 0; i < chain.length - 1; i++) link(chain[i], chain[i + 1]);
link("Compute status", "24 h max reached?");
link("24 h max reached?", "Rule: max reached", 0);
link("24 h max reached?", "Dose allowed now?", 1);
link("Dose allowed now?", "Rule: dose allowed", 0);
link("Dose allowed now?", "Rule: wait", 1);

const workflow = {
  name: "PainPal · B3 · Check rules & predict",
  nodes,
  connections,
  pinData: { "When called by another workflow": [{ json: { patientId: PATIENT } }] },
  settings: { executionOrder: "v1" },
};
const wfFile = path.join(__dirname, "PainPal-B3-check-rules-and-predict.json");
fs.writeFileSync(wfFile, JSON.stringify(workflow, null, 2) + "\n");

// ---------- Setup workflow: creates every table and loads the seed CSVs from GitHub ----------
const RAW = "https://raw.githubusercontent.com/rchicoin/PainTracker/main/n8n/seed";
const SCHEMA = {
  prescription: { patientId: "string", name: "string", goal: "number", drug: "string", doseMg: "number", minIntervalH: "number", maxMg24h: "number", email: "string" },
  pain_log: { patientId: "string", time: "string", score: "number", note: "string", pressureHpa: "number", tempC: "number", precipMm: "number" },
  doses: { patientId: "string", time: "string", mg: "number", drug: "string", kind: "string" },
  meals: { patientId: "string", time: "string", meal: "string" },
  walks: { patientId: "string", time: "string", km: "number", minutes: "number", source: "string" },
  schedule: { patientId: "string", start: "string", end: "string", title: "string" },
  patient_model: { patientId: "string", offsetHours: "number", dosesLearned: "number", lastUpdated: "string" },
  predictions: { patientId: "string", doseTime: "string", predictedHours: "number", actualHours: "number", error: "number" },
};
const parseCode = (table) => `// CSV text -> one item per row, with numbers as numbers and empty cells as null
const NUMBERS = ${JSON.stringify(Object.keys(SCHEMA[table]).filter((c) => SCHEMA[table][c] === "number"))};
const text = $input.first().json.data;
const [head, ...lines] = text.trim().split(/\\r?\\n/);
const split = (line) => { const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out; };
const cols = split(head);
return lines.map((line) => {
  const v = split(line), row = {};
  cols.forEach((c, i) => { row[c] = NUMBERS.includes(c) ? (v[i] === '' ? null : Number(v[i])) : v[i]; });
  return { json: row };
});`;

const sNodes = [];
let sx = 0;
const sAt = (y = 300) => [(sx += 220) - 220, y];
sNodes.push({ parameters: {}, name: "Run setup (resets PainPal tables!)", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: sAt() });
for (const t of Object.keys(SCHEMA)) {
  sNodes.push({
    parameters: { resource: "table", operation: "delete", dataTableId: { __rl: true, mode: "name", value: t } },
    name: `Delete old ${t}`, type: "n8n-nodes-base.dataTable", typeVersion: 1, position: sAt(200),
    executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput",
  });
  sNodes.push({
    parameters: {
      resource: "table", operation: "create", tableName: t,
      columns: { column: Object.entries(SCHEMA[t]).map(([name, type]) => ({ name, type })) },
      options: { createIfNotExists: true },
    },
    name: `Create ${t}`, type: "n8n-nodes-base.dataTable", typeVersion: 1, position: sAt(400), executeOnce: true,
  });
}
for (const t of Object.keys(SCHEMA).filter((x) => x !== "predictions")) {
  sNodes.push({
    parameters: { url: `${RAW}/${t}.csv`, options: { response: { response: { responseFormat: "text", outputPropertyName: "data" } } } },
    name: `Download ${t}.csv`, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: sAt(200), executeOnce: true,
  });
  sNodes.push({
    parameters: { jsCode: parseCode(t) },
    name: `Parse ${t}`, type: "n8n-nodes-base.code", typeVersion: 2, position: sAt(400),
  });
  sNodes.push({
    parameters: {
      resource: "row", operation: "insert", dataTableId: { __rl: true, mode: "name", value: t },
      columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] }, options: {},
    },
    name: `Insert ${t}`, type: "n8n-nodes-base.dataTable", typeVersion: 1, position: sAt(300),
  });
}
sNodes.push({
  parameters: {
    content: "## PainPal · Setup (run once)\nCreates the 8 PainPal data tables and loads demo patient P001 from GitHub (`n8n/seed/`).\n\n" +
      "**Warning:** deletes and recreates the tables, so learned offsets and new logs are lost. " +
      "Use it for first setup and the Sunday-morning data refresh only.\n\n**Owner:** Person B · built by n8n/build.js",
    height: 240, width: 480,
  },
  name: "Sticky Note", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [0, -40],
});
sNodes.forEach((n, i) => { n.id = `setup-${i}-${id(n.name)}`.slice(0, 36); });
const sConn = {};
const sChain = sNodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote").map((n) => n.name);
for (let i = 0; i < sChain.length - 1; i++) {
  // after an Insert, the next Download runs once (executeOnce), not once per inserted row
  sConn[sChain[i]] = { main: [[{ node: sChain[i + 1], type: "main", index: 0 }]] };
}
const setupFile = path.join(__dirname, "PainPal-Setup.json");
fs.writeFileSync(setupFile, JSON.stringify({ name: "PainPal · Setup (run once)", nodes: sNodes, connections: sConn,
  settings: { executionOrder: "v1" } }, null, 2) + "\n");
console.log(`Setup:    ${path.relative(ROOT, setupFile)} (${sNodes.length} nodes)`);

console.log(`Seed CSVs for ${PATIENT} in n8n/seed/:`, Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));
console.log(`Workflow: ${path.relative(ROOT, wfFile)} (${nodes.length} nodes, Code node ${jsCode.length} chars)`);
