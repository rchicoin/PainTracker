import { useState } from 'react'
import { formatTime } from '../format.js'

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

// A3: quick logging for dose, meal and a manual walk.
// `dash` (optional) is the latest /dashboard reply, used only to display prescription info.
export default function QuickActions({ onLog, busy, dash }) {
  const [showMeals, setShowMeals] = useState(false)
  const [confirmDose, setConfirmDose] = useState(false)
  const [walkMin, setWalkMin] = useState('')

  function logWalk(e) {
    e.preventDefault()
    const minutes = Number(walkMin)
    if (!minutes || minutes <= 0) return
    // Manual walks have no GPS distance, so km is null (see docs/API.md).
    onLog({ type: 'walk', km: null, minutes, source: 'manual' }, () => setWalkMin(''))
  }

  return (
    <section className="card">
      <h2>Quick log</h2>

      <button className="btn-quick" disabled={busy} onClick={() => setConfirmDose(!confirmDose)}>
        💊 Took my dose
      </button>
      {confirmDose && (
        <div className="confirm">
          {dash && (
            <p>
              Log <strong>{dash.patient.doseMg} mg {dash.patient.drug}</strong> taken now?
              {!dash.doseAllowedNow && (
                <span className="confirm-note">
                  {' '}Your prescription allows the next dose at <strong>{formatTime(dash.nextDoseAt)}</strong>.
                </span>
              )}
            </p>
          )}
          {!dash && <p>Log your dose taken now?</p>}
          <div className="confirm-row">
            <button
              className="btn-small"
              disabled={busy}
              onClick={() => onLog({ type: 'dose' }, () => setConfirmDose(false))}
            >
              Yes, I took it
            </button>
            <button className="btn-ghost" onClick={() => setConfirmDose(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <button className="btn-quick" disabled={busy} onClick={() => setShowMeals(!showMeals)}>
        🍽 Ate a meal
      </button>
      {showMeals && (
        <div className="chips">
          {MEALS.map((m) => (
            <button
              key={m}
              className="chip"
              disabled={busy}
              onClick={() => onLog({ type: 'meal', meal: m.toLowerCase() }, () => setShowMeals(false))}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <form className="walk-row" onSubmit={logWalk}>
        <span>🚶 I walked ~</span>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="600"
          className="text-input walk-input"
          value={walkMin}
          onChange={(e) => setWalkMin(e.target.value)}
          aria-label="Walk minutes"
        />
        <span>min</span>
        <button type="submit" className="btn-small" disabled={busy || !walkMin}>
          Log
        </button>
      </form>
    </section>
  )
}
