import { useEffect, useRef, useState } from 'react'
import { EMPTY, addPoint, current, finishIfStopped } from './walk.js'

const PREF_KEY = 'paintracker.walkTracking' // stores only "on"/"off", never location

function readPref() {
  try {
    return localStorage.getItem(PREF_KEY) === 'on'
  } catch {
    return false
  }
}
function writePref(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    // private mode etc. Tracking still works, it just won't be remembered.
  }
}

// Tracks walks only while the app is open and visible.
// Calls onWalk({ km, minutes }) when a walk finishes.
export function useWalkTracker(onWalk) {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const [enabled, setEnabled] = useState(() => supported && readPref())
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [status, setStatus] = useState(supported ? 'off' : 'unsupported')
  const [live, setLive] = useState(null) // { km, minutes } of the walk in progress

  const stateRef = useRef(EMPTY)
  const onWalkRef = useRef(onWalk)
  useEffect(() => {
    onWalkRef.current = onWalk
  })

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (!enabled || !visible) return

    function finish(force) {
      const { state, result } = finishIfStopped(stateRef.current, Date.now(), force)
      stateRef.current = state
      if (!state.walk) setLive(null)
      if (result) onWalkRef.current(result)
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('on')
        stateRef.current = addPoint(stateRef.current, {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          t: pos.timestamp,
        })
        setLive(current(stateRef.current, Date.now()))
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied')
          setEnabled(false)
          writePref(false)
        } else {
          setStatus('searching') // no fix yet (indoors, timeout): keep trying
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    )
    const timer = setInterval(() => finish(false), 20000)

    return () => {
      navigator.geolocation.clearWatch(watchId)
      clearInterval(timer)
      finish(true) // app hidden or tracking turned off: send the walk so far
      stateRef.current = EMPTY
    }
  }, [enabled, visible])

  function turnOn() {
    setStatus('starting')
    setEnabled(true)
    writePref(true)
  }
  function turnOff() {
    setEnabled(false)
    setStatus('off')
    writePref(false)
  }

  // When switched off, show "off" unless there's a reason it can't run.
  const shown = enabled || status === 'denied' || status === 'unsupported' ? status : 'off'
  return { enabled, status: shown, live, turnOn, turnOff }
}
