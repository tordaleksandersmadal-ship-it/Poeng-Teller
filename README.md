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

## Known limitations

- Player names written in special Unicode characters (e.g. `ŦŁФЖ ッ`) can't be read by
  Tesseract and show up as garbled text. Numbers and normal names are unaffected.
- Only killfeed lines using `eliminated`, `shotgunned`, `sniped`, `headshot` or `blasted`
  are recognised (see `KILL_VERBS` in `scripts/lib/parse.mjs`).
- State lives in memory: restarting `npm run dev` clears it.
