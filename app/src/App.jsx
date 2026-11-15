import { useCallback, useEffect, useRef, useState } from 'react'
import { USING_FAKE_DATA, getDashboard, logEntry, savePrescription, setDemoClock } from './api.js'
import DemoClock from './components/DemoClock.jsx'
import MedicationCard from './components/MedicationCard.jsx'
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
  const [prev, setPrev] = useState(null) // dashboard before the last log, for highlighting changes
  const prevTimer = useRef(null)
  const statusRef = useRef(null)

  async function loadDashboard() {
    try {
      const fresh = await getDashboard()
      setDash(fresh)
      setDashError(null)
      return fresh
    } catch (err) {
      setDashError(err.message)
      return null
    }
  }

  useEffect(() => {
    getDashboard()
      .then(setDash)
      .catch((err) => setDashError(err.message))
  }, [])

  // Send any entry to n8n, show its reply, then refresh the dashboard and
  // highlight what changed for 20 s. `onDone` lets a form reset itself.
  const handleLog = (entry, onDone) => send(() => logEntry(entry), onDone)
  // R4: save the prescription; n8n uses the new limits from the next check on.
  const handlePrescription = (rx, onDone) => send(() => savePrescription(rx), onDone)

  async function send(call, onDone) {
    const before = dash
    setBusy(true)
    setError(null)
    try {
      setReply(await call())
      onDone?.()
      await refreshAndHighlight(before)
    } catch (err) {
      setReply(null)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // R3: move the demo clock, then refresh so "now", the chart and the prediction follow.
  async function handleDemoClock(change) {
    const before = dash
    setBusy(true)
    setError(null)
    try {
      await setDemoClock(change)
      await refreshAndHighlight(before)
    } catch (err) {
      setReply(null)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function refreshAndHighlight(before) {
    const fresh = await loadDashboard()
    if (fresh && before) {
      setPrev(before)
      clearTimeout(prevTimer.current)
      prevTimer.current = setTimeout(() => setPrev(null), 20000)
    }
  }

  const showChanges = useCallback(() => {
    statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const closeReply = useCallback(() => {
    setReply(null)
    setError(null)
  }, [])

  // A6: when a GPS walk finishes, send only distance and minutes.
  const walkTracker = useWalkTracker(({ km, minutes }) =>
    handleLog({ type: 'walk', km, minutes, source: 'auto' }),
  )

  return (
    <>
      <div className="banner">DEMO · synthetic data · NOT MEDICAL ADVICE</div>

      <div className="app">
        <header className="header">
          <h1>PainTracker</h1>
          {dash && (
            <span className="muted small">
              Updated {formatTime(dash.now)} ·{' '}
              {USING_FAKE_DATA ? <span className="fake-tag">sample data, n8n not connected</span> : 'from n8n'}
            </span>
          )}
        </header>

        <DemoClock dash={dash} busy={busy} onChange={handleDemoClock} />

        <main>
          {dashError && (
            <div className="reply reply-error" role="alert">
              Couldn't load your dashboard: {dashError}.{' '}
              <button className="link-btn" onClick={loadDashboard}>Try again</button>
            </div>
          )}
          {!dash && !dashError && <div className="card muted">Loading your dashboard…</div>}
          <div ref={statusRef} className="scroll-anchor">{dash && <MyStatus data={dash} prev={prev} />}</div>

          <div className="two-col-wide">
            <PainForm onLog={handleLog} busy={busy} />
            <div>
              <QuickActions onLog={handleLog} busy={busy} dash={dash} />
              <WalkTracker tracker={walkTracker} />
              {dash && <LearningCard model={dash.model} />}
              {dash && <MedicationCard patient={dash.patient} busy={busy} onSave={handlePrescription} />}
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

      <Reply reply={reply} error={error} onClose={closeReply} onShow={prev ? showChanges : null} />
    </>
  )
}
