// Leser "spillere igjen" med mønstergjenkjenning i stedet for Tesseract.
//
// Fortnite tegner HUD-tallet alltid med samme skrift og størrelse, rett
// til venstre for person-ikonet. I tilskuermodus dekker en halvgjennomsiktig
// mørk stripe toppen av sifrene, så vi ser bare på radene under stripa
// (y 80–92). Hvert siffer sammenlignes piksel for piksel med en mal for
// 0–9, laget fra ekte skjermbilder (se scripts/build-digit-templates.mjs).

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { REFERENCE } from "./config.mjs";

/** Sifferradene i 1920x1080-koordinater. Tallet er høyrejustert mot x=1576. */
export const DIGIT_BOX = { left: 1520, top: 80, width: 64, height: 13 };

export const TEMPLATE_FILE = path.join(import.meta.dirname, "digit-templates.json");
let templates = null;

/** Laveste likhet (0–1) for at et siffer godtas. */
const MIN_SCORE = 0.6;

// Rent hvitt, lite fargemetning. Lys rosa himmel ~(232,212,223) har for
// mye metning til å bli tatt med.
const isDigitPixel = (r, g, b) =>
  Math.min(r, g, b) >= 242 && Math.max(r, g, b) - Math.min(r, g, b) <= 12;

/**
 * Lager et svart/hvitt-kart (1 = siffer) av DIGIT_BOX.
 * @param {Buffer} image  helt skjermbilde, eller et utklipp
 * @param {{left:number, top:number}} [origin]  utklippets posisjon i 1920x1080
 */
export async function digitMask(image, origin = { left: 0, top: 0 }) {
  let img = sharp(image);
  if (!origin.left && !origin.top) {
    const { width, height } = await img.metadata();
    if (width !== REFERENCE.width || height !== REFERENCE.height) {
      img = sharp(await img.resize(REFERENCE.width, REFERENCE.height).toBuffer());
    }
  }
  const { data } = await img
    .extract({
      left: DIGIT_BOX.left - origin.left,
      top: DIGIT_BOX.top - origin.top,
      width: DIGIT_BOX.width,
      height: DIGIT_BOX.height,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: W, height: H } = DIGIT_BOX;
  const mask = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const i = (y * W + x) * 3;
      return isDigitPixel(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
    })
  );
  return mask;
}

/** Deler kartet i sifre: sammenhengende kolonner med blekk. */
export function segment(mask) {
  const W = mask[0].length;
  const ink = (x) => mask.reduce((n, row) => n + row[x], 0);
  const glyphs = [];
  let start = -1;
  for (let x = 0; x <= W; x++) {
    const has = x < W && ink(x) > 0;
    if (has && start < 0) start = x;
    if (!has && start >= 0) {
      const glyph = mask.map((row) => row.slice(start, x));
      const total = glyph.flat().reduce((a, b) => a + b, 0);
      if (x - start >= 2 && total >= 8) glyphs.push(glyph); // ignorer støyprikker
      start = -1;
    }
  }
  return glyphs;
}

/** Likhet mellom to bitmaps (Jaccard), beste av små sideforskyvninger. */
function similarity(a, b) {
  const wa = a[0].length;
  const wb = b[0].length;
  const W = Math.max(wa, wb) + 2;
  let best = 0;
  for (let shift = -1; shift <= 1; shift++) {
    const offA = Math.floor((W - wa) / 2);
    const offB = Math.floor((W - wb) / 2) + shift;
    let both = 0;
    let either = 0;
    for (let y = 0; y < a.length; y++) {
      for (let x = 0; x < W; x++) {
        const pa = a[y][x - offA] ?? 0;
        const pb = b[y][x - offB] ?? 0;
        both += pa & pb;
        either += pa | pb;
      }
    }
    if (either) best = Math.max(best, both / either);
  }
  return best;
}

function loadTemplates() {
  if (!templates) {
    templates = JSON.parse(fs.readFileSync(TEMPLATE_FILE, "utf8"));
    for (const t of Object.values(templates)) t.bitmap = t.rows.map((r) => [...r].map(Number));
  }
  return templates;
}

/** Leser tallet. Gir { value, score } – value er null hvis noe er usikkert. */
export async function readPlayersLeft(image, origin) {
  const glyphs = segment(await digitMask(image, origin));
  if (!glyphs.length || glyphs.length > 3) return { value: null, score: 0 };

  const tpl = loadTemplates();
  let digits = "";
  let worst = 1;
  for (const glyph of glyphs) {
    let bestDigit = null;
    let bestScore = 0;
    for (const [digit, t] of Object.entries(tpl)) {
      const s = similarity(glyph, t.bitmap);
      if (s > bestScore) [bestDigit, bestScore] = [digit, s];
    }
    digits += bestDigit;
    worst = Math.min(worst, bestScore);
  }

  const value = Number(digits);
  if (worst < MIN_SCORE || value < 1 || value > 100) return { value: null, score: worst };
  return { value, score: worst };
}
