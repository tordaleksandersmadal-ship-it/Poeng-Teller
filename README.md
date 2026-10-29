# Bontora Poeng-Teller

Reads the Fortnite HUD from OBS with OCR and shows players left, kills and the
killfeed on a dashboard and a transparent OBS overlay.

```
OBS (Game Capture) ──WebSocket──▶ scripts/auto-eyes.mjs ──POST──▶ Next.js /api/bontora
                                   (sharp + Tesseract OCR)            │
                                                                       ├─▶ /          dashboard
                                                                       └─▶ /overlay   OBS Browser Source
```

## Project layout

| Path | What it is |
| --- | --- |
| `scripts/auto-eyes.mjs` | The OCR loop. Grabs a screenshot from OBS every 1.5 s and sends the result to the website. |
| `scripts/lib/config.mjs` | Settings (OBS URL, source name, Tesseract path) and the screen regions that are read. |
| `scripts/lib/ocr.mjs` | Cropping, image cleanup and Tesseract calls. |
| `scripts/lib/parse.mjs` | Turns OCR text into numbers and eliminations. |
| `scripts/test-ocr.mjs` | Runs the OCR on `samples/` without OBS. Run it after changing regions. |
| `samples/` | Reference screenshots: normal play, spectator mode, end screen, lobby. |
| `app/api/bontora/route.ts` | API: `GET` state, `POST` frame from auto-eyes, `DELETE` reset for a new match. |
| `app/page.tsx` | Dashboard with status, eliminations, raw OCR and a "Ny kamp" (new match) button. |
| `app/overlay/page.tsx` | Transparent overlay for OBS. |
| `lib/state.ts` | In-memory match state and elimination de-duplication. |

## Requirements

- Node.js 20+
- [Tesseract OCR for Windows](https://github.com/UB-Mannheim/tesseract/wiki), installed to
  `C:\Program Files\Tesseract-OCR\` (or set `TESSERACT_PATH`)
- OBS Studio 28+ (has WebSocket built in)
- Fortnite at 16:9 (1920×1080 is the reference; other 16:9 sizes are scaled)

## Commands

```bash
npm install
npm run dev          # website on http://localhost:3000
npm run eyes         # OCR loop (in a second terminal)
npm run eyes -- --debug   # also saves the last frame + crops to debug/live/
npm run eyes -- --record  # saves EVERY frame + OCR to debug/recordings/<time>/ (~200 MB/match)
npm run replay -- debug/recordings/<time>   # play a recording back into the website
npm run test:ocr     # check OCR against samples/
```

## Settings (environment variables)

| Variable | Default |
| --- | --- |
| `OBS_URL` | `ws://127.0.0.1:4455` |
| `OBS_PASSWORD` | asked at startup |
| `OBS_SOURCE` | `Game Capture` |
| `TESSERACT_PATH` | `C:\Program Files\Tesseract-OCR\tesseract.exe` |
| `API_URL` | `http://127.0.0.1:3000/api/bontora` |
| `INTERVAL_MS` | `1500` |

PowerShell example: `$env:OBS_SOURCE = "Fortnite"; npm run eyes`

## Scoring

Defined in `lib/scoring.ts`:

- **5 points per kill**
- **Placement:** 1st = 10, 2nd = 9 … 10th = 1, 11th and worse = 0

This is built for a **solo cup** where the organizer spectates the whole private lobby.
Every player in the lobby gets their own score, read from the killfeed:

- `A eliminated B` → **A gets one kill**, and **B's placement = players left + 1**.
  If several new lines appear in the same frame, the top (oldest) one gets the worst placement.
- When **1 player is left**, the killer of the last elimination is the winner (1st place).
- Names are matched with some tolerance (1–2 wrong characters), so OCR variants like
  `Juksemaker99` / `Juksemaker{99` count as the same player (`lib/names.ts`).
- Kills and placement can be corrected in the "Denne kampen" table, and players the
  killfeed missed (e.g. a winner with 0 kills) can be added by hand.
- **"Kamp ferdig → ny kamp"** saves the match. "Sammenlagt" sums all matches.
- **DISK** removes a player from the standings and the killfeed. Their data is kept, so
  "Angre" brings everything back. Players they eliminated keep their placement.
- Tournament data is saved in `data/bontora.json` (git-ignored) and survives restarts.

## Known limitations

- Player names written in special Unicode characters (e.g. `ŦŁФЖ ッ`) can't be read by
  Tesseract and show up as garbled text. Numbers and normal names are unaffected.
- Only killfeed lines using `eliminated`, `shotgunned`, `sniped`, `headshot` or `blasted`
  are recognised (see `KILL_VERBS` in `scripts/lib/parse.mjs`).
- A killfeed line that disappears before OCR sees it (it checks every 1.5 s) is missed:
  no kill and no placement. Check the "Denne kampen" table before pressing "Kamp ferdig".
- Placement can be off by a few places when several players die at once, because
  the players-left counter lags behind the killfeed.

## How the OCR copes with spectator mode

- **Players left is read by template matching, not Tesseract** (`scripts/lib/digits.mjs`).
  The HUD font never changes, so each digit is compared pixel by pixel with templates
  built from real screenshots in `samples/hud/` (file name = correct value). Only rows
  below the dark spectator bar are used, so normal and spectator mode read the same.
  If a number is ever misread: crop it into `samples/hud/` (x=1500, y=70, 100×30) and
  run `npm run build:digits` then `npm run build:digits -- --check`.
- `lib/playersLeft.ts` adds a sanity check: the count can only go down, and not by
  much at a time. 4 identical readings in a row are accepted anyway (new match).
- Kills on the pre-game island don't count: an elimination is only accepted once the
  players-left count has dropped below its highest value this match.
- **Placements come from the players-left counter, not the killfeed alone.** Every
  time the counter drops (e.g. 5 → 4), place 5 opens up and goes to the elimination
  seen closest in time. Some modes have eliminations that aren't final (revives,
  second-chance items: "X slashed Y" while Y keeps playing). Those don't make the
  counter drop, so they get no place and can't steal one. When 1 is left, the winner
  is the last killer (or the spectated player).
- The spectated player's name is **yellow** in the killfeed, both as killer and as
  victim. Yellow after the verb = victim, yellow before = killer.
- The dashboard warns when any of places 1–10 has no player, so it can be filled in
  by hand before "Kamp ferdig".
- A garbled killer name that turns into its own "player" is merged into the real one
  once that player is eliminated (they can't be both alive and out).
- The killfeed is read twice (colour mask and grayscale) and the reading Tesseract is
  most confident about wins. **Red words are the victim**, white words before them are
  the killer + verb, so unknown verbs like "drained the life from" still work.
- Clean lines count immediately. Uncertain lines must be seen in 2 frames, which
  filters out one-off garbage readings.
