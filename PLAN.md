# PainPal: team plan

**Deadline: Sun Nov 15, 3:00 PM PST. No edits to the repo or Devpost after that (disqualification).**
Build freeze 11:00 AM Sunday. Video recorded by ~1 PM. Submit by 2:30 PM.

Track: **n8n track** (+ overall). n8n must do the real work; the app only displays and collects input.

## Roles

| Person | Area | Owns |
|---|---|---|
| **A: App** | `app/` | React screens, GPS walk tracking, connecting to n8n, deploy to Vercel, PWA |
| **B: Brain** | `n8n/`, `ml/`, `data/` | n8n workflows, data storage, prescription rules, model training + learning |
| Both | | Demo video, Devpost, README |

Fill in names: A = ________  B = Reagan

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
- [ ] **A2** Home screen: pain slider 0–10, body location, "Log pain"
- [ ] **A3** Quick buttons: "Took my dose", "Ate a meal", "I walked ~__ min"
- [ ] **A4** Dashboard cards + pain chart using fake `/dashboard` JSON (`docs/API.md`)
- [ ] **A5** Connect to real n8n `/log` and `/dashboard` (`VITE_N8N_URL`)
- [ ] **A6** Auto walk tracking: location permission once → track while app is open → send `{type:"walk", km, minutes}` when movement stops (coordinates never leave the phone)
- [ ] **A7** Deploy to Vercel (HTTPS needed for GPS on phones) + PWA install (`vite-plugin-pwa`)
- [ ] **A8** Polish: loading states, error messages, safety text, mobile layout

### Person B: Brain
- [ ] **B1** Pick one demo patient from `data/`; create n8n Data Tables (or Google Sheets) and load their history
- [x] **B2** Train Ridge model (`ml/train.py`) → `ml/weights.json` + accuracy numbers for Devpost
- [ ] **B3** Sub-workflow **Check rules & predict** (`docs/N8N.md`)
- [ ] **B4** Workflow **/log**
- [ ] **B5** Personal learning: update patient offset after each completed dose
- [ ] **B6** Workflow **/dashboard**
- [ ] **B7** Workflow **Heads-ups** (schedule → email)
- [ ] **B8** Workflow **Weekly summary** (AI + chart + patient approval)
- [ ] **B9** Error workflow; export all workflows to `n8n/`

### Both: Submission
- [ ] Regenerate demo data so "last 24 h" looks live (Sunday morning)
- [ ] Record demo video (≤ 3 min): see `docs/DEMO.md`
- [ ] README: screenshots, setup, disclosures, team
- [ ] Devpost page + disclosure list
- [ ] Final push before 2:30 PM

## Timeline

| Time | Person A | Person B | Checkpoint |
|---|---|---|---|
| Sat → ~1 AM | A1–A4 | B1–B4 | **Log pain in app → saved in n8n → reply shows** |
| Sun 8–10 AM | A5–A6 | B5–B7 | Dashboard live; walk logged from phone |
| Sun 10–11 AM | A7–A8 | B8–B9 | **11 AM build freeze** |
| Sun 11–2:30 | Video, Devpost, README, final push | | Submitted |

## Claude Code starter prompts (paste into the Claude Code panel)

**A (app):**
> Read CLAUDE.md and docs/API.md. In `app/`, build the home screen (pain slider 0–10, body location, buttons "Log pain", "Took my dose", "Ate a meal") and a dashboard using the fake /dashboard JSON from docs/API.md. Put API calls in `src/api.js`, reading `VITE_N8N_URL`. Mobile-first layout. No business logic in the app.

**B (model):**
> Read CLAUDE.md and docs/MODEL.md. In `ml/`, write train.py that trains Ridge regression on data/training_doses.csv as described, prints the accuracy table, and exports ml/weights.json in the format in docs/MODEL.md. Then write ml/predict.js with the prediction + offset-update functions to paste into n8n Code nodes.
