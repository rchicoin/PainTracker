# PainTracker: hackathon project (UBC LOOP × n8n Buildathon, Nov 14–15 2026)

## Read these first
- `PLAN.md`: roles, task list (A1–A8 app, B1–B9 n8n/model), timeline, deadlines
- `docs/API.md`: the contract between the app and n8n (request/response JSON, fake data)
- `docs/N8N.md`: every n8n workflow, node by node, and the data tables
- `docs/MODEL.md`: the prediction model (personalized Ridge regression + per-patient offset)
- `docs/DEMO.md`: the 3-minute demo video plan

## What it is
A patient-facing web app that learns each patient's personal pain pattern and gives early
heads-ups (e.g. "pain likely back ~3 PM; next dose allowed 2:45 PM"), always within the
patient's prescription limits. Entering the n8n track: n8n must do the real work.

## Architecture (keep it this way)
- `app/`: React + Vite web app (PWA). ONLY displays data and collects input. No business
  logic (no rule checks, no predictions in React). API calls go in `app/src/api.js`.
- n8n Cloud (`team17.app.n8n.cloud`) does ALL logic: saving data, prescription rules,
  patterns, prediction, learning, heads-ups (shown in the app). No emails.
- `data/`: synthetic dataset (fictional patients; fictional drugs "Baselinol", "DemoRelief").
- `ml/`: scikit-learn training → `ml/weights.json`; JS prediction helpers for n8n Code nodes.
- `n8n/`: exported n8n workflow JSON files.

## Rules
- Synthetic / public data only. Never real patient data. "Demo with synthetic data. Not medical advice."
- Never suggest a dose outside the prescription. Safety text: "Feeling very drowsy or confused?
  Don't take more. Call 811 or your care team."
- Location: ask permission once; track only while the app is open; compute distance on the
  device; send ONLY {km, minutes}. Never send or store coordinates.
- Secrets/URLs in `app/.env` (gitignored). Never commit keys.
- Hackathon: build only after 12 PM Sat Nov 14; NO repo edits after 3 PM Sun Nov 15;
  disclose all services (n8n, Anthropic Claude, Claude Code, Open-Meteo, Vercel, React+Vite template, etc.).
- Keep code simple and readable. Mobile-first UI. Commit small and often.
- When you finish a task, tick it in `PLAN.md`.
