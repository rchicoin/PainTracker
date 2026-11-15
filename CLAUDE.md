# PainPal — hackathon project (UBC LOOP x n8n Buildathon, Nov 14–15 2026)

## What it is
A patient-facing web app that learns each patient's personal pain pattern and gives
early heads-ups (e.g. "pain likely back ~3 PM; next dose allowed 2:45 PM"), always
within the patient's prescription limits. Entering the n8n track: n8n must do the real work.

## Architecture (keep it this way)
- app/  React + Vite web app (PWA). ONLY displays data and collects input. No business logic.
- n8n Cloud does ALL logic: saving data, prescription rules, pattern detection,
  prediction, heads-ups, weekly summary. The app calls n8n webhooks.
- data/ synthetic dataset (fictional patients, fictional drugs "Baselinol", "DemoRelief").
- ml/   scikit-learn training: Ridge regression on data/training_doses.csv, exported to
  ml/weights.json. n8n uses the weights plus a per-patient offset updated after each dose.
- n8n/  exported n8n workflow JSON files.

## API contract (app <-> n8n)
POST {VITE_N8N_URL}/log
  { type: "pain", score: 0-10, location?: string }
  { type: "dose" } | { type: "meal" } | { type: "walk", km: number, minutes: number }
  -> { message: string, status: {...} }
GET {VITE_N8N_URL}/dashboard
  -> { painNow, goal, nextDoseAt, mgLeft, reliefHours, painLikelyBackAt,
       chart: [{time, score}], doses: [time], patterns: [string], headsUps: [string] }

## Rules
- Synthetic / public data only. Never real patient data. Demo is DEMO ONLY, not clinical advice.
- Location: ask permission once; track only while the app is open; compute distance on the
  device; send ONLY {km, minutes}. Never send or store coordinates.
- Safety text: if very drowsy/confused, don't take more and call 811 / care team.
- Hackathon rules: build only after 12 PM Sat Nov 14; no edits to repo after 3 PM Sun Nov 15;
  disclose all services used (n8n, Anthropic Claude + Claude Code, Open-Meteo, Vercel, etc.).
- Keep code simple and readable; commit small and often.