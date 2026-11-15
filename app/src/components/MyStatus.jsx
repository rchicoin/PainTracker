import { formatHours, formatTime } from '../format.js'
import PainChart from './PainChart.jsx'
import WhyCard from './WhyCard.jsx'

// The main patient card: status pill, number tiles, 24 h chart,
// "What we've noticed" and "Heads-ups" side by side.
// `prev` is the dashboard before the latest log (or null). Anything that changed
// since then is highlighted, so updates are easy to see in the demo.
export default function MyStatus({ data, prev }) {
  const { patient } = data
  const canDose = data.doseAllowedNow
  const before = prev ? tileMap(prev) : null

  const pill = canDose
    ? { cls: 'pill-good', text: '✓ Dose allowed now' }
    : data.maxReached
      ? { cls: 'pill-wait', text: `Daily max reached · next ${formatTime(data.nextDoseAt)}` }
      : { cls: 'pill-wait', text: `⏱ Next dose ${formatTime(data.nextDoseAt)}` }

  return (
    <section className={`card status-card ${canDose ? 'edge-good' : 'edge-wait'}`}>
      <div className="card-head">
        <div>
          <h2 className="card-title">Hi, {patient.name.split(' ')[0]}</h2>
          <p className="card-sub muted">
            {patient.drug} · {patient.doseMg} mg every {patient.minIntervalH} h as needed · max{' '}
            {patient.maxMg24h} mg/24 h
          </p>
        </div>
        <span className={`pill ${pill.cls}`}>{pill.text}</span>
      </div>

      <div className="tiles">
        {tiles(data).map((t) => {
          const was = before?.[t.key]
          const changed = before && was !== undefined && was !== t.value
          return <Tile key={t.key + (changed ? '-changed' : '')} {...t} was={changed ? was : null} />
        })}
      </div>

      <WhyCard why={data.why} before={prev?.why} />

      <PainChart
        now={data.now}
        chart={data.chart}
        doses={data.doses}
        walks={data.walks}
        goal={patient.goal}
        prev={prev}
        forecast={data.forecast}
      />

      <div className="two-col">
        <div>
          <h3 className="section-label">What we've noticed</h3>
          {data.patterns.length ? (
            <List items={data.patterns} before={prev?.patterns} />
          ) : (
            <p className="muted">Keep logging. Patterns show up after a few days.</p>
          )}
        </div>
        <div>
          <h3 className="section-label">Heads-ups</h3>
          {data.headsUps.length ? (
            <List items={data.headsUps} before={prev?.headsUps} className="list-heads" />
          ) : (
            <p className="muted">No heads-ups right now.</p>
          )}
        </div>
      </div>
    </section>
  )
}

// The number tiles, as plain strings so before/after can be compared.
function tiles(d) {
  const backPassed = d.painLikelyBackAt && new Date(d.painLikelyBackAt) <= new Date(d.now)
  return [
    {
      key: 'pain',
      value: String(d.painNow?.score ?? '—'),
      label: `pain at ${formatTime(d.painNow?.at)}`,
      sub: `goal ${d.patient.goal}`,
    },
    { key: 'next', value: d.doseAllowedNow ? 'Now' : formatTime(d.nextDoseAt), label: 'next dose allowed' },
    backPassed
      ? { key: 'back', value: 'Now', label: `pain likely back (since ${formatTime(d.painLikelyBackAt)})` }
      : { key: 'back', value: formatTime(d.painLikelyBackAt), label: 'pain likely back' },
    { key: 'mg', value: `${d.mgUsed24h} mg`, label: `used of ${d.mgMax24h} mg`, sub: 'last 24 h' },
    { key: 'relief', value: formatHours(d.reliefHours), label: 'typical relief' },
  ]
}

function tileMap(d) {
  return Object.fromEntries(tiles(d).map((t) => [t.key, t.value]))
}

function Tile({ value, label, sub, was }) {
  return (
    <div className={`tile ${was ? 'tile-changed' : ''}`}>
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
      {sub && <div className="tile-label">({sub})</div>}
      {was && <div className="tile-was">was {was}</div>}
    </div>
  )
}

function List({ items, before, className = '' }) {
  return (
    <ul className={`list ${className}`}>
      {items.map((text) => (
        <li key={text} className={before && !before.includes(text) ? 'is-new' : ''}>
          {text}
        </li>
      ))}
    </ul>
  )
}
