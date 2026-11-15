# n8n workflows (Person B)

n8n Cloud: `team17.app.n8n.cloud`. All PainPal workflows live in one project.
Naming: `PainPal · B4 · /log`. Add a sticky note on each canvas: purpose · owner · status.
**Keep logic visible:** rules as IF/Switch nodes; Code nodes small and named clearly.

## Storage (n8n Data Tables, or Google Sheets with the same columns)

| Table | Columns |
|---|---|
| `prescription` | patientId, name, goal, drug, doseMg, minIntervalH, maxMg24h, email |
| `pain_log` | patientId, time, score, note, pressureHpa, tempC, precipMm (no location: the app doesn't send it) |
| `doses` | patientId, time, mg, drug, kind (`as-needed` = DemoRelief, counts toward limits; `scheduled` = Baselinol) |
| `meals` | patientId, time, meal |
| `walks` | patientId, time, km (**empty for manual walks**), minutes, source (`auto`/`manual`) |
| `schedule` | patientId, start, end, title (calendar events, e.g. "Physio session"; synced from Google Calendar) |
| `patient_model` | patientId, offsetHours, dosesLearned, lastUpdated |
| `predictions` | patientId, doseTime, predictedHours, actualHours (filled later), error |

## B1: Load the demo patient (one workflow, no manual table setup)
`n8n/PainPal-Setup.json` creates all 8 tables and loads P001's data from GitHub (`n8n/seed/*.csv`).

1. n8n → **Create workflow** → **⋯** (top right) → **Import from URL** →
   `https://raw.githubusercontent.com/rchicoin/PainTracker/main/n8n/PainPal-Setup.json`
2. Click **Execute workflow**. All nodes go green → open **Data tables** and check that the 8 tables are there.
3. **Warning:** running it again deletes and recreates the tables (resets learning). Only for first setup and the Sunday refresh.

Sunday-morning refresh: `node data/generate.js` → `python ml/train.py` → `node n8n/build.js` → commit + push →
wait ~5 min (GitHub caches raw files) → run Setup again → re-import B3 (new weights).

## Google Calendar → `schedule` (physio heads-ups)
Workflow `PainPal · Calendar sync`: Schedule Trigger (every 30 min) → **Google Calendar: Get many events** (next 7 days) →
Code: map to `{ patientId: "P001", start, end, title }` → Data table **Upsert** into `schedule` (match on `start` + `title`).
B3 reads `schedule`, so it works with the seeded events even before Calendar is connected.

---

## B3: Sub-workflow · Check rules & predict
**Built from the repo:** `n8n/PainPal-B3-check-rules-and-predict.json` (run `node n8n/build.js` to rebuild, `node n8n/test-b3.js` to test locally).
Import: **Create workflow** → **⋯** → **Import from URL** →
`https://raw.githubusercontent.com/rchicoin/PainTracker/main/n8n/PainPal-B3-check-rules-and-predict.json` → **Save**.
The Get nodes find their tables by name, so nothing to select. Click **Execute workflow** to test (pinned input P001).

**Trigger:** When called by another workflow (input: `patientId`, optional `now` for demo mode). Pinned test data: `{ "patientId": "P001" }`.

1. **Get** `prescription`, `doses`, `pain_log`, `meals`, `walks`, `schedule`, `patient_model` (Data table nodes, execute once)
2. **HTTP Request** Open-Meteo hourly pressure / temperature / rain (last 2 days). If it fails, weather counts as average.
3. **Code: Compute status** (weights from `ml/weights.json` are baked in):
   - rules: mg in last 24 h, next allowed time = max(last dose + interval, time when 24 h total allows another dose)
   - predict: features at the last as-needed dose → Ridge + `patient_model.offsetHours` → `painLikelyBackAt`.
     Missing inputs (manual walk `km` empty, no weather, no step counter) count as average, so nothing breaks.
   - patterns: median relief, pain rise after walks > 1 km, hardest time of day, rainy vs dry days
   - heads-ups: pain likely back soon, 24 h max reached, physio on the calendar in the next 3 h
4. **IF** 24 h max reached? → **IF** dose allowed now? → **Set** `rule` text (visible rules on the canvas)
5. Output = the `/dashboard` JSON (`docs/API.md`) plus `status` (for the /log reply) and `prediction` (for B5)

## B4: /log
**Trigger:** Webhook POST `/log` (Respond: using Respond to Webhook; CORS set)

1. **Switch** on `body.type`: pain / dose / meal / walk
2. pain → **HTTP Request** Open-Meteo `current=temperature_2m,pressure_msl,precipitation` (lat 49.26, lon -123.25) → insert `pain_log`
3. dose → insert `doses` → **Code** check too early / over 24 h max → set `warning`
4. meal → insert `meals`; walk → insert `walks`
5. **Execute Workflow** → Check rules & predict
6. **Respond to Webhook** with `{ ok, message, warning, status }`

## B5: Personal learning (inside /log, pain branch)
When a pain log is **above goal** and there's a dose before it with no `actualHours` yet:
1. actualHours = pain time − dose time (skip if > 8 h or a big logging gap)
2. error = actual − predicted
3. `offsetHours = 0.7 × offsetHours + 0.3 × (actual − globalPrediction)`; `dosesLearned += 1`
4. Update `patient_model` and `predictions`
This is the "keeps learning from each patient" part. Show it in the video.

## B6: /dashboard
Webhook GET `/dashboard` → Execute Workflow (Check rules & predict) → Respond with dashboard JSON.

## B7: Heads-ups
Schedule (every 30 min) → for each patient: Check rules & predict →
- **IF** `painLikelyBackAt` within 30 min → Gmail "Pain likely back around 3:00 PM. Next dose allowed 2:45 PM."
- **IF** no pain log in 4 h (awake hours) → Gmail check-in with an n8n Form link ("How's your pain right now?"), which saves to `pain_log`
- Add a **demo mode**: a Manual Trigger + a "pretend now = X" field, so alerts can fire on camera.

## B8: Weekly summary (human in the loop)
Schedule (weekly) + Manual Trigger for the demo →
1. Read the week's data → Code: stats (avg pain, doses, % time above goal, relief vs interval, top factors)
2. **AI Agent (Anthropic Claude)**: write a plain-language summary from the stats only (no invented numbers)
3. **QuickChart**: pain chart image
4. **Gmail: send and wait for approval** to the *patient*: "Share this summary with your prescriber?"
5. Approved → Gmail to prescriber. Declined → log it.

## B9: Error workflow
Error Trigger → Gmail to the team with the workflow name and error. Set it as the error workflow in each workflow's settings.

## Export
For every workflow: ⋯ → Download → save to `n8n/` → commit. Do this after each milestone.
