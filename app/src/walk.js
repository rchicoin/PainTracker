// On-device walk detection (A6). Pure functions, no React, so they can be tested.
// Coordinates only ever live in memory here. They are never sent or stored:
// the only thing that leaves this file is { km, minutes }.

const MAX_ACCURACY_M = 40      // ignore fuzzy GPS fixes
const MIN_STEP_M = 10          // smaller moves are GPS jitter while standing still
const MAX_SPEED_MPS = 3.5      // faster than a brisk jog: probably a car or bus, don't count it
const STOP_AFTER_MS = 3 * 60 * 1000  // no movement for 3 min = walk finished
const MIN_WALK_KM = 0.1        // shorter "walks" are ignored
const MIN_WALK_MIN = 2

export const EMPTY = { anchor: null, walk: null }

// Distance in metres between two { lat, lon } points (haversine).
export function metresBetween(a, b) {
  const R = 6371000
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Feed one GPS fix { lat, lon, accuracy, t } and get the new state back.
export function addPoint(state, p) {
  if (p.accuracy > MAX_ACCURACY_M) return state
  if (!state.anchor) return { ...state, anchor: p }

  const d = metresBetween(state.anchor, p)
  if (d < Math.max(MIN_STEP_M, p.accuracy)) return state // not really moving

  const seconds = (p.t - state.anchor.t) / 1000
  if (seconds > 0 && d / seconds > MAX_SPEED_MPS) return { ...state, anchor: p } // vehicle

  const walk = state.walk ?? { startT: state.anchor.t, metres: 0 }
  return { anchor: p, walk: { ...walk, metres: walk.metres + d, lastMoveT: p.t } }
}

// What to show while a walk is in progress, or null.
export function current(state, now) {
  if (!state.walk) return null
  return summary(state.walk, now)
}

// Call regularly. If the walk has ended (stopped moving, or `force` when the
// app is closed), returns { state, result } where result is { km, minutes }
// or null if it was too short to count.
export function finishIfStopped(state, now, force = false) {
  const { walk } = state
  if (!walk) return { state, result: null }
  if (!force && now - walk.lastMoveT < STOP_AFTER_MS) return { state, result: null }

  const s = summary(walk, walk.lastMoveT)
  const result = s.km >= MIN_WALK_KM && s.minutes >= MIN_WALK_MIN ? s : null
  return { state: EMPTY, result } // drop all coordinates
}

function summary(walk, endT) {
  return {
    km: Math.round(walk.metres / 10) / 100,
    minutes: Math.round((endT - walk.startT) / 60000),
  }
}
