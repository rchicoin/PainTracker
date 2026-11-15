import { useState } from 'react'
import { formatTime } from '../format.js'

// Last-24 h pain chart: blue line = pain, dashed green = your goal,
// purple lines = doses, small marks at the bottom = walks,
// dashed blue = expected pain after the last dose (R5 `forecast` from n8n; can reach past now).
// Drawn in a 0–100 box stretched to fit; strokes stay crisp with non-scaling-stroke.

const H24 = 24 * 60 * 60 * 1000
const MAX_AHEAD = 6 * 60 * 60 * 1000 // show at most 6 h of forecast past now
const y = (score) => 92 - score * 8.4 // 0 → 92, 10 → 8

export default function PainChart({ now, chart, doses, walks, goal, prev, forecast = [] }) {
  const [hover, setHover] = useState(null)

  const nowMs = new Date(now).getTime()
  const start = nowMs - H24
  // If the forecast reaches past now, stretch the chart so its end is visible.
  const forecastEnd = forecast.length ? new Date(forecast.at(-1).time).getTime() : nowMs
  const end = Math.min(Math.max(nowMs, forecastEnd), nowMs + MAX_AHEAD)
  const x = (iso) => ((new Date(iso).getTime() - start) / (end - start)) * 100
  const ahead = end > nowMs

  const toLine = (pts) => pts.map((p) => `${x(p.time)},${y(p.score)}`).join(' ')
  const forecastLine = toLine(forecast)
  // After a change (e.g. physio added), keep the old forecast faintly so the move is visible.
  const oldForecast = prev?.forecast ?? []
  const oldForecastLine = prev && toLine(oldForecast) !== forecastLine ? toLine(oldForecast) : null

  const points = chart.filter((p) => new Date(p.time).getTime() >= start)
  const line = points.map((p) => `${x(p.time)},${y(p.score)}`).join(' ')

  // Highlight what's new since the previous dashboard (after a log).
  const oldTimes = new Set((prev?.chart ?? []).map((p) => p.time))
  const newPoints = prev ? points.filter((p) => !oldTimes.has(p.time)) : []
  const oldDoses = new Set(prev?.doses ?? [])

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect()
    const pct = ((e.clientX - box.left) / box.width) * 100
    let best = null
    for (const p of points) {
      if (!best || Math.abs(x(p.time) - pct) < Math.abs(x(best.time) - pct)) best = p
    }
    setHover(best)
  }

  return (
    <div className="chart">
      <div
        className="chart-plot"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Pain over the last 24 hours. Latest ${points.at(-1)?.score ?? '—'} out of 10, goal ${goal}.`}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg">
          {/* zone above your goal */}
          <rect x="0" y={y(10)} width="100" height={y(goal) - y(10)} className="c-zone" />
          {/* doses */}
          {doses.map((d) => (
            <line
              key={d}
              x1={x(d)}
              x2={x(d)}
              y1="4"
              y2="96"
              className={`c-dose ${prev && !oldDoses.has(d) ? 'c-dose-new' : ''}`}
            />
          ))}
          {/* goal */}
          <line x1="0" x2="100" y1={y(goal)} y2={y(goal)} className="c-goal" />
          {/* pain */}
          <polyline points={line} className="c-pain" />
          {/* R5: expected pain after the last dose (old one faint, after a change) */}
          {oldForecastLine && <polyline points={oldForecastLine} className="c-forecast c-forecast-old" />}
          {forecast.length > 1 && <polyline points={forecastLine} className="c-forecast" />}
          {/* now marker, when the chart reaches into the future */}
          {ahead && <line x1={x(now)} x2={x(now)} y1="0" y2="100" className="c-now" />}
          {/* walks */}
          {walks.map((w) => (
            <line key={w.time} x1={x(w.time)} x2={x(w.time)} y1="94" y2="100" className="c-walk" />
          ))}
          {/* hover crosshair */}
          {hover && <line x1={x(hover.time)} x2={x(hover.time)} y1="0" y2="100" className="c-cross" />}
        </svg>

        <span className="chart-goal-label" style={{ top: `${y(goal)}%` }}>
          goal {goal}
        </span>

        {ahead && (
          <span className="chart-now-label" style={{ left: `${x(now)}%` }}>
            now
          </span>
        )}

        {newPoints.map((p) => (
          <span
            key={p.time}
            className="chart-new"
            style={{ left: `${x(p.time)}%`, top: `${y(p.score)}%` }}
            title={`New: ${p.score}/10 at ${formatTime(p.time)}`}
          />
        ))}

        {hover && (
          <>
            <span className="chart-dot" style={{ left: `${x(hover.time)}%`, top: `${y(hover.score)}%` }} />
            <div
              className="chart-tip"
              style={{ left: `${Math.min(Math.max(x(hover.time), 15), 85)}%` }}
            >
              <strong>{hover.score}/10</strong> at {formatTime(hover.time)}
            </div>
          </>
        )}
      </div>

      <div className="chart-axis muted">
        <span>−24 h</span>
        {ahead ? <span>{formatTime(new Date(end).toISOString())}</span> : <span>now</span>}
      </div>
      {ahead && (
        <p className="chart-forecast-note muted small">
          Dashed line after “now” = expected pain after your last dose (a forecast, not a measurement).
        </p>
      )}
    </div>
  )
}
