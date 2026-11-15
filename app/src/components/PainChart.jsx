import { useState } from 'react'
import { formatTime } from '../format.js'

// Last-24 h pain chart: blue line = pain, dashed green = your goal,
// purple lines = doses, small marks at the bottom = walks.
// Drawn in a 0–100 box stretched to fit; strokes stay crisp with non-scaling-stroke.

const H24 = 24 * 60 * 60 * 1000
const y = (score) => 92 - score * 8.4 // 0 → 92, 10 → 8

export default function PainChart({ now, chart, doses, walks, goal, prev }) {
  const [hover, setHover] = useState(null)

  const end = new Date(now).getTime()
  const start = end - H24
  const x = (iso) => ((new Date(iso).getTime() - start) / H24) * 100

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
        <span>now</span>
      </div>
    </div>
  )
}
