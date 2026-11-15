# PainTracker
PainTracker: a patient web app that learns your personal pain pattern and warns you before pain returns, always within your prescription limits. Built with React + Vite and powered by n8n workflows and a personalized ML model. Synthetic data only, not medical advice. UBC LOOP x n8n Buildathon 2026.
# PainPal 🩹

**Pain is personal, so your pain plan should be too.**

PainPal is a patient web app that learns your personal pain pattern and gives you a heads-up *before* your pain comes back, always within your prescription limits.

> ⚠️ **Hackathon demo. Synthetic data only. Not medical advice.** All patients and medications in this project ("Baselinol", "DemoRelief") are fictional.

Built for the **UBC LOOP × n8n Buildathon** (Nov 14–15, 2026), n8n track.

---

## The problem

Pain is individual and changes hour to hour. Prescriptions for "as needed" pain medication are written with fixed rules (e.g. "every 4 hours"), but they can't account for when *your* pain tends to return, what makes it worse (activity, weather, missed meals, time of day), or how this changes as you heal. Patients often wait in pain, and prescribers rarely see these patterns.

## What PainPal does

- 📝 **Quick logging:** pain score, medication taken, meals, and walks (tracked automatically while the app is open)
- ⏱ **Prescription-aware status:** when your next dose is allowed and how much is left in the last 24 hours
- 🔮 **Personal prediction:** "Your pain is likely back around 3:00 PM"
- 💡 **Your patterns:** e.g. "Walks over 1 km raise your pain about 2 points"
- 🔔 **Early heads-ups:** proactive alerts before pain returns
- 📄 **Weekly summary:** an AI-written summary you approve before it's shared with your prescriber

PainPal **never suggests anything outside your prescription**. Predictions only change *when* you get a heads-up.

## How it works

```
React web app (PWA) ──► n8n webhooks ──► rules · patterns · prediction · storage
        ▲                                         │
        └──────────── replies & dashboard ◄───────┘
   n8n also runs scheduled heads-ups, learning updates and weekly summaries
```

- **App (`app/`):** React + Vite, installable as a PWA. Displays data and collects input only.
- **n8n (`n8n/`):** all the logic. Saving entries, prescription rules, pattern detection, prediction, alerts and reports.
- **Model (`ml/`):** a personalized linear regression (Ridge), trained on synthetic data with scikit-learn. A per-patient adjustment updates after every dose, so predictions improve as the patient uses the app.
- **Data (`data/`):** synthetic dataset generator (30 fictional patients × 21 days).

## Privacy by design

- Location is used **only while the app is open**, with permission.
- Walk distance is calculated **on the device**. Only distance and duration are sent; coordinates are never sent or stored.

## Project structure

```
painpal/
├── app/    React + Vite web app
├── n8n/    exported n8n workflows (.json)
├── ml/     model training + exported weights
├── data/   synthetic data generator + dataset
└── README.md
```

## Getting started

_Coming soon: setup steps for the app and importing the n8n workflows._

## Data & limitations

- All data is **synthetic** and only reproduces the patterns we programmed into it. It shows the method works, not clinical accuracy.
- Real-world use would require real, consented, de-identified data, clinical validation and regulatory review.

## Built with / disclosures

- [n8n](https://n8n.io) (workflow automation)
- React + Vite (official template)
- Anthropic Claude (AI summaries and text understanding) and Claude Code (coding assistant)
- Open-Meteo (weather data)
- scikit-learn (model training)
- _Add others as you use them (e.g. Vercel, Google Sheets / n8n Data Tables, QuickChart, Gmail)_

## Team

- Reagan Chicoine
- Hamza Riaz
