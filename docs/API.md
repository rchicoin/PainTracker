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

## Round 2 (AGREED Sun Nov 15)
Fake JSON below is for Person A to build against. Times are ISO 8601 with an offset (the app sends the device's offset, e.g. `-08:00`).

### R1 · POST `/log` physio appointment
```json
{ "patientId": "P001", "type": "physio", "at": "2026-11-15T15:00:00-07:00" }
```
- `at`: the appointment start; allowed from 2 h ago to 7 days ahead (otherwise 400).
- Saved to the `schedule` table as "Physio" (45 min). The prediction uses "physio within 2 h after the last dose".
- If the appointment doesn't change the prediction, the message says so: "Your current prediction stays at 1:07 PM (physio counts when it is within 2 h after a dose)."
- Bad `at` → 400 `{ ok: false, message }`; the app shows the message. **Built (R1).**

Response (same shape as other logs):
```json
{
  "ok": true,
  "message": "Physio at 3:00 PM saved. Pain likely back around 2:40 PM (was 3:10 PM).",
  "warning": null,
  "status": { "nextDoseAt": "...", "doseAllowedNow": false, "mgUsed24h": 15, "mgMax24h": 20, "painLikelyBackAt": "2026-11-15T14:40:00-07:00" }
}
```

### R2, R5 · new fields in GET `/dashboard`
```json
{
  "why": [
    { "label": "Evening (6–10 PM)", "minutes": -48 },
    { "label": "Physio soon after your dose", "minutes": -32 },
    { "label": "Walked 1.2 km before the dose", "minutes": -20 },
    { "label": "Your personal pattern", "minutes": 14 }
  ],
  "forecast": [
    { "time": "2026-11-15T12:00:00-07:00", "score": 6 },
    { "time": "2026-11-15T12:45:00-07:00", "score": 2 },
    { "time": "2026-11-15T14:10:00-07:00", "score": 3 },
    { "time": "2026-11-15T14:40:00-07:00", "score": 4 }
  ],
  "upcoming": [ { "time": "2026-11-15T15:00:00-07:00", "title": "Physio" } ],
  "demo": { "active": true, "offsetMin": 120 }
}
```
- `why`: what moved "pain likely back" for the last dose, compared with an average dose; `minutes` < 0 = pain back sooner.
  Biggest effects first (up to 4), plus "Your personal pattern" (the learned offset). Empty if there's no dose yet.
- `forecast`: expected pain from the last dose to `painLikelyBackAt` (dose → relief → back above goal). Draw it dashed.
- `upcoming`: future physio appointments (next 7 days).
- `demo`: present only when the demo clock is shifted. Show "Demo time" whenever `active` is true.

### R3 · POST `/demo-clock`
```json
{ "advanceMinutes": 60 }      // or
{ "reset": true }
```
Response: `{ "ok": true, "now": "2026-11-15T16:40:00-07:00", "offsetMin": 120 }`
- While shifted, `/log` saves entries at the demo time and `/dashboard` uses it for "now". Reset goes back to the real time.
- **Demo only:** the app must label it clearly ("Demo time"), never hide it.

### R4 · POST `/prescription` (one as-needed medication)
```json
{ "patientId": "P001", "drug": "DemoRelief", "doseMg": 5, "minIntervalH": 4, "maxMg24h": 20, "goal": 3 }
```
- Rules (400 with a message if broken): `doseMg` > 0; `minIntervalH` 1–24; `maxMg24h` ≥ `doseMg`; `goal` 0–10 whole number; `drug` 1–40 characters.
- Response: `{ "ok": true, "message": "Saved. PainPal will use these limits from now on.", "patient": { ...same as /dashboard patient } }`
- App note on the form: "Enter it exactly as on your prescription label." (In real use the prescriber would set these.)
- Current values come from `/dashboard` → `patient`.

---

## Safety rules (app + n8n)

- Never suggest a dose outside the prescription (interval, 24 h max).
- Always show: "Feeling very drowsy or confused? Don't take more. Call 811 or your care team."
- Footer on every screen: "Demo with synthetic data. Not medical advice."
