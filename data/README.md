# Synthetic data

**Everything here is made up.** 30 fictional patients, fictional drugs (*DemoRelief* as-needed, *Baselinol* scheduled), simulated Vancouver weather. Not real patient data. Not medical advice.

It only contains what the app collects: **GPS walks** (distance + minutes, never coordinates), **pain logs**, **medication times**, **meal times**, and **weather**. Patients aren't assumed to be post-surgery.

## Regenerate
```
node data/generate.js                          # history ends now (21 days)
node data/generate.js --now 2026-11-15T09:00   # history ends at this local Vancouver time
```
Same `--seed` (default 17) gives the same patients and doses, so only the dates shift. Run it Sunday morning so the demo's "last 24 h" looks live, then reload the n8n tables.

## Files
| File | One row per | Goes to n8n table |
|---|---|---|
| `prescription.csv` | patient (goal, dose, min interval, 24 h max) | `prescription` |
| `pain_log.csv` | pain log (score, location, note, weather at that hour) | `pain_log` |
| `medications.csv` | dose taken, `kind` = `as-needed` (DemoRelief) or `scheduled` (Baselinol) | `doses` (as-needed rows only) |
| `meals.csv` | meal eaten | `meals` |
| `walks.csv` | GPS walk: start time, km, minutes, source (`auto`/`manual`). **No coordinates** | `walks` |
| `weather.csv` | hour of weather (pressure, temp, rain) | – (live n8n uses Open-Meteo) |
| `training_doses.csv` | as-needed dose with features + `relief_hours` | used by `ml/train.py` |

Demo patient: **P001 "Sam Demo"**, right knee, goal 3/10, DemoRelief 5 mg, every 4 h at most, max 20 mg / 24 h.

## How it's simulated
Each day the patient wakes, takes Baselinol (sometimes late or missed), eats (sometimes skips), and maybe walks.
They take DemoRelief when pain is above their goal **and** the prescription allows it (min interval and 24 h max); otherwise they log "waiting for next allowed dose".

Hours of relief (until pain rises above goal) come from a hidden formula plus noise. Relief is shorter
in the evening, at higher pain, after walking (more km / minutes), with late Baselinol, skipped meals,
falling air pressure, cold, and rain. Each patient also has a hidden **personal offset**, which is what n8n learns per patient.

A pain log at exactly `goal + 1` marks when relief ended (this is what the B5 learning step reads).
If relief would end after bedtime or after "now", the dose is `censored = 1` (end not observed). `ml/train.py` drops those rows.
