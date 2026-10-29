// Alle innstillinger kan overstyres med miljøvariabler, f.eks.
//   $env:OBS_SOURCE = "Spill"; npm run eyes

const env = process.env;

export const config = {
  obsUrl: env.OBS_URL ?? "ws://127.0.0.1:4455",
  obsPassword: env.OBS_PASSWORD ?? null, // null = spør ved oppstart
  obsSource: env.OBS_SOURCE ?? "Game Capture",
  apiUrl: env.API_URL ?? "http://127.0.0.1:3000/api/bontora",
  tesseract: env.TESSERACT_PATH ?? String.raw`C:\Program Files\Tesseract-OCR\tesseract.exe`,
  intervalMs: Number(env.INTERVAL_MS ?? 1500),
};

// Alle utklipp er definert for et 1920x1080-bilde og skaleres
// automatisk hvis bildet har en annen oppløsning.
export const REFERENCE = { width: 1920, height: 1080 };

export const REGIONS = {
  // ("Spillere igjen" leses med siffermaler, se digits.mjs.)
  // "SPECTATING: <navn>" oppe i høyre hjørne. Høyrejustert, så lange navn
  // går langt mot venstre.
  spectating: { left: 1300, top: 8, width: 620, height: 32 },
  // Killfeed nede til venstre. Høy nok til ~5 linjer, bred nok til
  // "... with a Sweeper Shotgun".
  killfeed: { left: 35, top: 560, width: 750, height: 150 },
};
