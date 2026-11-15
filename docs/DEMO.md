# Demo video (≤ 3:00): final script

Judges mainly watch the video + Devpost. Every criterion is 25%: technical depth, innovation & impact, design & UX, demo.
**Show the n8n canvas running at least 3 times.**

## What we have
- **App recording** (made with a Playwright script against the live app; phone-sized, ~1:50):
  `painpal-demo-full.webm` (Reagan's laptop, `Videos` folder). Timestamps below say **App 0:12** etc.
- **n8n clips** (screen-recorded from the executions of that same run): 4 short clips, see "n8n clips" below.
- Voiceover recorded separately and laid over the edit (Clipchamp).

Tip: don't read clock times aloud (the app and n8n show times in different time-zone rules); say "earlier"/"later".

## Script (final edit ≈ 2:55)

| Final time | Visual | Voiceover |
|---|---|---|
| 0:00–0:10 | Title card: **PainTracker**: *your pain, your pattern* · "Synthetic data. Not medical advice." | "As-needed pain medication runs on fixed rules, but pain is personal. Patients end up guessing, or waiting in pain." |
| 0:10–0:22 | **App 0:00–0:12**: dashboard, chart | "PainTracker learns each patient's own pain pattern and gives early heads-ups, always inside their prescription. Here's Sam, a fictional patient, with the last 24 hours of pain, doses and walks." |
| 0:22–0:36 | **App 0:12–0:26**: pain 6, note, Log pain → reply, new point | "Logging takes two taps. Pain is a 6 after the stairs." |
| 0:36–0:50 | **n8n clip 1**: B4 execution canvas (pain) | "And n8n does all the work. The webhook validates the entry, pulls live weather from Open-Meteo, saves it, re-checks the prescription rules and runs the prediction, then replies to the app." |
| 0:50–1:04 | **App 0:26–0:40**: Took my dose → confirm → reply → chart | "Sam takes a dose. Every dose is checked against the minimum interval and the 24-hour maximum. Sam has now reached today's max, so the app shows exactly when the next dose is allowed. It never suggests anything outside the prescription." |
| 1:04–1:25 | **App 0:40–1:01**: physio entry → reply → "why" card → chart → heads-ups | "Now Sam adds a physio appointment. The prediction moves: pain is likely back about 30 minutes sooner. And the 'why' card explains it, factor by factor: physio soon after the dose, the weather, the time of day, and Sam's personal pattern. The dashed line is the expected pain curve." |
| 1:25–1:37 | **n8n clip 2**: B4 execution (physio) → open **Compute status** output | "That's a personalized Ridge regression running inside n8n. Because the model is linear, each factor's effect is exact, not a guess." |
| 1:37–1:49 | **App 1:01–1:13**: demo clock +1 h, +1 h (amber) | "To show learning without waiting, we fast-forward two hours with a clearly labelled demo clock." |
| 1:49–2:07 | **App 1:13–1:31**: pain 5 → "learned from your last dose" → "why" card → How PainTracker learns | "Pain is back above Sam's goal sooner than the model expected. So PainTracker learns: Sam's personal pattern moves from 7 to 23 minutes sooner, and future heads-ups come earlier." |
| 2:07–2:19 | **n8n clip 3**: B4 execution (pain 5): **B5 learn → Update patient_model** path, then **Data tables → patient_model / predictions** | "The learning happens in n8n too: it compares predicted and actual relief and updates Sam's own model in an n8n data table." |
| 2:19–2:31 | **App 1:31–1:43**: My medication → max 2 mg → error → Cancel | "Limits only ever come from the prescription label, and anything unsafe is rejected." |
| 2:31–2:39 | **n8n clip 4**: R4 execution → **Respond: bad request** branch | "That check runs in n8n, not in the app." |
| 2:39–2:55 | n8n workflow list (all Active) → card: **"Average error: 36 min (ours) vs 45 min (patient's own average)"** → **App 1:43–1:50** safety text → end card | "Across thirty fictional patients, our personalized model predicts when pain returns within 36 minutes on average, versus 45 for the patient's own average. Synthetic data only, not medical advice. PainTracker: your pain, your pattern." |

## n8n clips (record these on the laptop)
Open each run from the workflow's **Executions** tab (top centre) → click the run → the canvas shows the green path it took.
All runs are from the recording at about 11:56–11:58 (n8n may show them an hour later).

1. **B4 · POST /log → Executions → the earliest of the 4 runs** (pain 6). Press **1** (zoom to fit), hold 3 s, slowly zoom into
   *Type? → Pain: weather now → Insert pain_log*, then *Compute status → Build reply → Respond*. ~12 s.
2. **B4 → the 3rd run** (physio). Zoom into *Type? → Physio row → Insert schedule*. Double-click **Compute status**, scroll the
   output to `painLikelyBackAt` and `before`, hold 3 s, close. ~12 s.
3. **B4 → the 4th run** (pain 5). Zoom into *B5: learn from last dose → Learned? → Model row → Update patient_model →
   Insert predictions*. Then left menu **Overview → Data tables → patient_model** (offsetHours) and **predictions** (predicted vs actual). ~12 s.
4. **R4 · POST /prescription → Executions → the run** → *Check request → Valid request? → Respond: bad request*. ~8 s.
5. **Workflow list** with PainPal B4, B6, R3, R4 all **Active**. ~3 s.

Clean recording: Chrome **Guest window**, log in, **F11** (full screen), collapse n8n's left sidebar, keep the account
name/email out of frame. Record with **Win + Alt + R** (Game Bar) or Snipping Tool → Record. Move the mouse slowly.

## Editing in Clipchamp
1. New video → **16:9**. Import `painpal-demo-full.webm` + the n8n clips.
2. Drag the app video to the timeline. Move the playhead to each App timestamp in the table and press **S** to split.
3. Drag the n8n clips between the pieces in the order above. For each app piece: **Fit** (the app sits in the middle; optional
   blurred or solid background), n8n clips: **Fill**.
4. Text cards: **Text** tab → title card, accuracy card, end card ("Synthetic data. Not medical advice.").
5. Voiceover: **Record & create → Audio** (or record on a phone and import), one line per row, then line it up.
6. Trim pauses so the total is **≤ 3:00**. **Export 1080p** → upload (YouTube unlisted) → link in Devpost.

## Don't
- Don't press **Reset** on the demo clock or run **Setup** before the n8n clips are filmed (it would hide or wipe the runs).
- Don't show real names, emails, addresses or keys.
