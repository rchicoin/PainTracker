import { formatHours, formatTime } from '../format.js'
import PainChart from './PainChart.jsx'

// The main patient card: status pill, number tiles, 24 h chart,
// "What we've noticed" and "Heads-ups" side by side.
export default function MyStatus({ data }) {
  const { patient } = data
  const canDose = data.doseAllowedNow

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
        <span className={`pill ${canDose ? 'pill-good' : 'pill-wait'}`}>
          {canDose ? '✓ Dose allowed now' : `⏱ Next dose ${formatTime(data.nextDoseAt)}`}
        </span>
      </div>

      <div className="tiles">
        <Tile value={data.painNow?.score ?? '—'} label={`pain at ${formatTime(data.painNow?.at)}`} sub={`goal ${patient.goal}`} />
        <Tile value={canDose ? 'Now' : formatTime(data.nextDoseAt)} label="next dose allowed" />
        <Tile value={formatTime(data.painLikelyBackAt)} label="pain likely back" />
        <Tile value={`${data.mgUsed24h} mg`} label={`used of ${data.mgMax24h} mg`} sub="last 24 h" />
        <Tile value={formatHours(data.reliefHours)} label="typical relief" />
      </div>

      <PainChart
        now={data.now}
        chart={data.chart}
        doses={data.doses}
        walks={data.walks}
        goal={patient.goal}
      />

      <div className="two-col">
        <div>
          <h3 className="section-label">What we've noticed</h3>
          {data.patterns.length ? (
            <ul className="list">
              {data.patterns.map((p) => <li key={p}>{p}</li>)}
            </ul>
          ) : (
            <p className="muted">Keep logging. Patterns show up after a few days.</p>
          )}
        </div>
        <div>
          <h3 className="section-label">Heads-ups</h3>
          {data.headsUps.length ? (
            <ul className="list list-heads">
              {data.headsUps.map((h) => <li key={h}>{h}</li>)}
            </ul>
          ) : (
            <p className="muted">No heads-ups right now.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function Tile({ value, label, sub }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
      {sub && <div className="tile-label">({sub})</div>}
    </div>
  )
}
