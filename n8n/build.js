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

// The "Compute status" Code node; inputExpr says where patientId / now come from (trigger, webhook body, query).
const computeCode = (inputExpr) => `// Built by n8n/build.js from ml/predict.js + n8n/code/check-rules-and-predict.js. Edit those, then rebuild.
// Model weights from ml/weights.json (${weights.trainedOn}).
const WEIGHTS = ${JSON.stringify(weights)};
${helpers}
${logic}
// ---------- run ----------
const input = ${inputExpr};
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
// R3: demo clock. Only present while the clock is shifted, so the app can label "Demo time".
if (Number(input.demoOffsetMin)) result.demo = { active: true, offsetMin: Number(input.demoOffsetMin) };
${inputExpr.includes("Check request") ? `// R1: for a new physio appointment, also predict without it so /log can say how the prediction moved
if (input.type === 'physio') {
  const at = new Date(input.body.at).getTime();
  const schedule = rows('Get schedule').filter((r) => !(/physio/i.test(r.title || '') && Math.abs(new Date(r.start).getTime() - at) < 1000));
  const before = checkRulesAndPredict({ patientId: input.patientId || 'P001', now: input.now || null, weights: WEIGHTS,
${TABLES.map((t) => `    ${{ pain_log: "pain", patient_model: "patientModel" }[t] || t}: ${t === "schedule" ? "schedule" : `rows('${tableNode(t)}')`},`).join("\n")}
    weatherApi });
  result.before = { painLikelyBackAt: before.painLikelyBackAt };
}
` : ""}return [{ json: result }];
`;
const jsCode = computeCode("$('When called by another workflow').first().json");

let x = 0;
const pos = () => [(x += 220) - 220, 300];
const id = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// Get every table + weather + Compute status (shared by B3, B4, B6)
const statusNodes = (inputExpr, at) => [
  ...TABLES.map((t) => ({
    parameters: { resource: "row", operation: "get", dataTableId: { __rl: true, mode: "name", value: t }, returnAll: true },
    name: tableNode(t), type: "n8n-nodes-base.dataTable", typeVersion: 1, position: at(),
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
    name: "Get weather (Open-Meteo)", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: at(),
    executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput",
    notes: "If weather fails, prediction still works (weather counts as average)", notesInFlow: true,
  },
  {
    parameters: { jsCode: computeCode(inputExpr) },
    name: "Compute status", type: "n8n-nodes-base.code", typeVersion: 2, position: at(),
    notes: "Prescription rules + Ridge prediction + personal offset + patterns", notesInFlow: true,
  },
];

const nodes = [
  {
    parameters: { inputSource: "passthrough" },
    name: "When called by another workflow", type: "n8n-nodes-base.executeWorkflowTrigger", typeVersion: 1.1, position: pos(),
  },
  ...statusNodes("$('When called by another workflow').first().json", pos),
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
  demo_clock: { patientId: "string", offsetMin: "number" }, // R3: minutes the demo clock is ahead of real time
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
for (const t of Object.keys(SCHEMA).filter((x) => !["predictions", "demo_clock"].includes(x))) {
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

// ---------- B4 (POST /log) and B6 (GET /dashboard) ----------
const ORIGINS = "https://pain-tracker-rosy.vercel.app,http://localhost:5173";
const WEBHOOK_VERSION = { log: 2, dashboard: 1, "demo-clock": 1 };
// R3: "Get demo_clock" node + code that reads the offset. A missing table or row means real time (offset 0).
const getDemoClock = () => ({
  parameters: { resource: "row", operation: "get", dataTableId: { __rl: true, mode: "name", value: "demo_clock" }, returnAll: true },
  name: "Get demo_clock", type: "n8n-nodes-base.dataTable", typeVersion: 1,
  executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput",
  notes: "R3 demo clock (empty = real time)", notesInFlow: true,
});
const DEMO_OFFSET = (pidExpr) => `let demoOffsetMin = 0;
try {
  const r = $('Get demo_clock').all().map((i) => i.json).find((x) => x && String(x.patientId) === String(${pidExpr}));
  demoOffsetMin = r && Number.isFinite(Number(r.offsetMin)) ? Number(r.offsetMin) : 0;
} catch (e) { demoOffsetMin = 0; }
const nowMs = Date.now() + demoOffsetMin * 60000;`;
const uuid = (s) => { const h = require("crypto").createHash("md5").update(s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const LOCAL_ISO = `const localIso = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  timeZoneName: 'longOffset' }).formatToParts(d).map((x) => [x.type, x.value]));
  return \`\${p.year}-\${p.month}-\${p.day}T\${p.hour}:\${p.minute}:\${p.second}\${p.timeZoneName.replace('GMT', '') || '+00:00'}\`; };`;

const webhook = (name, method, pathName) => ({
  parameters: { httpMethod: method, path: pathName, responseMode: "responseNode", options: { allowedOrigins: ORIGINS } },
  // bump WEBHOOK_VERSION if n8n reports a "conflicting URL path" from a deleted copy of the workflow
  name, type: "n8n-nodes-base.webhook", typeVersion: 2, webhookId: uuid(`painpal-${pathName}-${WEBHOOK_VERSION[pathName] || 1}`),
});
const respond = (name, extra = {}) => ({
  parameters: { respondWith: "firstIncomingItem", options: {}, ...extra },
  name, type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1,
});
const code = (name, jsCode, notes) => ({
  parameters: { jsCode }, name, type: "n8n-nodes-base.code", typeVersion: 2, ...(notes ? { notes, notesInFlow: true } : {}),
});
const insert = (t) => ({
  parameters: { resource: "row", operation: "insert", dataTableId: { __rl: true, mode: "name", value: t },
    columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] }, options: {} },
  name: `Insert ${t}`, type: "n8n-nodes-base.dataTable", typeVersion: 1,
});
const sticky = (content, position, width = 480, height = 220) => ({
  parameters: { content, width, height }, name: "Sticky Note", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position,
});
const place = (node, position) => ({ ...node, position });
const wire = (pairs) => {
  const c = {};
  for (const [from, to, output = 0] of pairs) {
    c[from] = c[from] || { main: [] };
    while (c[from].main.length <= output) c[from].main.push([]);
    c[from].main[output].push({ node: to, type: "main", index: 0 });
  }
  return c;
};
const finish = (prefix, nodes) => nodes.map((n, i) => ({ id: uuid(`${prefix}-${i}-${n.name}`), ...n }));

// --- B4 code nodes ---
const CHECK_REQUEST = `// Validate the app's request (docs/API.md). Bad requests get a 400 with a clear message.
${LOCAL_ISO}
const body = $('Webhook').first().json.body || {};
${DEMO_OFFSET("body.patientId || 'P001'")}
const types = ['pain', 'dose', 'meal', 'walk', 'physio'];
const isNum = (x) => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x));
let error = null;
if (!types.includes(body.type)) error = 'type must be one of: pain, dose, meal, walk, physio';
else if (body.type === 'pain' && !(isNum(body.score) && Number.isInteger(Number(body.score)) && body.score >= 0 && body.score <= 10))
  error = 'score must be a whole number from 0 to 10';
else if (body.type === 'walk' && !(isNum(body.minutes) && body.minutes > 0 && body.minutes <= 600))
  error = 'minutes must be a number from 1 to 600';
else if (body.type === 'walk' && body.km !== null && body.km !== undefined && !(isNum(body.km) && body.km >= 0 && body.km < 100))
  error = 'km must be a number, or null for manual walks';
else if (body.type === 'physio') {
  // R1: appointment start, from 2 h ago up to 7 days ahead
  const at = new Date(body.at);
  const ahead = (at.getTime() - nowMs) / 3600000;
  if (!body.at || isNaN(at)) error = 'at must be a date and time (ISO 8601)';
  else if (ahead < -2 || ahead > 7 * 24) error = 'Physio time must be between 2 hours ago and 7 days ahead';
}
return [{ json: { valid: !error, error, type: body.type, patientId: String(body.patientId || 'P001'),
  time: localIso(new Date(nowMs)), now: localIso(new Date(nowMs)), demoOffsetMin, body } }];`;

const ROW = {
  pain: `// Pain log row + the weather right now (Open-Meteo). Weather may be missing; the log is still saved.
const c = $('Check request').first().json;
const w = ($input.first().json || {}).current || {};
return [{ json: { patientId: c.patientId, time: c.time, score: Number(c.body.score), note: String(c.body.note || '').slice(0, 200),
  pressureHpa: w.pressure_msl ?? null, tempC: w.temperature_2m ?? null, precipMm: w.precipitation ?? null } }];`,
  dose: `// As-needed dose: the amount always comes from the prescription, never from the app.
const c = $('Check request').first().json;
const rx = $input.all().map((i) => i.json).find((r) => String(r.patientId) === c.patientId);
if (!rx) throw new Error('No prescription for patient ' + c.patientId);
return [{ json: { patientId: c.patientId, time: c.time, mg: Number(rx.doseMg), drug: rx.drug, kind: 'as-needed' } }];`,
  meal: `const c = $('Check request').first().json;
return [{ json: { patientId: c.patientId, time: c.time, meal: String(c.body.meal || 'meal').slice(0, 40) } }];`,
  walk: `// Walk: GPS walks have km; manual walks send km = null (stored empty). Never coordinates.
const c = $('Check request').first().json;
const km = c.body.km === null || c.body.km === undefined || c.body.km === '' ? null : Math.round(Number(c.body.km) * 100) / 100;
return [{ json: { patientId: c.patientId, time: c.time, km, minutes: Math.round(Number(c.body.minutes)),
  source: c.body.source === 'auto' ? 'auto' : 'manual' } }];`,
  physio: `// R1: physio appointment -> schedule table (45 min). The prediction counts physio within 2 h after a dose.
${LOCAL_ISO}
const c = $('Check request').first().json;
const start = new Date(c.body.at);
return [{ json: { patientId: c.patientId, start: localIso(start), end: localIso(new Date(start.getTime() + 45 * 60000)), title: 'Physio' } }];`,
};

const BUILD_REPLY = `// Reply to the app: { ok, message, warning, status } (docs/API.md). Never suggests a dose outside the prescription.
const c = $('Check request').first().json;
const s = $('Compute status').first().json;
const H = 3600000;
const clock = (t) => new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/Vancouver', hour: 'numeric', minute: '2-digit' });
const SAFETY = "Feeling very drowsy or confused? Don't take more. Call 811 or your care team.";
const next = s.doseAllowedNow ? 'A dose is allowed now.' : 'Your next dose is allowed at ' + clock(s.nextDoseAt) + '.';
let message, warning = null;

const L = $('B5: learn from last dose').first().json;
if (c.type === 'pain') {
  message = 'Logged pain ' + c.body.score + '/10. ' + next;
  if (L.learn) {
    message += ' PainPal learned from your last dose: relief lasted ' + L.summary.actualHours.toFixed(1) +
      ' h (predicted ' + L.summary.predictedHours.toFixed(1) + ' h).';
  }
  if (Number(c.body.score) >= 9) warning = 'If pain is severe, new, or comes with other symptoms, contact your care team or call 811.';
} else if (c.type === 'dose') {
  // check the dose just saved against the as-needed doses before it
  const t = new Date(c.time).getTime();
  const before = $('Get doses').all().map((i) => i.json)
    .filter((d) => String(d.patientId) === c.patientId && (!d.kind || d.kind === 'as-needed'))
    .map((d) => new Date(d.time).getTime()).filter((x) => x < t - 1000).sort((a, b) => a - b);
  const last = before.length ? before[before.length - 1] : null;
  const tooEarly = last !== null && t - last < s.patient.minIntervalH * H;
  const overMax = s.mgUsed24h > s.mgMax24h;
  message = 'Dose logged (' + s.patient.doseMg + ' mg). ' +
    (s.painLikelyBackAt ? 'Pain likely back around ' + clock(s.painLikelyBackAt) + '. ' : '') + next;
  if (tooEarly || overMax) {
    warning = (tooEarly ? 'This dose was earlier than your prescription allows (every ' + s.patient.minIntervalH + ' h). ' : '') +
      (overMax ? 'You are over your 24 h maximum (' + s.mgMax24h + ' mg). ' : '') + SAFETY;
  }
} else if (c.type === 'physio') {
  // R1: say how the prediction moved (Compute status also predicts without this appointment)
  const day = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
  const at = new Date(c.body.at);
  const when = (day(at) === day(c.time) ? '' : day(at) === day(new Date(c.time).getTime() + 24 * H) ? 'tomorrow ' :
    at.toLocaleDateString('en-US', { timeZone: 'America/Vancouver', weekday: 'short', month: 'short', day: 'numeric' }) + ' ') + clock(at);
  const was = s.before ? s.before.painLikelyBackAt : null, now = s.painLikelyBackAt;
  message = 'Physio ' + when + ' saved. ';
  if (now && was && now !== was) message += 'Pain likely back around ' + clock(now) + ' (was ' + clock(was) + ').';
  else if (now) message += 'Your current prediction stays at ' + clock(now) + ' (physio counts when it is within 2 h after a dose).';
  else message += 'It will be used for your next dose.';
} else if (c.type === 'meal') {
  message = 'Meal logged. ' + next;
} else {
  const km = c.body.km === null || c.body.km === undefined ? '' : Number(c.body.km).toFixed(1) + ' km, ';
  message = 'Walk logged (' + km + Math.round(c.body.minutes) + ' min). ' + next;
}
return [{ json: { ok: true, message, warning, status: s.status, learned: L.learn ? L.summary : null } }];`;

const learnLogic = fs.readFileSync(path.join(__dirname, "code", "learn.js"), "utf8").replace(/\nif \(typeof module[^\n]*\n?/, "\n");
const LEARN_CODE = `// Built by n8n/build.js from ml/predict.js + n8n/code/check-rules-and-predict.js + n8n/code/learn.js.
const WEIGHTS = ${JSON.stringify(weights)};
${helpers}
${logic}
${learnLogic}
// ---------- run ----------
const c = $('Check request').first().json;
if (c.type !== 'pain') return [{ json: { learn: false, reason: 'not a pain log' } }];
const rows = (node) => $(node).all().map((i) => i.json).filter((r) => r && Object.keys(r).length > 0);
let weatherApi = null;
try { weatherApi = $('Get weather (Open-Meteo)').first().json; } catch (e) { weatherApi = null; }
const result = learnFromPain({
  patientId: c.patientId, painTime: c.time, painScore: c.body.score, weights: WEIGHTS,
  prescription: rows('Get prescription'), doses: rows('Get doses'), pain: rows('Get pain_log'), meals: rows('Get meals'),
  walks: rows('Get walks'), schedule: rows('Get schedule'), patientModel: rows('Get patient_model'),
  predictions: rows('Get predictions'), weatherApi,
});
return [{ json: result }];`;

const switchRule = (type) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
    conditions: [{ leftValue: "={{ $json.type }}", rightValue: type, operator: { type: "string", operation: "equals" } }],
    combinator: "and",
  },
  renameOutput: true, outputKey: type,
});

{
  const X = (i) => i * 220;
  const b4 = [
    place(webhook("Webhook", "POST", "log"), [X(0), 300]),
    place(getDemoClock(), [X(0) + 110, 520]),
    place(code("Check request", CHECK_REQUEST), [X(1), 300]),
    place(ifNode("Valid request?", "valid", null), [X(2), 300]),
    place(respond("Respond: bad request", {
      respondWith: "json", responseBody: "={{ JSON.stringify({ ok: false, message: $json.error }) }}", options: { responseCode: 400 },
    }), [X(3), 520]),
    place({ parameters: { rules: { values: ["pain", "dose", "meal", "walk", "physio"].map(switchRule) }, options: {} },
      name: "Type?", type: "n8n-nodes-base.switch", typeVersion: 3.2 }, [X(3), 300]),
    place({ parameters: { url: "https://api.open-meteo.com/v1/forecast", sendQuery: true, queryParameters: { parameters: [
      { name: "latitude", value: "49.26" }, { name: "longitude", value: "-123.25" },
      { name: "current", value: "temperature_2m,pressure_msl,precipitation" }] }, options: {} },
      name: "Pain: weather now", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2,
      alwaysOutputData: true, onError: "continueRegularOutput" }, [X(4), 0]),
    place(code("Pain row", ROW.pain), [X(5), 0]),
    place({ parameters: { resource: "row", operation: "get", dataTableId: { __rl: true, mode: "name", value: "prescription" }, returnAll: true },
      name: "Dose: get prescription", type: "n8n-nodes-base.dataTable", typeVersion: 1, executeOnce: true }, [X(4), 200]),
    place(code("Dose row", ROW.dose, "mg from the prescription"), [X(5), 200]),
    place(code("Meal row", ROW.meal), [X(5), 400]),
    place(code("Walk row", ROW.walk, "km may be null (manual walk)"), [X(5), 600]),
    place(code("Physio row", ROW.physio, "R1: appointment -> schedule"), [X(5), 800]),
    place(insert("pain_log"), [X(6), 0]),
    place(insert("doses"), [X(6), 200]),
    place(insert("meals"), [X(6), 400]),
    place(insert("walks"), [X(6), 600]),
    place(insert("schedule"), [X(6), 800]),
  ];
  let sx4 = X(7);
  b4.push(...statusNodes("$('Check request').first().json", () => [(sx4 += 220) - 220, 300]));
  // B5: learn from the last dose when pain comes back above goal
  b4.push(place({ parameters: { resource: "row", operation: "get", dataTableId: { __rl: true, mode: "name", value: "predictions" }, returnAll: true },
    name: "Get predictions", type: "n8n-nodes-base.dataTable", typeVersion: 1, executeOnce: true, alwaysOutputData: true }, [sx4, 300]));
  b4.push(place(code("B5: learn from last dose", LEARN_CODE, "pain above goal → real relief time → update personal offset"), [sx4 + 220, 300]));
  b4.push(place(ifNode("Learned?", "learn", null), [sx4 + 440, 300]));
  b4.push(place(code("Model row", "return [{ json: $('B5: learn from last dose').first().json.modelRow }];"), [sx4 + 660, 140]));
  b4.push(place({ parameters: { resource: "row", operation: "update", dataTableId: { __rl: true, mode: "name", value: "patient_model" },
    filters: { conditions: [{ keyName: "patientId", condition: "eq", keyValue: "={{ $json.patientId }}" }] },
    columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] }, options: {} },
    name: "Update patient_model", type: "n8n-nodes-base.dataTable", typeVersion: 1 }, [sx4 + 880, 140]));
  b4.push(place(code("Prediction row", "return [{ json: $('B5: learn from last dose').first().json.predictionRow }];"), [sx4 + 1100, 140]));
  b4.push(place(insert("predictions"), [sx4 + 1320, 140]));
  b4.push(place(code("Build reply", BUILD_REPLY, "message + warning (too early / over 24 h max) + what was learned"), [sx4 + 1540, 300]));
  b4.push(place(respond("Respond"), [sx4 + 1760, 300]));
  b4.push(sticky("## PainPal · B4 · POST /log\nSaves pain / dose / meal / walk / physio from the app, then re-checks prescription rules " +
    "and the prediction, and replies `{ ok, message, warning, status }` (docs/API.md).\n\n**Owner:** Person B · built by n8n/build.js\n" +
    "**Activate** the workflow so the app can use `/webhook/log`. CORS: Vercel app + localhost.", [-40, -300], 520, 240));
  const chainStart = tableNode(TABLES[0]);
  const statusChain = [...TABLES.map(tableNode), "Get weather (Open-Meteo)", "Compute status", "Get predictions", "B5: learn from last dose", "Learned?"];
  const learnChain = ["Model row", "Update patient_model", "Prediction row", "Insert predictions", "Build reply", "Respond"];
  const b4Conn = wire([
    ["Webhook", "Get demo_clock"], ["Get demo_clock", "Check request"], ["Check request", "Valid request?"],
    ["Valid request?", "Type?", 0], ["Valid request?", "Respond: bad request", 1],
    ["Type?", "Pain: weather now", 0], ["Type?", "Dose: get prescription", 1], ["Type?", "Meal row", 2], ["Type?", "Walk row", 3], ["Type?", "Physio row", 4],
    ["Pain: weather now", "Pain row"], ["Pain row", "Insert pain_log"],
    ["Dose: get prescription", "Dose row"], ["Dose row", "Insert doses"],
    ["Meal row", "Insert meals"], ["Walk row", "Insert walks"], ["Physio row", "Insert schedule"],
    ...["pain_log", "doses", "meals", "walks", "schedule"].map((t) => [`Insert ${t}`, chainStart]),
    ...statusChain.slice(0, -1).map((n, i) => [n, statusChain[i + 1]]),
    ["Learned?", "Model row", 0], ["Learned?", "Build reply", 1],
    ...learnChain.slice(0, -1).map((n, i) => [n, learnChain[i + 1]]),
  ]);
  fs.writeFileSync(path.join(__dirname, "PainPal-B4-log.json"), JSON.stringify({
    name: "PainPal · B4 · POST /log", nodes: finish("b4", b4), connections: b4Conn, settings: { executionOrder: "v1" },
  }, null, 2) + "\n");

  let sx6 = 220;
  const b6 = [place(webhook("Webhook", "GET", "dashboard"), [0, 300])];
  const DEMO_TIME = `// R3: "now" for the dashboard = real time + demo clock offset (?now=ISO still overrides, for testing)
${LOCAL_ISO}
const q = $('Webhook').first().json.query || {};
${DEMO_OFFSET("q.patientId || 'P001'")}
return [{ json: { patientId: q.patientId || 'P001', now: q.now || localIso(new Date(nowMs)), demoOffsetMin } }];`;
  b6.push(place(getDemoClock(), [sx6, 300]), place(code("Demo time", DEMO_TIME), [sx6 + 220, 300]));
  sx6 += 440;
  b6.push(...statusNodes("$('Demo time').first().json",
    () => [(sx6 += 220) - 220, 300]));
  b6.push(place(respond("Respond"), [sx6, 300]));
  b6.push(sticky("## PainPal · B6 · GET /dashboard\nReads the tables, applies prescription rules, predicts when pain is likely back, " +
    "finds patterns and heads-ups. Replies with the dashboard JSON (docs/API.md).\n\n`?patientId=P001` (optional `&now=ISO` for demo mode)\n\n" +
    "**Owner:** Person B · built by n8n/build.js · **Activate** to use `/webhook/dashboard`.", [-40, -300], 520, 240));
  const b6Chain = ["Webhook", "Get demo_clock", "Demo time", ...TABLES.map(tableNode), "Get weather (Open-Meteo)", "Compute status", "Respond"];
  fs.writeFileSync(path.join(__dirname, "PainPal-B6-dashboard.json"), JSON.stringify({
    name: "PainPal · B6 · GET /dashboard", nodes: finish("b6", b6),
    connections: wire(b6Chain.slice(0, -1).map((n, i) => [n, b6Chain[i + 1]])), settings: { executionOrder: "v1" },
  }, null, 2) + "\n");
  console.log(`B4/B6:    n8n/PainPal-B4-log.json (${b4.length} nodes), n8n/PainPal-B6-dashboard.json (${b6.length} nodes)`);
}

// ---------- R4: POST /prescription (the patient's one as-needed medication) ----------
{
  const RX_CHECK = `// Validate the prescription (docs/API.md, R4). Bad values get a 400 with a clear message.
// These become hard rules for every dose check, so nothing is guessed or rounded silently.
const b = $input.first().json.body || {};
const num = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x));
const drug = String(b.drug ?? '').trim();
const doseMg = num(b.doseMg), minIntervalH = num(b.minIntervalH), maxMg24h = num(b.maxMg24h), goal = num(b.goal);
let error = null;
if (drug.length < 1 || drug.length > 40) error = 'Medication name must be 1 to 40 characters';
else if (!(doseMg > 0 && doseMg <= 1000)) error = 'Dose must be more than 0 mg (up to 1000 mg)';
else if (!(minIntervalH >= 1 && minIntervalH <= 24)) error = 'Hours between doses must be from 1 to 24';
else if (!(maxMg24h >= doseMg && maxMg24h <= 10000)) error = 'Daily maximum must be at least one dose (' + doseMg + ' mg)';
else if (!(Number.isInteger(goal) && goal >= 0 && goal <= 10)) error = 'Pain goal must be a whole number from 0 to 10';
return [{ json: { valid: !error, error, patientId: String(b.patientId || 'P001'), drug, doseMg, minIntervalH, maxMg24h, goal } }];`;
  const RX_ROW = `// Only the fields the patient can change; name stays as it is
const c = $('Check request').first().json;
const old = $input.all().map((i) => i.json).find((r) => r && String(r.patientId) === c.patientId);
if (!old) throw new Error('No prescription row for patient ' + c.patientId);
return [{ json: { patientId: c.patientId, drug: c.drug, doseMg: c.doseMg, minIntervalH: c.minIntervalH, maxMg24h: c.maxMg24h, goal: c.goal } }];`;
  const RX_REPLY = `// Reply: { ok, message, patient } (same patient shape as /dashboard)
const c = $('Check request').first().json;
const old = $('Get prescription').all().map((i) => i.json).find((r) => r && String(r.patientId) === c.patientId) || {};
return [{ json: { ok: true, message: 'Saved. PainPal will use these limits from now on.',
  patient: { name: old.name, goal: c.goal, drug: c.drug, doseMg: c.doseMg, minIntervalH: c.minIntervalH, maxMg24h: c.maxMg24h } } }];`;
  const X = (i) => i * 220;
  const r4 = [
    place(webhook("Webhook", "POST", "prescription"), [X(0), 300]),
    place(code("Check request", RX_CHECK, "dose > 0, interval 1-24 h, max >= dose, goal 0-10"), [X(1), 300]),
    place(ifNode("Valid request?", "valid", null), [X(2), 300]),
    place(respond("Respond: bad request", {
      respondWith: "json", responseBody: "={{ JSON.stringify({ ok: false, message: $json.error }) }}", options: { responseCode: 400 },
    }), [X(3), 520]),
    place({ parameters: { resource: "row", operation: "get", dataTableId: { __rl: true, mode: "name", value: "prescription" }, returnAll: true },
      name: "Get prescription", type: "n8n-nodes-base.dataTable", typeVersion: 1, executeOnce: true }, [X(3), 300]),
    place(code("Prescription row", RX_ROW), [X(4), 300]),
    place({ parameters: { resource: "row", operation: "update", dataTableId: { __rl: true, mode: "name", value: "prescription" },
      filters: { conditions: [{ keyName: "patientId", condition: "eq", keyValue: "={{ $json.patientId }}" }] },
      columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] }, options: {} },
      name: "Update prescription", type: "n8n-nodes-base.dataTable", typeVersion: 1, alwaysOutputData: true }, [X(5), 300]),
    place(code("Build reply", RX_REPLY), [X(6), 300]),
    place(respond("Respond"), [X(7), 300]),
    sticky("## PainPal · R4 · POST /prescription\nSaves the patient's as-needed medication: drug, dose mg, min hours between doses, " +
      "24 h max, pain goal. Validated here (400 with a message); B4/B6 then use these limits as hard rules.\n" +
      "In real use the prescriber would set these.\n\n**Owner:** Person B · built by n8n/build.js · **Activate** to use `/webhook/prescription`.",
      [-40, -300], 560, 240),
  ];
  const r4Conn = wire([
    ["Webhook", "Check request"], ["Check request", "Valid request?"],
    ["Valid request?", "Get prescription", 0], ["Valid request?", "Respond: bad request", 1],
    ["Get prescription", "Prescription row"], ["Prescription row", "Update prescription"],
    ["Update prescription", "Build reply"], ["Build reply", "Respond"],
  ]);
  fs.writeFileSync(path.join(__dirname, "PainPal-R4-prescription.json"), JSON.stringify({
    name: "PainPal · R4 · POST /prescription", nodes: finish("r4", r4), connections: r4Conn, settings: { executionOrder: "v1" },
  }, null, 2) + "\n");
  console.log(`R4:       n8n/PainPal-R4-prescription.json (${r4.length} nodes)`);
}

// ---------- R3: POST /demo-clock (demo only: moves "now" forward for /log and /dashboard) ----------
{
  const CLOCK_CHECK = `// Validate { advanceMinutes } or { reset: true } (docs/API.md, R3). Bad requests get a 400.
const body = $input.first().json.body || {};
const adv = Number(body.advanceMinutes);
let error = null;
if (body.reset !== true && !(Number.isInteger(adv) && adv >= 1 && adv <= 1440))
  error = 'Send { advanceMinutes: 1 to 1440 } or { reset: true }';
return [{ json: { valid: !error, error, patientId: String(body.patientId || 'P001'), reset: body.reset === true, advanceMinutes: adv || 0 } }];`;
  const NEW_OFFSET = `// New offset = old + advance (max 7 days ahead), or 0 on reset
const c = $('Check request').first().json;
const row = $('Get demo_clock').all().map((i) => i.json).find((r) => r && String(r.patientId) === c.patientId);
const old = row && Number.isFinite(Number(row.offsetMin)) ? Number(row.offsetMin) : 0;
const offsetMin = c.reset ? 0 : Math.min(7 * 24 * 60, old + c.advanceMinutes);
return [{ json: { patientId: c.patientId, offsetMin, exists: !!row } }];`;
  const ROW_ONLY = "// only the table's columns\nconst n = $('New offset').first().json;\nreturn [{ json: { patientId: n.patientId, offsetMin: n.offsetMin } }];";
  const CLOCK_REPLY = `// Reply: { ok, now, offsetMin }
${LOCAL_ISO}
const n = $('New offset').first().json;
return [{ json: { ok: true, now: localIso(new Date(Date.now() + n.offsetMin * 60000)), offsetMin: n.offsetMin } }];`;
  const X = (i) => i * 220;
  const r3 = [
    place(webhook("Webhook", "POST", "demo-clock"), [X(0), 300]),
    place(code("Check request", CLOCK_CHECK), [X(1), 300]),
    place(ifNode("Valid request?", "valid", null), [X(2), 300]),
    place(respond("Respond: bad request", {
      respondWith: "json", responseBody: "={{ JSON.stringify({ ok: false, message: $json.error }) }}", options: { responseCode: 400 },
    }), [X(3), 520]),
    place({ parameters: { resource: "table", operation: "create", tableName: "demo_clock",
      columns: { column: Object.entries(SCHEMA.demo_clock).map(([name, type]) => ({ name, type })) }, options: { createIfNotExists: true } },
      name: "Create demo_clock (if missing)", type: "n8n-nodes-base.dataTable", typeVersion: 1, executeOnce: true }, [X(3), 300]),
    place({ ...getDemoClock(), onError: undefined }, [X(4), 300]),
    place(code("New offset", NEW_OFFSET, "old + advance, or 0 on reset"), [X(5), 300]),
    place(ifNode("Row exists?", "exists", null), [X(6), 300]),
    place(code("Row to update", ROW_ONLY), [X(7), 180]),
    place({ parameters: { resource: "row", operation: "update", dataTableId: { __rl: true, mode: "name", value: "demo_clock" },
      filters: { conditions: [{ keyName: "patientId", condition: "eq", keyValue: "={{ $json.patientId }}" }] },
      columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] }, options: {} },
      name: "Update demo_clock", type: "n8n-nodes-base.dataTable", typeVersion: 1, alwaysOutputData: true }, [X(8), 180]),
    place(code("Row to insert", ROW_ONLY), [X(7), 420]),
    place({ ...insert("demo_clock"), alwaysOutputData: true }, [X(8), 420]),
    place(code("Build reply", CLOCK_REPLY), [X(9), 300]),
    place(respond("Respond"), [X(10), 300]),
    sticky("## PainPal · R3 · POST /demo-clock (DEMO ONLY)\nMoves \"now\" forward so the demo video can show learning without waiting hours. " +
      "`{ advanceMinutes: 30 }` or `{ reset: true }`. B4 /log and B6 /dashboard add the offset from the `demo_clock` table; " +
      "the app always labels it \"Demo time\".\n\n**Owner:** Person B · built by n8n/build.js · **Activate** to use `/webhook/demo-clock`.",
      [-40, -300], 560, 240),
  ];
  const r3Conn = wire([
    ["Webhook", "Check request"], ["Check request", "Valid request?"],
    ["Valid request?", "Create demo_clock (if missing)", 0], ["Valid request?", "Respond: bad request", 1],
    ["Create demo_clock (if missing)", "Get demo_clock"], ["Get demo_clock", "New offset"], ["New offset", "Row exists?"],
    ["Row exists?", "Row to update", 0], ["Row exists?", "Row to insert", 1],
    ["Row to update", "Update demo_clock"], ["Row to insert", "Insert demo_clock"],
    ["Update demo_clock", "Build reply"], ["Insert demo_clock", "Build reply"], ["Build reply", "Respond"],
  ]);
  fs.writeFileSync(path.join(__dirname, "PainPal-R3-demo-clock.json"), JSON.stringify({
    name: "PainPal · R3 · POST /demo-clock", nodes: finish("r3", r3), connections: r3Conn, settings: { executionOrder: "v1" },
  }, null, 2) + "\n");
  console.log(`R3:       n8n/PainPal-R3-demo-clock.json (${r3.length} nodes)`);
}

console.log(`Seed CSVs for ${PATIENT} in n8n/seed/:`, Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));
console.log(`Workflow: ${path.relative(ROOT, wfFile)} (${nodes.length} nodes, Code node ${jsCode.length} chars)`);
