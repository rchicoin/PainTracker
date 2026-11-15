// Display helpers only (formatting, no decisions).

export function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatHours(h) {
  if (h == null) return '—'
  return `~${Math.round(h * 2) / 2} h`
}
