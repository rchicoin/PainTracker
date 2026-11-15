import { useState } from 'react'

// R4: "My medication". Shows the prescription n8n uses for every dose check, and lets the
// patient enter it from their label. n8n validates and saves it; the app only collects input.
const FIELDS = [
  { key: 'drug', label: 'Medication name', type: 'text', maxLength: 40 },
  { key: 'doseMg', label: 'Dose (mg)', type: 'number', min: 0, step: 'any' },
  { key: 'minIntervalH', label: 'Minimum hours between doses', type: 'number', min: 1, max: 24, step: 'any' },
  { key: 'maxMg24h', label: 'Maximum mg in 24 hours', type: 'number', min: 0, step: 'any' },
  { key: 'goal', label: 'Pain goal (0–10)', type: 'number', min: 0, max: 10, step: 1 },
]

export default function MedicationCard({ patient, busy, onSave }) {
  const [form, setForm] = useState(null) // null = not editing

  if (!patient) return null

  function startEdit() {
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(patient[f.key] ?? '')])))
  }

  function submit(e) {
    e.preventDefault()
    const rx = Object.fromEntries(
      FIELDS.map((f) => [f.key, f.type === 'number' ? Number(form[f.key]) : form[f.key].trim()]),
    )
    onSave(rx, () => setForm(null))
  }

  return (
    <section className="card">
      <h3 className="section-label">My medication</h3>

      {!form && (
        <>
          <p className="med-summary">
            <strong>{patient.drug}</strong> · {patient.doseMg} mg, at least {patient.minIntervalH} h apart · max{' '}
            {patient.maxMg24h} mg in 24 h · pain goal {patient.goal}/10
          </p>
          <button className="btn-small med-edit" disabled={busy} onClick={startEdit}>
            Edit
          </button>
        </>
      )}

      {form && (
        <form className="med-form" onSubmit={submit}>
          <p className="confirm-note small">
            Enter it exactly as on your prescription label. (In real use, your prescriber would set these.)
          </p>
          {FIELDS.map((f) => (
            <label key={f.key} className="med-field">
              <span>{f.label}</span>
              <input
                className="text-input"
                type={f.type}
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                min={f.min}
                max={f.max}
                step={f.step}
                maxLength={f.maxLength}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                required
              />
            </label>
          ))}
          <div className="confirm-row">
            <button type="submit" className="btn-small" disabled={busy}>
              Save
            </button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
