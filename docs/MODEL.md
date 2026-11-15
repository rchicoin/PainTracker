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
Only what the app and n8n collect: walks, steps, pain logs, medication times, meal times, weather, calendar. Not specific to surgery patients.
Unknown values (manual walk with no km, no weather, no step counter) are filled with the training average, so they don't move the prediction.

| Feature | Source | Meaning |
|---|---|---|
| hour_sin, hour_cos | dose time | time of day as a circle |
| evening | dose time | 1 if 6–10 PM |
| pain_at_dose | pain log | pain score when the dose was taken |
| walk_km_prev_3h | walks | km walked in the 3 h before the dose (manual walks: minutes ÷ 16) |
| walk_min_prev_3h | walks | minutes walked in the 3 h before the dose |
| steps_prev_3h | steps | steps in the 3 h before the dose (no step counter in the app yet: 750 + 1300 × km) |
| physio_next_2h | Google Calendar | 1 if a physio event starts within 2 h after the dose |
| hours_since_scheduled_med | medications | late/missed scheduled medication (capped at 12) |
| hours_since_meal | meals | skipped meals (capped at 12) |
| pressure_change_6h | weather | change in air pressure over 6 h (falling = negative) |
| temp_c | weather | temperature at the dose |
| precip_mm | weather | rain in that hour |

Training rules: drop `censored` rows (pain return not observed, e.g. overnight); **time-based split** (train on days 1–16, test on days 17–21).

## Results so far (synthetic data, seed 17)
Filled in by `ml/train.py` (it prints this table).

| Model | Average error |
|---|---|
| Patient's own median (simple baseline) | 44 min |
| Linear, same for everyone | 38 min |
| **Linear + personal offset (our model)** | **35 min** |

Biggest effects found: evenings (about −48 min of relief), physio within 2 h (about −32 min), each km walked in the previous 3 h (about −20 min), each pain point at the dose (about −20 min), rain (about −8 min per mm).

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
