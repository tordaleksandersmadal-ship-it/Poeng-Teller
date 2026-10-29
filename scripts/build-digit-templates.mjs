// Bygger siffermalene (scripts/lib/digit-templates.json) fra HUD-utklippene
// i samples/hud/. Filnavnet er fasiten: "052_b00095.png" = 52 spillere igjen.
// Utklippene er tatt fra x=1500, y=70 i et 1920x1080-bilde.
//
//   npm run build:digits                  bygg malene
//   npm run build:digits -- --check       test malene mot alle utklippene
//
// Legg til nye utklipp når et tall leses feil, og bygg på nytt.

import fs from "node:fs/promises";
import path from "node:path";
import { digitMask, readPlayersLeft, segment, TEMPLATE_FILE } from "./lib/digits.mjs";

const HUD_DIR = path.resolve(import.meta.dirname, "..", "samples", "hud");
const ORIGIN = { left: 1500, top: 70 };

const files = (await fs.readdir(HUD_DIR)).filter((f) => f.endsWith(".png")).sort();
const truthOf = (file) => String(Number(file.split("_")[0]));

if (process.argv.includes("--check")) {
  let ok = 0;
  for (const file of files) {
    const { value, score } = await readPlayersLeft(await fs.readFile(path.join(HUD_DIR, file)), ORIGIN);
    const right = String(value) === truthOf(file);
    ok += right ? 1 : 0;
    console.log(`${right ? "OK  " : "FEIL"} ${file.padEnd(22)} lest ${String(value).padStart(4)}  likhet ${score.toFixed(2)}`);
  }
  console.log(`${ok}/${files.length} riktig`);
  process.exitCode = ok === files.length ? 0 : 1;
} else {
  // Samle eksempler per siffer.
  const examples = {};
  for (const file of files) {
    const truth = truthOf(file);
    const glyphs = segment(await digitMask(await fs.readFile(path.join(HUD_DIR, file)), ORIGIN));
    if (glyphs.length !== truth.length) {
      console.warn(`Hopper over ${file}: fant ${glyphs.length} sifre, forventet ${truth.length}`);
      continue;
    }
    glyphs.forEach((g, i) => (examples[truth[i]] ??= []).push(g));
  }

  // Mal = flertallsstemme per piksel blant eksemplene med vanligste bredde.
  const templates = {};
  for (const [digit, list] of Object.entries(examples).sort()) {
    const widths = list.map((g) => g[0].length);
    const width = widths.sort((a, b) =>
      widths.filter((w) => w === b).length - widths.filter((w) => w === a).length
    )[0];
    const same = list.filter((g) => g[0].length === width);
    const rows = same[0].map((row, y) =>
      row
        .map((_, x) => (same.filter((g) => g[y][x]).length * 2 >= same.length ? "1" : "0"))
        .join("")
    );
    templates[digit] = { width, examples: list.length, rows };
    console.log(`${digit}: ${list.length} eksempler, bredde ${width}`);
  }

  const missing = "0123456789".split("").filter((d) => !templates[d]);
  if (missing.length) console.warn(`Mangler eksempler for: ${missing.join(", ")}`);
  await fs.writeFile(TEMPLATE_FILE, JSON.stringify(templates, null, 2) + "\n");
  console.log(`Lagret ${TEMPLATE_FILE}`);
}
