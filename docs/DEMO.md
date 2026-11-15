# Demo video plan (≤ 3:00)

Judges mainly watch the video + Devpost. Every criterion is 25%: technical depth, innovation & impact, design & UX, demo.
**Show the n8n canvas running at least 3 times.**

| Time | Show | Say (roughly) |
|---|---|---|
| 0:00–0:20 | Title + problem | "Pain is personal, but as-needed prescriptions use fixed rules. Patients wait in pain, and prescribers never see the patterns. (Research: hospitalized patients can wait in severe pain while PRN doses are coordinated.)" |
| 0:20–0:50 | App: log pain 7 → reply; dashboard cards | "Log in two taps. PainTracker shows when your next dose is allowed and when pain is likely back." |
| 0:50–1:10 | **n8n canvas** lighting up for /log | "n8n does the work: weather, saving, prescription rules, prediction." |
| 1:10–1:35 | Walk logged automatically → pattern reply | "Walks are tracked while the app is open. Only distance leaves the phone." |
| 1:35–2:00 | **Learning**: patient_model offset changes; prediction moves | "It learns each patient. Sam's pain returns 22 min earlier than average, so heads-ups come earlier." |
| 2:00–2:25 | **Safety**: tap "Took my dose" too early → warning + 811 text; dashboard heads-ups (e.g. physio) | "Rules always come first: n8n checks the interval and the 24 h maximum on every dose, and warns before pain comes back." |
| 2:25–2:50 | n8n overview of all workflows + safety | "It never suggests anything outside the prescription. Synthetic data only." |
| 2:50–3:00 | Close | "PainTracker: your pain, your pattern." |

## Before recording
- Regenerate demo data so "last 24 h" looks live
- Log a real dose 1–3 h before filming the learning clip (pain above goal after it triggers "PainTracker learned…"; until n8n's reply text is renamed it still says "PainPal learned…")
- Phone with the installed PWA (home-screen icon)
- Don't show real addresses, emails, or keys
