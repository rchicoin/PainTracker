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
| `schedule` | patientId, start, end, title (calendar events, e.g. "Physio session"; seeded demo data) |
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

## Physio schedule (seeded demo data + R1 entry in the app)
The `schedule` table holds physio appointments loaded by Setup from `n8n/seed/schedule.csv`, plus any the patient
adds in the app (R1: `/log` with `type: "physio"`). B4 /log and B6 /dashboard read it:
a physio appointment within 2 h after a dose shortens the predicted relief (feature `physio_next_2h`, about −30 min),
and the dashboard shows a physio heads-up. (A live Google Calendar sync was planned as B7 and dropped to keep it simple.)

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

## Import B4 and B6 (the app's two endpoints)
For each URL: **Create workflow** → **⋯** → **Import from URL** → **Save** → switch **Active** on (top right).
- B4: `https://raw.githubusercontent.com/rchicoin/PainTracker/main/n8n/PainPal-B4-log.json`
- B6: `https://raw.githubusercontent.com/rchicoin/PainTracker/main/n8n/PainPal-B6-dashboard.json`

Then the app uses `VITE_N8N_URL=https://team17.app.n8n.cloud/webhook` (set it in Vercel → Settings → Environment Variables, then redeploy).
CORS allows `https://pain-tracker-rosy.vercel.app` and `http://localhost:5173`.
B4 and B6 contain the same "Get tables → weather → Compute status" nodes as B3 (built from the same source), so they need no
sub-workflow ID. B3 stays as the sub-workflow for B7 and for testing. Local tests: `node n8n/test-api.js`.

## B4: /log
**Trigger:** Webhook POST `/log` (Respond to Webhook; CORS set)

1. **Code: Check request** → **IF** valid? (no → 400 `{ ok: false, message }`)
2. **Switch** on `type`: pain / dose / meal / walk / physio
3. pain → **HTTP Request** Open-Meteo current weather (if down, saved without weather) → insert `pain_log`
4. dose → get `prescription` → mg from the prescription (never from the app) → insert `doses`
5. meal → insert `meals`; walk → insert `walks` (`km` empty for manual walks);
   physio (R1) → **Physio row** (`at` → 45 min appointment titled "Physio") → insert `schedule`
6. Get tables → weather → **Compute status** (same as B3; for physio it also predicts *without* the new appointment → `before`)
7. **Code: Build reply**: message (physio: "Pain likely back around 1:07 PM (was 1:39 PM)"); `warning` if the dose was too early / over the 24 h max (+ 811 safety text) or pain ≥ 9
8. **Respond to Webhook** with `{ ok, message, warning, status }`

## B5: Personal learning (inside B4 /log, after Compute status)
Code: `n8n/code/learn.js` (node **B5: learn from last dose**). When a pain log is **above goal** and the last as-needed dose
has no row in `predictions` yet:
1. actualHours = first pain log above goal after the dose − dose time (skip if < 15 min or > 8 h)
2. predicted = model + current offset, using the features at the dose (weather from Open-Meteo hourly)
3. `offsetHours = 0.7 × offsetHours + 0.3 × (actual − globalPrediction)`; `dosesLearned += 1`
4. **IF** Learned? → **Update** `patient_model` (where patientId = …) → **Insert** `predictions` (predicted, actual, error)
5. Reply adds "PainPal learned from your last dose: relief lasted 2.5 h (predicted 3.2 h)." and `learned: {…}`

Each dose is learned from once. This is the "keeps learning from each patient" part. Show it in the video:
log a dose → later log pain above goal → the reply says what it learned → dashboard "Learned from N doses" goes up.

## B6: /dashboard
Webhook GET `/dashboard?patientId=P001` (optional `&now=ISO` for demo mode) → Get tables → weather → **Compute status** → Respond with the dashboard JSON.

## Dropped to keep it simple
No emails: heads-ups are shown in the app (`headsUps` from /dashboard). Removed from the plan: heads-up emails and
Google Calendar sync (B7), the weekly AI summary (B8), and error-alert emails (B9).

## Export
The repo is the source: `node n8n/build.js` writes every workflow in `n8n/` from `ml/` + `n8n/code/`, and they are imported by URL.
If you change a workflow in the n8n editor, also download it (⋯ → Download) into `n8n/exported/` so the repo matches what ran.
