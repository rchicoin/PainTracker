// "How PainTracker learns": shows the personal model numbers n8n sends.
export default function LearningCard({ model }) {
  if (!model) return null
  const min = Math.abs(model.personalOffsetMin)
  const direction = model.personalOffsetMin < 0 ? 'earlier' : 'later'

  return (
    <section className="card">
      <h3 className="section-label">How PainTracker learns</h3>
      <p className="learn-text">
        Learned from <strong>{model.dosesLearnedFrom}</strong> of your doses.
        {min > 0 && (
          <>
            {' '}Your pain returns about <strong>{min} min {direction}</strong> than average, so your
            heads-ups come {direction}.
          </>
        )}
      </p>
    </section>
  )
}
