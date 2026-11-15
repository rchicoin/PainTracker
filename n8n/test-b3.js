// Runs the exact Code-node JavaScript from the B3 workflow JSON against n8n/seed/*.csv,
// with a fake `$` that behaves like n8n's. Usage: node n8n/test-b3.js [--now ISO]
const fs = require("fs");
const path = require("path");

const wf = JSON.parse(fs.readFileSync(path.join(__dirname, "PainPal-B3-check-rules-and-predict.json"), "utf8"));
const code = wf.nodes.find((n) => n.name === "Compute status").parameters.jsCode;

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  // like a Data Table: numbers come back as numbers, blanks as null
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) =>
    [cols[i], v === "" ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));
}
const seed = (t) => readCsv(path.join(__dirname, "seed", `${t}.csv`));
const tables = ["prescription", "doses", "pain_log", "meals", "walks", "schedule", "patient_model"];

function run({ now, weather = null, extraWalks = [] }) {
  const outputs = {
    "When called by another workflow": [{ json: { patientId: "P001", now } }],
    "Get weather (Open-Meteo)": [{ json: weather || {} }],
  };
  for (const t of tables) outputs[`Get ${t}`] = seed(t).map((json) => ({ json }));
  outputs["Get walks"].push(...extraWalks.map((json) => ({ json })));
  const $ = (name) => ({ all: () => outputs[name], first: () => outputs[name][0] });
  return new Function("$", code)($)[0].json;
}

// "now" = 10 min after the last pain log, so the demo looks live
const pains = seed("pain_log");
const lastPain = new Date(pains[pains.length - 1].time);
const now = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1]
  : new Date(lastPain.getTime() + 10 * 60000).toISOString();

const fakeWeather = (() => { // Open-Meteo shape, timezone=GMT
  const time = [], p = [], t = [], r = [];
  for (let h = -48; h <= 24; h++) {
    const d = new Date(Math.floor(new Date(now).getTime() / 3600000) * 3600000 + h * 3600000);
    time.push(d.toISOString().slice(0, 16)); p.push(1010 + h * 0.1); t.push(6); r.push(h % 5 === 0 ? 0.6 : 0);
  }
  return { hourly: { time, pressure_msl: p, temperature_2m: t, precipitation: r } };
})();

const a = run({ now, weather: fakeWeather });
const { chart, prediction, ...rest } = a;
console.log(JSON.stringify({ ...rest, chart: `${chart.length} points`, prediction: { ...prediction, features: "…" } }, null, 2));

const b = run({ now, weather: null, extraWalks: [{ patientId: "P001", time: new Date(new Date(now) - 3600000).toISOString(), km: null, minutes: 25, source: "manual" }] });
const c = run({ now: new Date(new Date(now).getTime() + 30 * 3600000).toISOString() });
console.log("\nChecks:");
console.log(`  manual walk km=null + Open-Meteo down -> reliefHours ${b.reliefHours} (finite: ${Number.isFinite(b.reliefHours)}), walks last 24 h include null km: ${b.walks.some((w) => w.km === null)}`);
console.log(`  30 h later (no recent doses) -> doseAllowedNow ${c.doseAllowedNow}, mgUsed24h ${c.mgUsed24h}`);
console.log(`  mgUsed24h ${a.mgUsed24h} <= max ${a.mgMax24h}: ${a.mgUsed24h <= a.mgMax24h}; nextDoseAt ${a.nextDoseAt}`);
