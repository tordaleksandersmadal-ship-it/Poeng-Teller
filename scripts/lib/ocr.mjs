import sharp from "sharp";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config, REFERENCE, REGIONS } from "./config.mjs";
import { readPlayersLeft } from "./digits.mjs";
import { parseEliminations, parseSpectating } from "./parse.mjs";

export function runTesseract(image, psm, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.tesseract,
      ["stdin", "stdout", "--psm", String(psm), ...extraArgs],
      { windowsHide: true }
    );

    let output = "";
    let errors = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Tesseract brukte for lang tid."));
    }, 10000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (errors += data));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output.trim());
      else reject(new Error(`Tesseract-feil ${code}: ${errors.trim()}`));
    });

    child.stdin.on("error", () => {});
    child.stdin.end(image);
  });
}

/** Skalerer et 1920x1080-område til bildets faktiske størrelse. */
function scaleRegion(region, width, height) {
  const sx = width / REFERENCE.width;
  const sy = height / REFERENCE.height;
  const left = Math.max(0, Math.round(region.left * sx));
  const top = Math.max(0, Math.round(region.top * sy));
  return {
    left,
    top,
    width: Math.min(Math.round(region.width * sx), width - left),
    height: Math.min(Math.round(region.height * sy), height - top),
  };
}

/** Leser én linje hvit tekst (banneret "SPECTATING: navn"). */
async function readLine(crop) {
  const { data, info } = await sharp(crop)
    .resize({ height: 128, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sorted = Uint8Array.from(data).sort();
  const background = sorted[Math.floor(sorted.length / 2)];
  const peak = sorted[sorted.length - 1];
  if (peak - background < 12) return ""; // ingen tekst her

  const t = background + (peak - background) * 0.5;
  const image = await sharp(Buffer.from(data.map((v) => (v > t ? 0 : 255))), {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: "#ffffff" })
    .png()
    .toBuffer();
  return runTesseract(image, 7);
}

// Killfeed-farger (målt i opptak): hvit tekst er grå-hvit (180–255, nesten
// ingen fargemetning), røde offernavn ~(237,75,68), ditt eget navn oransje
// ~(233,130,42). Lys rosa himmel ~(232,212,223) er like lys som teksten,
// men har mer metning – det er metningen som skiller dem.
// "Sikker" = garantert tekst. "Mulig" = kantpiksler som bare tas med
// når de ligger inntil sikker tekst (hysterese), så strekene blir hele.
const sat = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);
const whiteSure = (r, g, b) => Math.min(r, g, b) >= 185 && sat(r, g, b) < 14;
const whiteMaybe = (r, g, b) => Math.min(r, g, b) >= 120 && sat(r, g, b) < 30;
// Farget tekst: rødt offer, eller gult/oransje for den du ser på (eller
// deg selv) – uansett om de er killer eller offer. Grønn-kanalen skiller:
// rødt ~(237,75,68), oransje ~(233,130,42), gult ~(254,205,15).
const coloredSure = (r, g, b) => r >= 180 && r - b >= 110 && r - g >= 30;
const coloredMaybe = (r, g, b) => r >= 110 && r - b >= 50 && r - g >= 15;
const RED = 2;
const GOLD = 3;
const hue = (g) => (g < 110 ? RED : GOLD);

/**
 * Leser killfeeden og forteller fargen på hvert ord: "white", "red"
 * (offer) eller "gold" (spilleren du ser på – killer ELLER offer).
 * Bakgrunnen fjernes ved å bare beholde tekstfarger, og Tesseract gir
 * posisjonen til hvert ord så fargen kan slås opp.
 * Returnerer { text, lines: [[{ text, color }]] }.
 */
async function readKillfeed(crop) {
  const SCALE = 3;
  // Farger klassifiseres på original oppløsning (oppskalering blander
  // tekst og bakgrunn), og masken skaleres opp etterpå.
  const { data, info } = await sharp(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const W = info.width;
  const pixels = W * info.height;
  const rgb = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];

  // 0 = bakgrunn, 1 = hvit, RED = rød, GOLD = gul/oransje
  let kind = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const [r, g, b] = rgb(i);
    kind[i] = coloredSure(r, g, b) ? hue(g) : whiteSure(r, g, b) ? 1 : 0;
  }
  for (let pass = 0; pass < 1; pass++) {
    const next = kind.slice();
    for (let i = 0; i < pixels; i++) {
      if (kind[i]) continue;
      const x = i % W;
      const neighbour =
        (x > 0 && kind[i - 1]) || (x < W - 1 && kind[i + 1]) || kind[i - W] || kind[i + W];
      if (!neighbour) continue;
      const [r, g, b] = rgb(i);
      if (neighbour > 1 && coloredMaybe(r, g, b)) next[i] = neighbour;
      else if (neighbour === 1 && whiteMaybe(r, g, b)) next[i] = 1;
    }
    kind = next;
  }

  const H = info.height;
  const small = Buffer.alloc(pixels, 255);
  for (let i = 0; i < pixels; i++) if (kind[i]) small[i] = 0;

  // Variant 1: fargemaske – best når bakgrunnen er lys (himmel o.l.).
  const masked = sharp(small, { raw: { width: W, height: H, channels: 1 } })
    .resize({ width: W * SCALE, height: H * SCALE, kernel: sharp.kernel.lanczos3 })
    .threshold(128);
  // Variant 2: invertert gråskala – best mot travel, mørk bakgrunn.
  const gray = sharp(crop)
    .resize({ width: W * SCALE, height: H * SCALE, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalise()
    .negate();

  const results = await Promise.all(
    [masked, gray].map(async (img) => parseTsv(await runTesseract(await img.png().toBuffer(), 6, ["tsv"])))
  );
  // Velg varianten Tesseract er mest sikker på.
  const best = results.reduce((a, b) => (b.confidence > a.confidence ? b : a));

  // Et ord er farget hvis en merkbar del av boksen består av fargede piksler.
  const lines = best.lines.map((words) =>
    words.map(({ text, left, top, width, height }) => {
      const [x0, y0] = [Math.floor(left / SCALE), Math.floor(top / SCALE)];
      const [x1, y1] = [Math.ceil((left + width) / SCALE), Math.ceil((top + height) / SCALE)];
      let red = 0;
      let gold = 0;
      for (let y = y0; y < Math.min(y1, H); y++) {
        for (let x = x0; x < Math.min(x1, W); x++) {
          const k = kind[y * W + x];
          if (k === RED) red++;
          else if (k === GOLD) gold++;
        }
      }
      const area = Math.max(1, (x1 - x0) * (y1 - y0));
      const color = (red + gold) / area > 0.08 ? (red >= gold ? "red" : "gold") : "white";
      return { text, color };
    })
  );

  // *stjerner* = rød, ^hatter^ = gul (den du ser på)
  const mark = { white: (t) => t, red: (t) => `*${t}*`, gold: (t) => `^${t}^` };
  return {
    text: lines.map((words) => words.map((w) => mark[w.color](w.text)).join(" ")).join("\n"),
    lines,
  };
}

/** Tesseract TSV -> ord gruppert per linje, med posisjon og snitt-sikkerhet. */
function parseTsv(tsv) {
  const lines = new Map();
  let confSum = 0;
  let words = 0;
  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const cols = row.split("\t");
    const text = cols[11]?.trim();
    if (cols[0] !== "5" || !text) continue;
    const [left, top, width, height, conf] = cols.slice(6, 11).map(Number);
    confSum += Math.max(0, conf);
    words++;
    const key = cols.slice(2, 5).join("-"); // blokk-avsnitt-linje
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push({ text, left, top, width, height });
  }
  return { lines: [...lines.values()], confidence: words ? confSum / words : 0 };
}

/**
 * Leser all relevant HUD-info fra ett skjermbilde.
 * @param {Buffer} screenshot  JPG/PNG i hvilken som helst 16:9-oppløsning
 * @param {string} [debugDir]  lagrer utklippene her hvis satt
 */
export async function readFrame(screenshot, debugDir) {
  const { width, height } = await sharp(screenshot).metadata();

  const crops = Object.fromEntries(
    await Promise.all(
      Object.entries(REGIONS).map(async ([name, region]) => [
        name,
        await sharp(screenshot)
          .extract(scaleRegion(region, width, height))
          .png()
          .toBuffer(),
      ])
    )
  );

  if (debugDir) {
    await fs.mkdir(debugDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(debugDir, "frame.jpg"), screenshot),
      ...Object.entries(crops).map(([name, buf]) =>
        fs.writeFile(path.join(debugDir, `${name}.png`), buf)
      ),
    ]);
  }

  const [players, spectatingText, killfeed] = await Promise.all([
    readPlayersLeft(screenshot),
    readLine(crops.spectating),
    readKillfeed(crops.killfeed),
  ]);

  const { spectating, name } = parseSpectating(spectatingText);

  return {
    playersLeft: players.value,
    playersCandidates: players.value === null ? [] : [players.value],
    spectating,
    spectatingName: name,
    eliminations: parseEliminations(killfeed.lines),
    raw: {
      players: [`${players.value ?? "-"} (likhet ${players.score.toFixed(2)})`],
      spectating: spectatingText,
      killfeed: killfeed.text, // *stjerner* = rød tekst
    },
  };
}
