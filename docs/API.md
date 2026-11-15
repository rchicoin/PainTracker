# API contract: app ⇄ n8n

The app calls n8n webhooks. Base URL comes from `app/.env`:

```
VITE_N8N_URL=https://team17.app.n8n.cloud/webhook-test   # while testing in the n8n editor
VITE_N8N_URL=https://team17.app.n8n.cloud/webhook        # once workflows are published
```

Every request includes `patientId` (demo: `"P001"`). All times are ISO 8601 strings.
Each n8n Webhook node must allow the app's origin under **Options → Allowed Origins (CORS)**: `http://localhost:5173` and the Vercel URL.

---

## POST `/log`

Request body is one of:

```json
{ "patientId": "P001", "type": "pain",  "score": 6, "note": "after stairs" }
{ "patientId": "P001", "type": "dose" }
{ "patientId": "P001", "type": "meal",  "meal": "lunch" }
{ "patientId": "P001", "type": "walk",  "km": 1.2, "minutes": 18, "source": "auto" }
{ "patientId": "P001", "type": "walk",  "km": null, "minutes": 25, "source": "manual" }
```

- `score`: integer 0–10. `note`: optional. (No body location: the app doesn't collect it.)
- `dose`: n8n uses the dose from the prescription.
- `walk.source`: `"auto"` (GPS while app open) or `"manual"`. Manual walks have no GPS distance, so `km` is `null`
  (n8n estimates km from minutes for the prediction; it stores `km` as empty).
- **Never send coordinates.**

Response:

```json
{
  "ok": true,
  "message": "Logged pain 6/10. Your next dose is allowed at 2:00 PM.",
  "warning": null,
  "status": {
    "nextDoseAt": "2026-11-15T14:00:00-08:00",
    "doseAllowedNow": false,
    "mgUsed24h": 15,
    "mgMax24h": 20,
    "painLikelyBackAt": "2026-11-15T13:40:00-08:00"
  }
}
```

`warning` is a string when something needs attention, e.g. dose taken too early, 24 h max exceeded, pain ≥ 9 ("If pain is severe, new, or comes with other symptoms, contact your care team or call 811.").

---

## GET `/dashboard?patientId=P001`

Response (Person A: use this as the **fake data** until n8n is live):

```json
{
  "patient": { "name": "Sam Demo", "goal": 3, "drug": "DemoRelief (fictional)", "doseMg": 5, "minIntervalH": 4, "maxMg24h": 20 },
  "now": "2026-11-15T11:00:00-08:00",
  "painNow": { "score": 6, "at": "2026-11-15T10:45:00-08:00" },
  "nextDoseAt": "2026-11-15T11:30:00-08:00",
  "doseAllowedNow": false,
  "mgUsed24h": 15,
  "mgMax24h": 20,
  "reliefHours": 3.1,
  "painLikelyBackAt": "2026-11-15T13:40:00-08:00",
  "chart": [
    { "time": "2026-11-14T11:00:00-08:00", "score": 4 },
    { "time": "2026-11-14T13:00:00-08:00", "score": 6 },
    { "time": "2026-11-14T14:00:00-08:00", "score": 2 },
    { "time": "2026-11-14T17:00:00-08:00", "score": 5 },
    { "time": "2026-11-14T20:00:00-08:00", "score": 7 },
    { "time": "2026-11-14T21:00:00-08:00", "score": 3 },
    { "time": "2026-11-15T08:00:00-08:00", "score": 5 },
    { "time": "2026-11-15T09:00:00-08:00", "score": 2 },
    { "time": "2026-11-15T10:45:00-08:00", "score": 6 }
  ],
  "doses": ["2026-11-14T13:00:00-08:00", "2026-11-14T20:00:00-08:00", "2026-11-15T08:00:00-08:00"],
  "walks": [{ "time": "2026-11-14T16:30:00-08:00", "km": 1.3, "minutes": 20 }, { "time": "2026-11-15T09:10:00-08:00", "km": null, "minutes": 25 }],
  "patterns": [
    "Your relief usually lasts about 3 hours.",
    "Walks over 1 km raise your pain about 2 points within 2 hours.",
    "Evenings (6–10 PM) are your hardest time."
  ],
  "headsUps": [
    "Pain likely back around 1:40 PM. Your next dose is allowed at 11:30 AM."
  ],
  "model": { "type": "personalized ridge regression", "personalOffsetMin": -22, "dosesLearnedFrom": 14 }
}
```

`model` is shown in a small "How PainPal learns" card: "Learned from 14 of your doses. Your pain returns about 22 min earlier than average."

---

## Safety rules (app + n8n)

- Never suggest a dose outside the prescription (interval, 24 h max).
- Always show: "Feeling very drowsy or confused? Don't take more. Call 811 or your care team."
- Footer on every screen: "Demo with synthetic data. Not medical advice."
