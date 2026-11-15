# Demo video (≤ 3:00): final script

Judges mainly watch the video + Devpost. Every criterion is 25%: technical depth, innovation & impact, design & UX, demo.
**Show the n8n canvas running** (Part 2: the real executions from the Part 1 run, green paths).

## Structure (≈ 2:28)
| Part | Length | What | Status |
|---|---|---|---|
| Title card | 0:08 | "PainTracker: your pain, your pattern" | Clipchamp text |
| **Part 1: App** | 1:50 | `painpal-demo-full.webm` (phone-sized recording of the live app, played unedited) | ✅ recorded (Reagan's laptop, `Videos`) |
| **Part 2: n8n** | 0:30 | `painpal-n8n.mp4`: B4 pan left→right, then R4, then a 5 s hold for the wrap-up line (1080p, silent) | ✅ recorded + spliced (Reagan sends it to Hamza) |

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

## Part 2: n8n (`painpal-n8n.mp4`, exactly 0:30), voiceover script
Starts right after Part 1. Times are inside `painpal-n8n.mp4`. Text-to-speech: one clip per line, same voice as Part 1,
dropped at the start time below (speed 1.1× if a line runs past its window).

| Clip time | On screen | Voiceover |
|---|---|---|
| 0:00–0:04 | B4 · POST /log, left end: Webhook → Check request → Type? | "Everything you just saw runs in n8n. Each log hits a webhook and is validated." |
| 0:04–0:08 | The 5 branches (pain, dose, meal, walk, physio) | "n8n saves it, with live weather for pain logs." |
| 0:08–0:13 | Row of "Get …" nodes → Compute status | "Then it re-checks the prescription rules and predicts when pain is back with a personalized Ridge model." |
| 0:13–0:17 | Right end: learning branch → Update patient_model | "When pain returns, it learns and updates the patient's own model." |
| 0:17–0:25 | R4 · POST /prescription: green path to **Respond: bad request** | "Safety checks run in n8n too. Unsafe prescription values are rejected." |
| 0:25–0:30 | Hold on R4 (wrap-up) | "PainTracker: your pain, your pattern." |

Optional text overlay on the last 5 s: **"PainTracker · Synthetic data. Not medical advice."**
If it fits in Part 1, the accuracy line can go there: "Our personalized model predicts when pain returns within
36 minutes on average, versus 45 for the patient's own average."

## Editing in Clipchamp
1. New video **16:9**. Import `painpal-demo-full.webm` + `painpal-n8n.mp4`.
2. Timeline: title card → app video (**Fit**, centred) → `painpal-n8n.mp4` (already 16:9, **Fill**).
3. Voiceover: **Record & create → Text to speech** (one clip per line), or **Audio** to record your own. Line up with the tables above.
   Disclose "Voiceover: Microsoft Clipchamp text-to-speech" on Devpost if TTS is used.
4. Total **≤ 3:00** → **Export 1080p** → upload (YouTube unlisted) → link in Devpost.

## Don't
- Part 2 is filmed, so Reset/Setup no longer matter for the video.
- Don't show real names, emails, addresses or keys.
