import { formatTime } from '../format.js'

// R3: demo clock bar. n8n moves "now" forward (POST /demo-clock) so the demo video can show
// learning without waiting hours. Always clearly labelled; never hidden while active.
export default function DemoClock({ dash, busy, onChange }) {
  const demo = dash?.demo
  const active = Boolean(demo?.active)
  const ahead = active ? formatOffset(demo.offsetMin) : null

  return (
    <div className={`demo-clock${active ? ' is-active' : ''}`} role="status">
      <span className="demo-clock-label">
        🕒 {active ? (
          <>
            Demo time <strong>{formatTime(dash.now)}</strong>
            <span className="small"> ({ahead} ahead of real time)</span>
          </>
        ) : (
          'Demo clock: real time'
        )}
      </span>
      <span className="demo-clock-buttons">
        <button className="btn-small" disabled={busy || !dash} onClick={() => onChange({ advanceMinutes: 30 })}>
          +30 min
        </button>
        <button className="btn-small" disabled={busy || !dash} onClick={() => onChange({ advanceMinutes: 60 })}>
          +1 h
        </button>
        <button className="btn-ghost" disabled={busy || !active} onClick={() => onChange({ reset: true })}>
          Reset
        </button>
      </span>
    </div>
  )
}

function formatOffset(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ') || '0 min'
}
