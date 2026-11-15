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
2. **Switch** on `type`: pain / dose / meal / walk
3. pain → **HTTP Request** Open-Meteo current weather (if down, saved without weather) → insert `pain_log`
4. dose → get `prescription` → mg from the prescription (never from the app) → insert `doses`
5. meal → insert `meals`; walk → insert `walks` (`km` empty for manual walks)
6. Get tables → weather → **Compute status** (same as B3)
7. **Code: Build reply**: message; `warning` if the dose was too early / over the 24 h max (+ 811 safety text) or pain ≥ 9
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

## B7: Email updates (`PainPal-B7-email-updates.json`)
Import from URL, then: ✏️ email in the **Settings** node · pick a Gmail credential in **Send email** · **Publish**.
Demo: click *Execute workflow* on **Demo: send emails now**.

Three triggers → Settings → Get tables → weather → **Compute status** (same as B3) → Get `predictions`, `alerts` →
**Code: Decide emails** → **Gmail** (one email each) → Insert `alerts` (each email is sent once):
- **Every 30 min:** heads-up when pain is likely back above goal within 30 min
  ("Pain likely back around 3:10 PM. Your next dose is allowed at 2:45 PM."), or physio is on the calendar (`schedule`) within 3 h
- **Every day 8 PM:** today's average pain vs goal, as-needed doses vs the daily max, walks, and what PainPal learned today
- **Demo button:** sends the heads-up (as if 20 min before pain is back) and today's update right away

Every email links to the app and ends with the 811 safety line and "Demo with synthetic data. Not medical advice."
Tests: `node n8n/test-b7-b9.js`. Simplified from the original plan: no check-in form and no AI weekly summary (B8 dropped).

## B9: Error workflow, optional (`PainPal-B9-error-alerts.json`)
Error Trigger → Settings (✏️ email) → Gmail to the team: workflow name, failed node, error, link to the execution.
Publish it, then in each PainPal workflow: **⋯ → Settings → Error workflow → PainPal · B9 · Error alerts** → Save.

## Export
The repo is the source: `node n8n/build.js` writes every workflow in `n8n/` from `ml/` + `n8n/code/`, and they are imported by URL.
If you change a workflow in the n8n editor, also download it (⋯ → Download) into `n8n/exported/` so the repo matches what ran.
