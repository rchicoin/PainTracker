import { useState } from 'react'
import { formatTime, toLocalIso } from '../format.js'

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

// A3: quick logging for dose, meal and a manual walk.
// `dash` (optional) is the latest /dashboard reply, used only to display prescription info.
export default function QuickActions({ onLog, busy, dash }) {
  const [showMeals, setShowMeals] = useState(false)
  const [confirmDose, setConfirmDose] = useState(false)
  const [walkMin, setWalkMin] = useState('')
  const [showPhysio, setShowPhysio] = useState(false)
  const [physioDay, setPhysioDay] = useState(0) // 0 = today, 1 = tomorrow
  const [physioTime, setPhysioTime] = useState('15:00')

  // R1: n8n saves the appointment and replies with how the prediction moved.
  function logPhysio(e) {
    e.preventDefault()
    if (!physioTime) return
    onLog({ type: 'physio', at: toLocalIso(physioDay, physioTime) }, () => setShowPhysio(false))
  }

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

      <button className="btn-quick" disabled={busy} onClick={() => setShowPhysio(!showPhysio)}>
        🩺 Physio / appointment
      </button>
      {showPhysio && (
        <form className="confirm" onSubmit={logPhysio}>
          <div className="chips">
            {['Today', 'Tomorrow'].map((label, i) => (
              <button
                key={label}
                type="button"
                className={`chip${physioDay === i ? ' chip-on' : ''}`}
                aria-pressed={physioDay === i}
                onClick={() => setPhysioDay(i)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="confirm-row physio-row">
            <span>at</span>
            <input
              type="time"
              className="text-input physio-input"
              value={physioTime}
              onChange={(e) => setPhysioTime(e.target.value)}
              aria-label="Appointment time"
              required
            />
            <button type="submit" className="btn-small" disabled={busy || !physioTime}>
              Save
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowPhysio(false)}>
              Cancel
            </button>
          </div>
        </form>
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
