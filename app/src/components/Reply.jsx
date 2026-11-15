// Shows what n8n replied after a log: message, warning, or an error.
export default function Reply({ reply, error }) {
  if (error) {
    return (
      <div className="reply reply-error" role="alert">
        Couldn't save: {error}. Check your connection and try again.
      </div>
    )
  }
  if (!reply) return null

  return (
    <div className="reply" role="status">
      <p>{reply.message}</p>
      {reply.warning && <p className="reply-warning">⚠️ {reply.warning}</p>}
    </div>
  )
}
