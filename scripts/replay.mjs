// Spiller av et opptak fra `npm run eyes -- --record` gjennom OCR og
// sender resultatet til nettsiden, som om det skjedde live. Brukes til å
// teste endringer uten å spille en ny kamp.
//
//   npm run replay -- debug/recordings/<mappe>
//   npm run replay -- debug/recordings/<mappe> --fast   (ikke vent mellom bildene)

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./lib/config.mjs";
import { readFrame } from "./lib/ocr.mjs";

const dir = process.argv[2];
const fast = process.argv.includes("--fast");
if (!dir) {
  console.error("Bruk: npm run replay -- debug/recordings/<mappe> [--fast]");
  process.exit(1);
}

const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
console.log(`Spiller av ${files.length} bilder fra ${dir} til ${config.apiUrl}`);

for (const file of files) {
  const started = Date.now();
  const frame = await readFrame(await fs.readFile(path.join(dir, file)));
  // Bruk tidspunktet fra opptaket, så tidsgrenser oppfører seg som live.
  const meta = await fs.readFile(path.join(dir, file.replace(/\.jpg$/, ".json")), "utf8").catch(() => null);
  if (meta) frame.at = Date.parse(JSON.parse(meta).at);
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(frame),
  });
  if (!response.ok) throw new Error(`API svarte ${response.status}: ${await response.text()}`);
  const state = await response.json();
  console.log(
    `${file}  spillere igjen: ${String(state.playersLeft).padStart(4)}  ` +
      `elimineringer: ${state.eliminations.length}  ${frame.spectating ? "(tilskuer)" : ""}`
  );
  if (!fast) await new Promise((r) => setTimeout(r, Math.max(0, config.intervalMs - (Date.now() - started))));
}
