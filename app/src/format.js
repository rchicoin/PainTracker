// Display helpers only (formatting, no decisions).

export function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// "today"/"tomorrow" + "15:00" (from a time input) -> ISO 8601 with this device's offset,
// e.g. "2026-11-15T15:00:00-08:00". Just converts what the user typed; n8n checks it.
export function toLocalIso(dayOffset, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  const pad = (n) => String(Math.abs(n)).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00` +
    `${off < 0 ? '-' : '+'}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
}

export function formatHours(h) {
  if (h == null) return '—'
  return `~${Math.round(h * 2) / 2} h`
}
