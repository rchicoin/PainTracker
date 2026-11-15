# PainTracker: team plan

**Deadline: Sun Nov 15, 2:00 PM. No edits to the repo or Devpost after that (disqualification).**
Video edited by ~1:30 PM. Submit by 1:45 PM.

Track: **n8n track** (+ overall). n8n must do the real work; the app only displays and collects input.

## Roles

| Person | Area | Owns |
|---|---|---|
| **A: App** | `app/` | React screens, GPS walk tracking, connecting to n8n, deploy to Vercel, PWA |
| **B: Brain** | `n8n/`, `ml/`, `data/` | n8n workflows, data storage, prescription rules, model training + learning |
| Both | | Demo video, Devpost, README |

Fill in names: A = Hamza  B = Reagan

## How we work

0. One-time setup on each laptop: `git config pull.rebase true` (so `git pull` puts your commits on top of your partner's).
1. `git pull` before starting, `git push` after every working piece (small commits).
   Push rejected? `git pull`, then `git push` again. **Never `git push --force`** (it deletes your partner's work).
   Only push code that runs: `main` is what Vercel deploys.
2. Don't edit the other person's area without telling them.
3. The **API contract** (`docs/API.md`) is the agreement between app and n8n. Change it only together.
4. Person A builds against **fake JSON** until Person B's webhooks are live, so nobody waits.
5. Mark tasks below `[x]` when done and push, so the other person sees progress.
6. Stuck for more than 20 min? Tell the other person.

## Tasks

### Step 0: Together (first 30 min)
- [ ] Repo cloned on both laptops; Claude Code installed
- [ ] Read `CLAUDE.md` + `docs/` (10 min)
- [ ] Agree on `docs/API.md` (edit now if needed)

### Person A: App
- [x] **A1** React + Vite app runs (`app/`)
- [x] **A2** Home screen: pain slider 0–10, body location, "Log pain"
- [x] **A3** Quick buttons: "Took my dose", "Ate a meal", "I walked ~__ min"
- [x] **A4** Dashboard cards + pain chart using fake `/dashboard` JSON (`docs/API.md`)
- [x] **A5** Connect to real n8n `/log` and `/dashboard` (`VITE_N8N_URL`)
- [x] **A6** Auto walk tracking: location permission once → track while app is open → send `{type:"walk", km, minutes}` when movement stops (coordinates never leave the phone)
- [x] **A7** Deploy to Vercel (HTTPS needed for GPS on phones) + PWA install (`vite-plugin-pwa`)
- [x] **A8** Polish: loading states, error messages, safety text, mobile layout

### Person B: Brain
- [x] **B1** Pick one demo patient from `data/`; create n8n Data Tables (or Google Sheets) and load their history
- [x] **B2** Train Ridge model (`ml/train.py`) → `ml/weights.json` + accuracy numbers for Devpost
- [x] **B3** Sub-workflow **Check rules & predict** (`docs/N8N.md`)
- [x] **B4** Workflow **/log**
- [x] **B5** Personal learning: update patient offset after each completed dose
- [x] **B6** Workflow **/dashboard**
- ~~**B7** Heads-ups / Google Calendar sync~~ (dropped to keep it simple; heads-ups show in the app)
- ~~**B8** Weekly summary~~ (dropped to keep it simple)
- [x] **B9** Workflows exported to `n8n/` (built by `node n8n/build.js`); error-alert emails dropped

### Round 2: "show an input, watch it update" (Sunday, before the 11 AM freeze)
Goal: a live demo where one input visibly changes the chart, the prediction and the recommendations.
Start together (~20 min): agree on the **Round 2** section of `docs/API.md`. Then work in parallel against its fake JSON.
Ordered by demo value. **If time runs short, cut from the bottom.** Items 1 + 2 alone already make a good demo.

| # | Feature | Person B (n8n) | Person A (app) | Size |
|---|---|---|---|---|
| R1 | **Physio time entry** | `/log` accepts `{type:"physio", at}` → `schedule`; reply says how the prediction moved | "Physio/appointment at __:__" control (today/tomorrow) | B 30 min · A 45 min |
| R2 | **"Why" card** | `/dashboard` returns `why` (what moved the prediction, in minutes) | Card under "pain likely back" | B 1 h · A 45 min |
| R3 | **Demo clock** | `POST /demo-clock`; `/log` + `/dashboard` use the shifted time | Bar "Demo time 2:40 PM [+30 min] [+1 h] [Reset]", clearly labelled | B 1.5 h · A 1 h |
| R4 | **My medication screen** | `POST /prescription` with validation (400 on bad values) | Form: name, dose mg, min hours between doses, daily max mg, pain goal | B 1 h · A 1.5 h |
| R5 | **Forecast line** | `/dashboard` returns `forecast` points | Dashed line on the chart: last dose → "pain likely back" | B 45 min · A 1 h |

- [x] **R0** API agreement (together)
- [x] **R1-B** · [x] **R1-A** Physio time entry (both built by B; re-import B4 to go live)
- [x] **R2-B** · [x] **R2-A** "Why" card
- [x] **R3-B** · [x] **R3-A** Demo clock (both built by B; import R3 + re-import B4, B6)
- [x] **R4-B** · [x] **R4-A** My medication screen (both built by B; import R4)
- [x] **R5-B** · [x] **R5-A** Forecast line (both built by B; re-import B6)
- [ ] Data refresh + re-import Setup/B4/B6 + full phone test (together, 8:30–10 AM)

**Fallbacks**
- Physio entry not working on a phone by 9 AM → remove physio from the model instead (~20 min). Don't film it half-done.
- Demo clock not ready → log a real dose 1–3 h before filming the learning clip.
- Re-importing B4: unpublish + delete the old one first ("conflicting URL path" otherwise).

**Video moment (~2:00):** log pain 6 → point on chart → "Took my dose" → next allowed dose shows → add "Physio at 3:00 PM" →
"pain likely back" moves earlier, "why" card shows *Physio: −32 min*, physio heads-up appears → **+1 h** twice → log pain 5 →
"PainPal learned from your last dose", and the "Your personal pattern" line in the "why" card changes.

### Both: Submission
- [x] Regenerate demo data so "last 24 h" looks live (Sunday morning)
- [ ] Record demo video (≤ 3 min): **final script + n8n clip list + Clipchamp steps in `docs/DEMO.md`**
  - [x] App recording done (live run ~11:56 AM, `painpal-demo-full.webm` on Reagan's laptop)
  - [ ] n8n clips (4) · [ ] voiceover · [ ] edit + export + upload
- [ ] README: screenshots, setup, disclosures, team
- [ ] Devpost page + disclosure list
- [ ] Final push before 2:30 PM

## Timeline

| Time | Person A | Person B | Checkpoint |
|---|---|---|---|
| Sat → ~1 AM | A1–A4 | B1–B4 | **Log pain in app → saved in n8n → reply shows** |
| Sat → ~2 AM | A5–A8 | B5–B6, B9 | ✅ App live on Vercel, talking to n8n; learning works |
| Sun 2:00–2:20 | R0 API agreement | R0 API agreement | Round 2 fields agreed in `docs/API.md` |
| Sun 2:20–4:00 | R1-A, R2-A (fake JSON) | R1-B, R2-B (live) | Physio entry moves the prediction; "why" card |
| Sun ~7:00–8:30 | R3-A → R5-A | R3-B → R5-B | Demo clock, medication screen, forecast |
| Sun 8:30–10:00 | Phone test | Data refresh + re-import | Everything works on a phone |
| Sun 10–11 AM | Buffer + fixes | Buffer + fixes | **11 AM build freeze** |
| Sun 11–2:30 | Video, Devpost, README, final push | | Submitted |

## Claude Code starter prompts (paste into the Claude Code panel)

**A (app):**
> Read CLAUDE.md and docs/API.md. In `app/`, build the home screen (pain slider 0–10, body location, buttons "Log pain", "Took my dose", "Ate a meal") and a dashboard using the fake /dashboard JSON from docs/API.md. Put API calls in `src/api.js`, reading `VITE_N8N_URL`. Mobile-first layout. No business logic in the app.

**B (model):**
> Read CLAUDE.md and docs/MODEL.md. In `ml/`, write train.py that trains Ridge regression on data/training_doses.csv as described, prints the accuracy table, and exports ml/weights.json in the format in docs/MODEL.md. Then write ml/predict.js with the prediction + offset-update functions to paste into n8n Code nodes.
