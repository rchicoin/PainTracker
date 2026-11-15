// All calls to n8n live here. The app never makes decisions itself.
// Contract: docs/API.md

export const PATIENT_ID = 'P001'

const BASE_URL = import.meta.env.VITE_N8N_URL

// True until VITE_N8N_URL is set: the app shows fake data and says so.
export const USING_FAKE_DATA = !BASE_URL

// fetch + JSON with friendly error messages.
async function request(url, options) {
  let res
  try {
    res = await fetch(url, options)
  } catch {
    throw new Error(navigator.onLine ? "Can't reach PainTracker right now" : 'You seem to be offline')
  }
  if (res.status === 400) {
    // n8n explains what was wrong, e.g. "Physio time must be between 2 hours ago and 7 days ahead"
    const body = await res.json().catch(() => null)
    throw new Error(body?.message || 'Please check what you entered')
  }
  if (!res.ok) throw new Error(`Something went wrong on our side (error ${res.status})`)
  return res.json()
}

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
  // Round 2 (R2), proposed in docs/API.md
  why: [
    { label: 'Evening (6–10 PM)', minutes: -48 },
    { label: 'Physio soon after your dose', minutes: -32 },
    { label: 'Walked 1.2 km before the dose', minutes: -20 },
    { label: 'Your personal pattern', minutes: 14 },
  ],
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

  return request(`${BASE_URL}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// R4: POST /prescription. n8n validates it (400 with a message if a value is out of range).
export async function savePrescription(rx) {
  const body = { patientId: PATIENT_ID, ...rx }

  if (!BASE_URL) {
    console.info('[fake] POST /prescription', body)
    await fakeDelay()
    return { ok: true, message: 'Saved (fake reply, n8n not connected yet).', patient: { ...FAKE_DASHBOARD.patient, ...rx } }
  }

  return request(`${BASE_URL}/prescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// R3: POST /demo-clock with { advanceMinutes } or { reset: true }. Demo only; the app always shows "Demo time".
let fakeOffsetMin = 0
export async function setDemoClock(change) {
  if (!BASE_URL) {
    console.info('[fake] POST /demo-clock', change)
    await fakeDelay()
    fakeOffsetMin = change.reset ? 0 : fakeOffsetMin + change.advanceMinutes
    return { ok: true, offsetMin: fakeOffsetMin }
  }

  return request(`${BASE_URL}/demo-clock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patientId: PATIENT_ID, ...change }),
  })
}

// GET /dashboard
export async function getDashboard() {
  if (!BASE_URL) {
    await fakeDelay()
    return FAKE_DASHBOARD
  }

  return request(`${BASE_URL}/dashboard?patientId=${encodeURIComponent(PATIENT_ID)}`)
}
