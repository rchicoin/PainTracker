# Demo video plan (≤ 3:00)

Judges mainly watch the video + Devpost. Every criterion is 25%: technical depth, innovation & impact, design & UX, demo.
**Show the n8n canvas running at least 3 times.**

| Time | Show | Say (roughly) |
|---|---|---|
| 0:00–0:20 | Title + problem | "Pain is personal, but as-needed prescriptions use fixed rules. Patients wait in pain, and prescribers never see the patterns. (Research: hospitalized patients can wait in severe pain while PRN doses are coordinated.)" |
| 0:20–0:50 | App: log pain 7 → reply; dashboard cards | "Log in two taps. PainPal shows when your next dose is allowed and when pain is likely back." |
| 0:50–1:10 | **n8n canvas** lighting up for /log | "n8n does the work: weather, saving, prescription rules, prediction." |
| 1:10–1:35 | Walk logged automatically → pattern reply | "Walks are tracked while the app is open. Only distance leaves the phone." |
| 1:35–2:00 | **Learning**: patient_model offset changes; prediction moves | "It learns each patient. Sam's pain returns 22 min earlier than average, so heads-ups come earlier." |
| 2:00–2:25 | Add "Physio" to Google Calendar → n8n **Calendar sync** → dashboard: earlier "pain likely back" + physio heads-up | "n8n pulls physio from your calendar. Pain usually comes back sooner after physio, so PainPal warns you earlier." |
| 2:25–2:50 | n8n overview of all workflows + safety | "It never suggests anything outside the prescription. Synthetic data only." |
| 2:50–3:00 | Close | "PainPal: your pain, your pattern." |

## Before recording
- Regenerate demo data so "last 24 h" looks live
- Put a "Physio" event in Google Calendar about 1 h after the dose you'll log, ready to sync on camera
- Phone with the installed PWA (home-screen icon)
- Don't show real addresses, emails, or keys
