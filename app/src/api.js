// All calls to n8n live here. The app never makes decisions itself.
// Contract: docs/API.md

export const PATIENT_ID = 'P001'

const BASE_URL = import.meta.env.VITE_N8N_URL

// ---- Fake replies (copied from docs/API.md), used until VITE_N8N_URL is set ----

const FAKE_LOG_REPLY = {
  ok: true,
  message: 'Logged (fake reply, n8n not connected yet). Your next dose is allowed at 2:00 PM.',
  warning: null,
  status: {
    nextDoseAt: '2026-11-15T14:00:00-08:00',
    doseAllowedNow: false,
    mgUsed24h: 15,
    mgMax24h: 20,
    painLikelyBackAt: '2026-11-15T13:40:00-08:00',
  },
}

const FAKE_DASHBOARD = {
  patient: { name: 'Sam Demo', goal: 3, drug: 'DemoRelief (fictional)', doseMg: 5, minIntervalH: 4, maxMg24h: 20 },
  now: '2026-11-15T11:00:00-08:00',
  painNow: { score: 6, at: '2026-11-15T10:45:00-08:00' },
  nextDoseAt: '2026-11-15T11:30:00-08:00',
  doseAllowedNow: false,
  mgUsed24h: 15,
  mgMax24h: 20,
  reliefHours: 3.1,
  painLikelyBackAt: '2026-11-15T13:40:00-08:00',
  chart: [
    { time: '2026-11-14T11:00:00-08:00', score: 4 },
    { time: '2026-11-14T13:00:00-08:00', score: 6 },
    { time: '2026-11-14T14:00:00-08:00', score: 2 },
    { time: '2026-11-14T17:00:00-08:00', score: 5 },
    { time: '2026-11-14T20:00:00-08:00', score: 7 },
    { time: '2026-11-14T21:00:00-08:00', score: 3 },
    { time: '2026-11-15T08:00:00-08:00', score: 5 },
    { time: '2026-11-15T09:00:00-08:00', score: 2 },
    { time: '2026-11-15T10:45:00-08:00', score: 6 },
  ],
  doses: ['2026-11-14T13:00:00-08:00', '2026-11-14T20:00:00-08:00', '2026-11-15T08:00:00-08:00'],
  walks: [
    { time: '2026-11-14T16:30:00-08:00', km: 1.3, minutes: 20 },
    { time: '2026-11-15T09:10:00-08:00', km: null, minutes: 25 },
  ],
  patterns: [
    'Your relief usually lasts about 3 hours.',
    'Walks over 1 km raise your pain about 2 points within 2 hours.',
    'Evenings (6–10 PM) are your hardest time.',
  ],
  headsUps: ['Pain likely back around 1:40 PM. Your next dose is allowed at 11:30 AM.'],
  model: { type: 'personalized ridge regression', personalOffsetMin: -22, dosesLearnedFrom: 14 },
}

const fakeDelay = () => new Promise((r) => setTimeout(r, 400))

// ---- Real calls ----

// POST /log. `entry` is one of the bodies in docs/API.md, without patientId.
export async function logEntry(entry) {
  const body = { patientId: PATIENT_ID, ...entry }

  if (!BASE_URL) {
    console.info('[fake] POST /log', body)
    await fakeDelay()
    return FAKE_LOG_REPLY
  }

  const res = await fetch(`${BASE_URL}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Server error (${res.status})`)
  return res.json()
}

// GET /dashboard
export async function getDashboard() {
  if (!BASE_URL) {
    await fakeDelay()
    return FAKE_DASHBOARD
  }

  const res = await fetch(`${BASE_URL}/dashboard?patientId=${encodeURIComponent(PATIENT_ID)}`)
  if (!res.ok) throw new Error(`Server error (${res.status})`)
  return res.json()
}
