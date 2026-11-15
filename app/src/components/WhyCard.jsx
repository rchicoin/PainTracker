// R2: "Why" card. Shows what moved "pain likely back" for the last dose,
// compared with an average dose. Data comes from n8n (`why` in /dashboard);
// the card is hidden until n8n sends it.
// minutes < 0 = pain back sooner, > 0 = later.

export default function WhyCard({ why, before }) {
  if (!why?.length) return null

  const biggest = Math.max(...why.map((w) => Math.abs(w.minutes)), 1)
  const wasByLabel = Object.fromEntries((before ?? []).map((w) => [w.label, w.minutes]))

  return (
    <div className="why">
      <h3 className="section-label">Why this prediction</h3>
      <p className="why-sub muted small">Compared with an average dose, your pain is likely back…</p>
      <ul className="why-list">
        {why.map((w) => {
          const sooner = w.minutes < 0
          const pct = (Math.abs(w.minutes) / biggest) * 50 // half the track each side
          const was = before ? wasByLabel[w.label] : undefined
          const changed = before && was !== w.minutes
          return (
            <li key={w.label} className={`why-row ${changed ? 'is-new' : ''}`}>
              <span className="why-label">{w.label}</span>
              <span className="why-track" aria-hidden="true">
                <span
                  className={`why-bar ${sooner ? 'why-sooner' : 'why-later'}`}
                  style={sooner ? { right: '50%', width: `${pct}%` } : { left: '50%', width: `${pct}%` }}
                />
                <span className="why-zero" />
              </span>
              <span className="why-value">
                {Math.abs(w.minutes)} min {sooner ? 'sooner' : 'later'}
                {changed && was !== undefined && <span className="why-was"> (was {Math.abs(was)})</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
