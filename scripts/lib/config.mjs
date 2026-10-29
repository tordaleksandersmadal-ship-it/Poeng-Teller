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
  // Tallet til venstre for hodeskalle-ikonet (oppe til høyre).
  // I tilskuermodus ligger det under den mørke stripen øverst og er svært svakt.
  kills: { left: 1480, top: 36, width: 100, height: 28 },
  // Tallet til venstre for person-ikonet, rett under kills.
  // Må IKKE ta med timeren under (0:28), da blir avlesningen ødelagt.
  players: { left: 1480, top: 72, width: 100, height: 28 },
  // "SPECTATING: <navn>" oppe i høyre hjørne.
  spectating: { left: 1640, top: 8, width: 280, height: 32 },
  // Killfeed nede til venstre. Høy nok til ~5 linjer.
  killfeed: { left: 35, top: 560, width: 650, height: 150 },
};
