import { useEffect } from 'react'

// Pop-up at the bottom of the screen with n8n's reply after a log (or an error).
// Plain replies hide after 8 s; warnings and errors stay until dismissed.
export default function Reply({ reply, error, onClose, onShow }) {
  const sticky = Boolean(error || reply?.warning)

  useEffect(() => {
    if (!reply || sticky) return
    const t = setTimeout(onClose, 8000)
    return () => clearTimeout(t)
  }, [reply, sticky, onClose])

  if (!reply && !error) return null

  return (
    <div
      className={`toast ${error ? 'toast-error' : reply.warning ? 'toast-warn' : ''}`}
      role={sticky ? 'alert' : 'status'}
    >
      <div className="toast-body">
        {error ? (
          <p>Couldn't save: {error}. Please try again.</p>
        ) : (
          <>
            <p>✓ {reply.message}</p>
            {reply.warning && <p className="toast-warning">⚠️ {reply.warning}</p>}
            {onShow && (
              <button className="toast-action" onClick={onShow}>
                See what changed ↑
              </button>
            )}
          </>
        )}
      </div>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
