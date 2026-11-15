// A6: automatic walk tracking card (switch + live status).
export default function WalkTracker({ tracker }) {
  const { enabled, status, live, turnOn, turnOff } = tracker

  return (
    <section className="card">
      <div className="walk-head">
        <h3 className="section-label">🚶 Auto walk tracking</h3>
        {status !== 'unsupported' && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            className={`switch ${enabled ? 'switch-on' : ''}`}
            onClick={enabled ? turnOff : turnOn}
          >
            <span className="switch-knob" />
            <span className="sr-only">Track my walks</span>
          </button>
        )}
      </div>

      <p className="walk-status">{statusText(status, live)}</p>
      <p className="muted small" style={{ margin: 0 }}>
        Only while the app is open. Distance is worked out on your phone; only km and minutes are
        sent. Your location is never sent or saved.
      </p>
    </section>
  )
}

function statusText(status, live) {
  switch (status) {
    case 'unsupported':
      return "This browser can't track location."
    case 'denied':
      return 'Location permission was blocked. Allow it in your browser settings to track walks.'
    case 'starting':
    case 'searching':
      return 'Looking for GPS…'
    case 'on':
      return live
        ? `Walking now: ${live.km.toFixed(2)} km · ${live.minutes} min`
        : 'On. A walk is logged when you stop moving for 3 minutes.'
    default:
      return 'Off. Turn on to log walks automatically.'
  }
}
