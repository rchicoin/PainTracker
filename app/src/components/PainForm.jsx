import { useState } from 'react'

// A2: pain slider 0–10, optional note, "Log pain".
export default function PainForm({ onLog, busy }) {
  const [score, setScore] = useState(5)
  const [note, setNote] = useState('')

  function submit(e) {
    e.preventDefault()
    const entry = { type: 'pain', score }
    if (note.trim()) entry.note = note.trim()
    onLog(entry, () => setNote(''))
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>How's your pain right now?</h2>

      <div className="score-row">
        <span className="score">{score}</span>
        <span className="muted">/ 10</span>
      </div>
      <input
        type="range"
        min="0"
        max="10"
        step="1"
        value={score}
        onChange={(e) => setScore(Number(e.target.value))}
        aria-label="Pain score from 0 to 10"
        className="slider"
      />
      <div className="slider-labels muted">
        <span>0 none</span>
        <span>10 worst</span>
      </div>

      <input
        type="text"
        className="text-input"
        placeholder="Note (optional), e.g. after stairs"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
      />

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Log pain'}
      </button>
    </form>
  )
}
