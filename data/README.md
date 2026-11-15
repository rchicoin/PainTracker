# Synthetic data

**Everything here is made up.** 30 fictional patients, fictional drugs (*DemoRelief* as-needed, *Baselinol* scheduled), simulated Vancouver weather. Not real patient data. Not medical advice.

It only contains what the app and n8n collect: **walks** (GPS km + minutes, never coordinates; manual walks have minutes only), **step counts**, **pain scores**, **medication times**, **meal times**, **weather**, and **calendar events** (physio, planned walks) that n8n reads from Google Calendar. Patients aren't assumed to be post-surgery.

## Regenerate (then retrain and rebuild the n8n files)
```
node data/generate.js                          # history ends now (21 days)
node data/generate.js --now 2026-11-15T09:00   # history ends at this local Vancouver time
python ml/train.py
node n8n/build.js
```
Same `--seed` (default 17) gives the same patients and doses, so only the dates shift. Run it Sunday morning so the demo's "last 24 h" looks live, then reload the n8n tables.

## Files
| File | One row per | Goes to n8n table |
|---|---|---|
| `prescription.csv` | patient (goal, dose, min interval, 24 h max) | `prescription` |
| `pain_log.csv` | pain log (score, note, weather at that hour) | `pain_log` |
| `medications.csv` | dose taken, `kind` = `as-needed` (DemoRelief) or `scheduled` (Baselinol) | `doses` |
| `meals.csv` | meal eaten | `meals` |
| `walks.csv` | walk: start time, km (**empty for manual walks**), minutes, source (`auto`/`manual`). **No coordinates** | `walks` |
| `schedule.csv` | calendar event (start, end, title: "Physio session" or "Walk"); includes upcoming events | `schedule` |
| `weather.csv` | hour of weather (pressure, temp, rain) | – (live n8n uses Open-Meteo) |
| `training_doses.csv` | as-needed dose with features + `relief_hours` | used by `ml/train.py` |

`n8n/build.js` turns these into per-table import files for the demo patient in `n8n/seed/`.

Demo patient: **P001 "Sam Demo"**, goal 3/10, DemoRelief 5 mg, every 4 h at most, max 20 mg / 24 h.

## How it's simulated
Each day the patient wakes, takes Baselinol (sometimes late or missed), eats (sometimes skips), maybe walks, and some days has physio on the calendar.
They take DemoRelief when pain is above their goal **and** the prescription allows it (min interval and 24 h max); otherwise they log "waiting for next allowed dose".

Hours of relief (until pain rises above goal) come from a hidden formula plus noise. Relief is shorter
in the evening, at higher pain, after walking and more steps, with physio soon after the dose, with late Baselinol,
skipped meals, falling air pressure, cold, and rain. Each patient also has a hidden **personal offset**, which is what n8n learns per patient.

Steps: the app has no step counter yet, so steps = household baseline + 1300 per km walked (n8n estimates the same way).

A pain log at exactly `goal + 1` marks when relief ended (this is what the B5 learning step reads).
If relief would end after bedtime or after "now", the dose is `censored = 1` (end not observed). `ml/train.py` drops those rows.
