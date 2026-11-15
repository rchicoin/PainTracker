"""Train PainPal's relief-time model on synthetic data.

Predicts: hours until pain rises above the patient's goal after an as-needed dose.
Model:    Ridge regression (scikit-learn) + a per-patient offset that n8n updates after every dose.

Run:  python ml/train.py
Out:  ml/weights.json         (pasted into / fetched by the n8n Code node)
      ml/patient_offsets.csv  (starting rows for the n8n `patient_model` table)

Synthetic data only. Shows the method works; it says nothing about clinical accuracy.
"""

import json
from pathlib import Path

import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
FEATURES = [
    "hour_sin", "hour_cos", "evening", "pain_at_dose",
    "walk_km_prev_3h", "walk_min_prev_3h",
    "hours_since_scheduled_med", "hours_since_meal",
    "pressure_change_6h", "temp_c", "precip_mm",
]
TARGET = "relief_hours"
TRAIN_DAYS = 16          # train on days 1-16, test on the rest (time-based split)
KEEP, LEARN = 0.7, 0.3   # offset = KEEP * offset + LEARN * (actual - globalPrediction)


def load():
    df = pd.read_csv(ROOT / "data" / "training_doses.csv")
    df = df[df["censored"] == 0].copy()  # pain return not observed -> can't learn from it
    df["time"] = pd.to_datetime(df["dose_time"].str[:19])  # local wall time
    df["day"] = (df["time"].dt.normalize() - df["time"].min().normalize()).dt.days + 1
    return df.sort_values("time").reset_index(drop=True)


def fit(df):
    model = make_pipeline(StandardScaler(), Ridge(alpha=1.0))
    model.fit(df[FEATURES], df[TARGET])
    return model


def online_offsets(df, predictions):
    """Replay doses in time order, updating each patient's offset like n8n does.
    Returns the prediction made *before* each dose's outcome was known, plus the final offsets."""
    offset, learned, personal = {}, {}, []
    for pid, actual, pred in zip(df["patient_id"], df[TARGET], predictions):
        o = offset.get(pid, 0.0)
        personal.append(pred + o)
        offset[pid] = KEEP * o + LEARN * (actual - pred)
        learned[pid] = learned.get(pid, 0) + 1
    return personal, offset, learned


def main():
    df = load()
    train, test = df[df["day"] <= TRAIN_DAYS], df[df["day"] > TRAIN_DAYS]
    model = fit(train)

    # --- evaluation on the held-out last days (average error in minutes) ---
    medians = train.groupby("patient_id")[TARGET].median()
    err_median = (test["patient_id"].map(medians) - test[TARGET]).abs().mean() * 60
    err_global = (model.predict(test[FEATURES]) - test[TARGET]).abs().mean() * 60
    personal, _, _ = online_offsets(df, model.predict(df[FEATURES]))
    is_test = (df["day"] > TRAIN_DAYS).to_numpy()
    err_personal = (pd.Series(personal)[is_test].to_numpy() - test[TARGET].to_numpy()).__abs__().mean() * 60

    print(f"Doses: {len(df)} observed ({len(train)} train, days 1-{TRAIN_DAYS}; {len(test)} test, later days)\n")
    print("| Model | Average error |")
    print("|---|---|")
    print(f"| Patient's own median (simple baseline) | {err_median:.0f} min |")
    print(f"| Linear, same for everyone | {err_global:.0f} min |")
    print(f"| **Linear + personal offset (our model)** | **{err_personal:.0f} min** |\n")

    # --- final model on all observed doses, exported for n8n ---
    final = fit(df)
    scaler, ridge = final.named_steps["standardscaler"], final.named_steps["ridge"]
    per_unit = ridge.coef_ / scaler.scale_
    print("Effect on relief, minutes per unit of each feature:")
    for f, w in sorted(zip(FEATURES, per_unit), key=lambda x: -abs(x[1] * df[x[0]].std())):
        print(f"  {f:<27} {w * 60:+7.1f}")

    weights = {
        "model": "ridge",
        "target": "hours until pain rises above goal after an as-needed dose",
        "trainedOn": f"synthetic, {df['patient_id'].nunique()} fictional patients, {len(df)} doses",
        "features": FEATURES,
        "mean": [round(x, 6) for x in scaler.mean_],
        "scale": [round(x, 6) for x in scaler.scale_],
        "coef": [round(x, 6) for x in ridge.coef_],
        "intercept": round(float(ridge.intercept_), 6),
        "offsetUpdate": {"keep": KEEP, "learn": LEARN},
        "testErrorMin": {"patientMedian": round(err_median), "linear": round(err_global), "linearPlusOffset": round(err_personal)},
    }
    (ROOT / "ml" / "weights.json").write_text(json.dumps(weights, indent=2) + "\n")

    # Starting offsets for n8n's patient_model table (replayed with the final model).
    _, offsets, learned = online_offsets(df, final.predict(df[FEATURES]))
    last = df.groupby("patient_id")["dose_time"].max()
    rows = [{"patientId": p, "offsetHours": round(offsets[p], 3), "dosesLearned": learned[p], "lastUpdated": last[p]}
            for p in sorted(offsets)]
    pd.DataFrame(rows).to_csv(ROOT / "ml" / "patient_offsets.csv", index=False)

    p1 = next(r for r in rows if r["patientId"] == "P001")
    print(f"\nWrote ml/weights.json and ml/patient_offsets.csv")
    print(f"P001: learned from {p1['dosesLearned']} doses, pain returns {abs(p1['offsetHours']) * 60:.0f} min "
          f"{'earlier' if p1['offsetHours'] < 0 else 'later'} than average")


if __name__ == "__main__":
    main()
