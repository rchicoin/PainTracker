# n8n workflows (Person B)

n8n Cloud: `team17.app.n8n.cloud`. All PainPal workflows live in one project.
Naming: `PainPal · B4 · /log`. Add a sticky note on each canvas: purpose · owner · status.
**Keep logic visible:** rules as IF/Switch nodes; Code nodes small and named clearly.

## Storage (n8n Data Tables, or Google Sheets with the same columns)

| Table | Columns |
|---|---|
| `prescription` | patientId, name, goal, drug, doseMg, minIntervalH, maxMg24h, email |
| `pain_log` | patientId, time, score, location, note, pressureHpa, tempC, precipMm |
| `doses` | patientId, time, mg |
| `meals` | patientId, time, meal |
| `walks` | patientId, time, km, minutes, source |
| `patient_model` | patientId, offsetHours, dosesLearned, lastUpdated |
| `predictions` | patientId, doseTime, predictedHours, actualHours (filled later), error |

Load demo history for one patient from `data/` (pain_log.csv, medications.csv, meals.csv, schedule.csv).

---

## Sub-workflow: Check rules & predict
**Trigger:** Execute Workflow Trigger (input: `patientId`)

1. Read `prescription`, `doses` (last 48 h), `pain_log` (last 7 days), `walks`, `meals`, `patient_model`
2. **Code: compute status**: last dose, mg in last 24 h, next allowed time = max(last dose + interval, time when 24 h total allows another dose)
3. **IF** dose allowed now? / **IF** 24 h max reached?
4. HTTP Request: GET `ml/weights.json` from GitHub (raw URL), or paste weights into the Code node
5. **Code: predict**: features at last dose → Ridge prediction + `patient_model.offsetHours` → `painLikelyBackAt`
6. **Code: patterns**: median relief, average pain rise after walks > 1 km, worst time of day
7. Return everything the dashboard needs (`docs/API.md`)

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
