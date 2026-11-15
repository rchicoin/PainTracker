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

// ---------- B8 ----------
const b8 = load("PainPal-B8-weekly-summary.json");
const out8 = Object.fromEntries(TABLES.map((t) => [`Get ${t}`, wrap(db[t])]));
out8["Get weather (Open-Meteo)"] = [{ json: {} }];
out8["Get predictions"] = wrap([{ patientId: "P001", doseTime: db.doses[db.doses.length - 1].time, predictedHours: 2, actualHours: 2.5, error: 0.5 }]);
out8.Settings = run(withEmail(codeOf(b8, "Settings")).replace("const PRESCRIBER_TO = 'prescriber@example.com';",
  "const PRESCRIBER_TO = 'doc@example.org';"), out8, [{ json: {} }]);
out8["Compute status"] = run(codeOf(b8, "Compute status"), out8, []);
out8["Weekly stats"] = run(codeOf(b8, "Weekly stats"), out8, []);
const w8 = out8["Weekly stats"][0].json;
console.log(`\nB8 stats: ${JSON.stringify({ ...w8.stats, days: w8.stats.days.map((d) => `${d.day}:${d.avgPain}/${d.mg}mg`).join(" ") })}`);
console.log(`B8 Claude request: model ${w8.claudeRequest.model}, effort ${w8.claudeRequest.output_config.effort}, ` +
  `temperature sent: ${"temperature" in w8.claudeRequest}, chart URL ${w8.chartUrl.length} chars`);
const fakeClaude = { model: "claude-opus-5-5", stop_reason: "end_turn",
  content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Hi Sam, this week went <well>.\n\nKeep it up." }] };
const e1 = run(codeOf(b8, "Summary email"), out8, [{ json: fakeClaude }])[0].json;
const e2 = run(codeOf(b8, "Summary email"), out8, [{ json: { error: { message: "no credential" } } }])[0].json;
const e3 = run(codeOf(b8, "Summary email"), out8, [{ json: { stop_reason: "refusal", content: [] } }])[0].json;
console.log(`B8 email with Claude -> writtenBy "${e1.writtenBy}", text escaped: ${e1.html.includes("&lt;well&gt;")}, to ${e1.sendTo}, prescriber ${e1.prescriberTo}`);
console.log(`B8 email, Claude failed -> writtenBy "${e2.writtenBy}": ${e2.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 230)}…`);
console.log(`B8 email, Claude refused -> writtenBy "${e3.writtenBy}"`);
console.log(`B8 approval text: ${e1.approvalText}`);

const err = run(withEmail(codeOf(b9, "Settings")), {}, [{ json: {
  workflow: { name: "PainPal · B4 · POST /log" },
  execution: { lastNodeExecuted: "Insert pain_log", url: "https://team17.app.n8n.cloud/execution/1", error: { message: "Table <x> not found" } },
} }])[0].json;
console.log(`\nB9 error email -> ${err.subject}\n  ${err.html}`);
