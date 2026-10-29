import sharp from "sharp";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config, REFERENCE, REGIONS } from "./config.mjs";
import { majorityNumber, parseEliminations, parseSpectating } from "./parse.mjs";

const DIGITS_ONLY = ["-c", "tessedit_char_whitelist=0123456789"];

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

/**
 * Lager svart-på-hvitt-bilder av hvit HUD-tekst.
 *
 * Fast terskel fungerer i vanlig spill. I tilskuermodus legger Fortnite en
 * mørk stripe over toppen av skjermen, og kill-tallet blir nesten usynlig
 * (lysstyrke ~30 av 255). Derfor lages også varianter med terskel relativ
 * til bakgrunnen (median) og den lyseste pikselen.
 */
async function binarizeVariants(crop, targetHeight = 112) {
  const { data, info } = await sharp(crop)
    .grayscale()
    .resize({ height: targetHeight, kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sorted = Uint8Array.from(data).sort();
  const background = sorted[Math.floor(sorted.length / 2)];
  const peak = sorted[sorted.length - 1];
  if (peak - background < 12) return []; // ingen tekst her

  const thresholds = [
    background + (peak - background) * 0.5,
    background + (peak - background) * 0.6,
    160,
  ];

  return Promise.all(
    thresholds.map((t) =>
      sharp(Buffer.from(data.map((v) => (v > t ? 0 : 255))), {
        raw: { width: info.width, height: info.height, channels: 1 },
      })
        .extend({ top: 20, bottom: 20, left: 20, right: 20, background: "#ffffff" })
        .png()
        .toBuffer()
    )
  );
}

async function readNumber(crop) {
  const variants = await binarizeVariants(crop);
  const readings = await Promise.all(
    variants.map((v) => runTesseract(v, 7, DIGITS_ONLY))
  );
  return { value: majorityNumber(readings), readings };
}

async function readLine(crop) {
  const [variant] = await binarizeVariants(crop, 128);
  return variant ? runTesseract(variant, 7) : "";
}

async function readKillfeed(crop) {
  const meta = await sharp(crop).metadata();
  // Mørk tekst på lys bakgrunn gir færre feil, særlig på røde navn.
  const image = await sharp(crop)
    .resize({ width: Math.round(meta.width * (1400 / 650)) })
    .grayscale()
    .normalise()
    .negate()
    .png()
    .toBuffer();
  return runTesseract(image, 6);
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

  const [kills, players, spectatingText, killfeedText] = await Promise.all([
    readNumber(crops.kills),
    readNumber(crops.players),
    readLine(crops.spectating),
    readKillfeed(crops.killfeed),
  ]);

  const { spectating, name } = parseSpectating(spectatingText);

  return {
    kills: kills.value,
    playersLeft: players.value,
    spectating,
    spectatingName: name,
    eliminations: parseEliminations(killfeedText),
    raw: {
      kills: kills.readings,
      players: players.readings,
      spectating: spectatingText,
      killfeed: killfeedText,
    },
  };
}
