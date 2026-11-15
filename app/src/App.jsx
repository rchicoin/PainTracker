import { useEffect, useState } from 'react'
import { getDashboard, logEntry } from './api.js'
import { formatTime } from './format.js'
import MyStatus from './components/MyStatus.jsx'
import PainForm from './components/PainForm.jsx'
import QuickActions from './components/QuickActions.jsx'
import Reply from './components/Reply.jsx'
import LearningCard from './components/LearningCard.jsx'
import WalkTracker from './components/WalkTracker.jsx'
import { useWalkTracker } from './useWalkTracker.js'

export default function App() {
  const [dash, setDash] = useState(null)
  const [dashError, setDashError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState(null)
  const [error, setError] = useState(null)

  async function loadDashboard() {
    try {
      setDash(await getDashboard())
      setDashError(null)
    } catch (err) {
      setDashError(err.message)
    }
  }

  useEffect(() => {
    getDashboard()
      .then(setDash)
      .catch((err) => setDashError(err.message))
  }, [])

  // Send any entry to n8n, show its reply, then refresh the dashboard.
  // `onDone` lets a form reset itself.
  async function handleLog(entry, onDone) {
    setBusy(true)
    setError(null)
    try {
      setReply(await logEntry(entry))
      onDone?.()
      loadDashboard()
    } catch (err) {
      setReply(null)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // A6: when a GPS walk finishes, send only distance and minutes.
  const walkTracker = useWalkTracker(({ km, minutes }) =>
    handleLog({ type: 'walk', km, minutes, source: 'auto' }),
  )

  return (
    <>
      <div className="banner">DEMO · synthetic data and fictional medicines · NOT MEDICAL ADVICE</div>

      <div className="app">
        <header className="header">
          <h1>PainTracker</h1>
          {dash && <span className="muted small">Updated {formatTime(dash.now)} · from n8n</span>}
        </header>

        <main>
          <Reply reply={reply} error={error} />

          {dashError && (
            <div className="reply reply-error" role="alert">
              Couldn't load your dashboard: {dashError}.{' '}
              <button className="link-btn" onClick={loadDashboard}>Try again</button>
            </div>
          )}
          {!dash && !dashError && <div className="card muted">Loading your dashboard…</div>}
          {dash && <MyStatus data={dash} />}

          <div className="two-col-wide">
            <PainForm onLog={handleLog} busy={busy} />
            <div>
              <QuickActions onLog={handleLog} busy={busy} />
              <WalkTracker tracker={walkTracker} />
              {dash && <LearningCard model={dash.model} />}
            </div>
          </div>

          <p className="safety">
            Feeling very drowsy or confused? <strong>Don't take more.</strong> Call 811 or your care team.
          </p>
        </main>

        <footer className="footer">
          Chart: blue = your pain (last 24 h), dashed green = your comfort goal, purple lines = doses
          you took, marks at the bottom = walks. Predictions only change <em>when</em> you get a
          heads-up. Your dose, timing and daily max always come from your prescription.
          <br />
          <strong>Demo with synthetic data. Not medical advice.</strong>
        </footer>
      </div>
    </>
  )
}
