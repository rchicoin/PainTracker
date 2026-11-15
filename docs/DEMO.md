# Demo video (≤ 3:00): final script

Judges mainly watch the video + Devpost. Every criterion is 25%: technical depth, innovation & impact, design & UX, demo.
**Show the n8n canvas running at least 3 times** (Part 2 shows it 4 times).

## Structure (≈ 2:58)
| Part | Length | What | Status |
|---|---|---|---|
| Title card | 0:08 | "PainTracker: your pain, your pattern" | Clipchamp text |
| **Part 1: App** | 1:50 | `painpal-demo-full.webm` (phone-sized recording of the live app, played unedited) | ✅ recorded (Reagan's laptop, `Videos`) |
| **Part 2: n8n** | 0:50 | One separate screen recording of the n8n executions from that same run | to film |
| Close | 0:10 | Accuracy card + end card | Clipchamp text |

If it runs long: speed Part 1 to 1.1× in Clipchamp (Speed), don't cut steps.
Don't read clock times aloud (the app and n8n format times with different time-zone rules); say "sooner"/"later".

## Title card (0:00–0:08)
**Say:** "As-needed pain medication runs on fixed rules, but pain is personal. Patients end up guessing, or waiting in pain."

## Part 1: App (0:08–1:58)
Times = position inside `painpal-demo-full.webm`.

| App time | On screen | Say |
|---|---|---|
| 0:00 | Dashboard, chart | "PainTracker learns each patient's own pain pattern and gives early heads-ups, always inside their prescription. Here's Sam, a fictional patient, with the last 24 hours of pain, doses and walks." |
| 0:12 | Pain 6, "after stairs", Log pain → new point | "Logging takes two taps." |
| 0:26 | Took my dose → reply → chart | "Every dose is checked against the minimum interval and the 24-hour maximum. Sam has now reached today's max, so the app shows exactly when the next dose is allowed. It never suggests anything outside the prescription." |
| 0:40 | Physio → reply → "why" card → chart → heads-ups | "Sam adds a physio appointment, and the prediction moves: pain is likely back about 30 minutes sooner. The 'why' card explains it factor by factor, and the dashed line is the expected pain curve." |
| 1:01 | Demo clock +1 h, +1 h (amber) | "To show learning without waiting, we fast-forward two hours with a clearly labelled demo clock." |
| 1:13 | Pain 5 → "learned from your last dose" → "why" card | "Pain came back sooner than the model expected, so PainTracker learns: Sam's personal pattern moves from 7 to 23 minutes sooner, and future heads-ups come earlier." |
| 1:31 | My medication → max 2 mg → error → Cancel | "Limits only ever come from the prescription label, and unsafe values are rejected." |
| 1:43 | Safety text | *(pause, let it show)* |

## Part 2: n8n (1:58–2:48), one screen recording
Films the executions created by the Part 1 run (about 11:56–11:58 AM; n8n may show them an hour later).
Open a run: workflow → **Executions** tab (top centre) → click the run → the canvas shows the green path it took.

| # | Clip time | Shot (what to click) | Say |
|---|---|---|---|
| 1 | 0:00–0:06 | **Workflow list**: PainPal Setup, B3, B4, B6, R3, R4, all Active | "Everything you just saw runs in n8n." |
| 2 | 0:06–0:18 | **B4 · POST /log → Executions → earliest of the 4 runs** (pain 6). Press **1** (fit), hold 2 s, slowly zoom along *Webhook → Check request → Type? → Pain: weather now → Insert pain_log*, then *Compute status → Build reply → Respond* | "Every log hits a webhook. n8n validates it, pulls live weather from Open-Meteo, saves it, re-checks the prescription rules, runs the prediction and replies to the app." |
| 3 | 0:18–0:30 | **B4 → 3rd run** (physio). Show *Type? → Physio row → Insert schedule*. Double-click **Compute status** → output: scroll to `painLikelyBackAt`, `before`, `why`; hold 3 s; close | "The prediction is a personalized Ridge regression inside n8n. Adding physio moved it, and because the model is linear, each factor's effect in the 'why' card is exact." |
| 4 | 0:30–0:42 | **B4 → 4th run** (pain 5). Zoom into *B5: learn from last dose → Learned? → Model row → Update patient_model → Insert predictions*. Then left menu **Overview → Data tables → patient_model** (offsetHours), then **predictions** (predicted vs actual) | "Learning happens here too. n8n compares the predicted and actual relief and updates Sam's own model in a data table." |
| 5 | 0:42–0:50 | **R4 · POST /prescription → Executions → the run**: *Check request → Valid request? → Respond: bad request* | "And every safety check runs in n8n, not in the app." |

## Close (2:48–2:58)
Workflow list or app end frame → card **"Average error: 36 min (ours) vs 45 min (patient's own average)"** → end card
**"PainTracker · Synthetic data. Not medical advice."**
**Say:** "Across thirty fictional patients, our personalized model predicts when pain returns within 36 minutes on average, versus 45 for the patient's own average. Synthetic data only, not medical advice. PainTracker: your pain, your pattern."

## How to film Part 2 (n8n)
1. Chrome **Guest window** → log in to n8n → **F11** (full screen) → collapse the left sidebar. Keep the account name/email out of frame.
2. Open all 4 executions in **separate tabs first** (B4 run 1, B4 run 3, B4 run 4, R4 run) + one tab with the workflow list
   and one with Data tables, so filming is just switching tabs (**Ctrl+Tab**).
3. Rehearse once without recording. Then **Win + Alt + R** to start, go through shots 1–5, **Win + Alt + R** to stop
   (saved in `Videos\Captures`). Move the mouse slowly; pause 1 s on each shot. Retakes are free: n8n keeps the runs.
4. Voiceover: record it after, in Clipchamp, while watching the clip.

## Editing in Clipchamp
1. New video **16:9**. Import `painpal-demo-full.webm` + the n8n recording.
2. Timeline: title card → app video (**Fit**, centred) → n8n recording (**Fill**) → accuracy card → end card.
3. **Record & create → Audio** for the voiceover (or record on a phone and import). Line up with the tables above.
4. Total **≤ 3:00** → **Export 1080p** → upload (YouTube unlisted) → link in Devpost.

## Don't
- Don't press **Reset** on the demo clock or run **Setup** before Part 2 is filmed (it would hide or wipe the runs).
- Don't show real names, emails, addresses or keys.
