# The model

## What it predicts
**Hours until pain rises above the patient's own comfort goal after an as-needed dose.**
Used to show "Pain likely back around 3:00 PM" and to trigger early heads-ups.
It never changes prescription limits. Those are fixed rules in n8n.

## Type
**Personalized linear regression (Ridge) with online per-patient updating.**

1. **Global model**: scikit-learn `Ridge` (with `StandardScaler`), trained on synthetic data from 30 fictional patients (`data/training_doses.csv`). Learns how each factor shifts relief time.
2. **Personal offset**: one number per patient, updated in n8n after every dose:
   `offset = 0.7 × offset + 0.3 × (actual − globalPrediction)`
3. **Prediction** (in an n8n Code node): `hours = intercept + Σ weight × scaled(feature) + offset`

Not deep learning. The language model (Claude) is only used for understanding text and writing summaries, **not** for predictions.

## Features (known at the time of the dose)
| Feature | Meaning |
|---|---|
| hour_sin, hour_cos | time of day as a circle |
| evening | 1 if 6–10 PM |
| days_post_op | healing over time |
| pain_at_dose | pain score when the dose was taken |
| steps_prev_3h | movement before the dose |
| physio_next_2h | physio planned within 2 h (0/1) |
| walk_km_next_2h | walking planned/done within 2 h |
| hours_since_scheduled_med | late/missed scheduled medication |
| hours_since_meal | skipped meals |
| pressure_change_6h | falling barometric pressure |

Training rules: drop `censored` rows (pain return not observed, e.g. overnight); **time-based split** (train on days 1–16, test on days 17–21).

## Results so far (synthetic data)
| Model | Average error |
|---|---|
| Patient's own median (simple baseline) | ~98 min |
| Linear, same for everyone | 63 min |
| Gradient boosting, same for everyone | 60 min |
| **Linear + personal offset (our model)** | **53 min** |

## weights.json format
```json
{
  "model": "ridge",
  "trainedOn": "synthetic, 30 patients x 21 days",
  "features": ["hour_sin", "hour_cos", "..."],
  "mean": [0.0, 0.0],
  "scale": [1.0, 1.0],
  "coef": [0.1, -0.2],
  "intercept": 3.1,
  "testErrorMin": 53
}
```

## Honest limits (say these on Devpost)
- Synthetic data only reproduces the patterns we programmed. It shows the **method** works, not clinical accuracy.
- Real use needs real, consented, de-identified data, clinical validation and regulatory review.
- Next steps: survival analysis (uses censored doses), nightly retraining with a safety check, more features (sleep, heart rate).
