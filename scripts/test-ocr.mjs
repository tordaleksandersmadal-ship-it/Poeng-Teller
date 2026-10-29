// Kjører OCR mot skjermbildene i samples/ uten OBS.
// Bruk etter at du har endret utklipp eller bildebehandling:
//   npm run test:ocr            (sjekk)
//   npm run test:ocr -- --debug (lagrer utklipp i debug/<bilde>/)

import fs from "node:fs/promises";
import path from "node:path";
import { readFrame } from "./lib/ocr.mjs";
import { nameKey } from "./lib/parse.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const debug = process.argv.includes("--debug");

const CASES = [
  {
    file: "normal.jpg",
    expect: { kills: 3, playersLeft: 29, spectating: false, victims: ["JellyBeats81"] },
  },
  {
    file: "spectator.jpg",
    expect: { kills: 2, playersLeft: 92, spectating: true, victims: ["Anonymous[264]"] },
  },
  {
    file: "end-screen.jpg",
    expect: { kills: null, playersLeft: null, spectating: false, victims: [] },
  },
  {
    file: "lobby-720p.png",
    expect: { kills: null, playersLeft: null, spectating: false, victims: [] },
  },
];

let failures = 0;

for (const { file, expect } of CASES) {
  const image = await fs.readFile(path.join(ROOT, "samples", file));
  const debugDir = debug ? path.join(ROOT, "debug", path.parse(file).name) : undefined;
  const frame = await readFrame(image, debugDir);

  const actual = {
    kills: frame.kills,
    playersLeft: frame.playersLeft,
    spectating: frame.spectating,
    victims: frame.eliminations.map((e) => e.victim),
  };

  const same = (key) =>
    key === "victims"
      ? JSON.stringify(actual.victims.map(nameKey)) === JSON.stringify(expect.victims.map(nameKey))
      : actual[key] === expect[key];
  const problems = Object.keys(expect).filter((key) => !same(key));

  console.log(`${problems.length ? "FEIL" : "OK  "}  ${file}`);
  for (const key of problems) {
    console.log(`      ${key}: forventet ${JSON.stringify(expect[key])}, fikk ${JSON.stringify(actual[key])}`);
  }
  if (problems.length || debug) console.log("      rå OCR:", JSON.stringify(frame.raw));
  failures += problems.length ? 1 : 0;
}

process.exitCode = failures ? 1 : 0;
