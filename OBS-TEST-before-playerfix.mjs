
import OBSWebSocket from "obs-websocket-js";
import sharp from "sharp";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";

const BASE_DIR = String.raw`D:\bontora-points`;
const TESSERACT = String.raw`C:\Program Files\Tesseract-OCR\tesseract.exe`;
const OBS_SOURCE = "Game Capture";
const OBS_URL = "ws://127.0.0.1:4455";
const API_URL = "http://127.0.0.1:3000/api/bontora";

const WIDTH = 1920;
const HEIGHT = 1080;
const INTERVAL_MS = 1500;

const PLAYER_CROP = {
  left: 1545,
  top: 68,
  width: 55,
  height: 45,
};

const KILLFEED_CROP = {
  left: 20,
  top: 450,
  width: 700,
  height: 140,
};

const obs = new OBSWebSocket();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let iteration = 0;
let lastPlayerCount = null;
let previousKillLines = new Set();
let running = true;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postAPI(data) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`API-feil ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function captureOBS() {
  const result = await obs.call("GetSourceScreenshot", {
    sourceName: OBS_SOURCE,
    imageFormat: "jpg",
    imageWidth: WIDTH,
    imageHeight: HEIGHT,
    imageCompressionQuality: 100,
  });

  const match = result.imageData.match(
    /^data:image\/[\w.+-]+;base64,(.+)$/s
  );

  if (!match) {
    throw new Error("OBS returnerte ikke et gyldig bilde.");
  }

  return Buffer.from(match[1], "base64");
}

async function cropImage(image, area, outputFile) {
  const metadata = await sharp(image).metadata();
  const scaleX = metadata.width / WIDTH;
  const scaleY = metadata.height / HEIGHT;

  const left = Math.max(0, Math.round(area.left * scaleX));
  const top = Math.max(0, Math.round(area.top * scaleY));
  const width = Math.min(
    Math.round(area.width * scaleX),
    metadata.width - left
  );
  const height = Math.min(
    Math.round(area.height * scaleY),
    metadata.height - top
  );

  if (width < 1 || height < 1) {
    throw new Error("UtklippsomrÃ¥det ligger utenfor OBS-bildet.");
  }

  const cropped = await sharp(image)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  await fs.writeFile(path.join(BASE_DIR, outputFile), cropped);
  return cropped;
}

function runTesseract(imageBuffer, psm = 6) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      TESSERACT,
      ["stdin", "stdout", "--psm", String(psm)],
      { windowsHide: true }
    );

    let output = "";
    let errors = "";
    let finished = false;

    const timeout = setTimeout(() => {
      child.kill();
      if (!finished) {
        finished = true;
        reject(new Error("Tesseract brukte for lang tid."));
      }
    }, 10000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (data) => {
      output += data;
    });

    child.stderr.on("data", (data) => {
      errors += data;
    });

    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(
          new Error(`Tesseract-feil ${code}: ${errors.trim()}`)
        );
      }
    });

    child.stdin.on("error", () => {});
    child.stdin.end(imageBuffer);
  });
}

async function readOCR(screenshot, crop, psm = 6) {
  const image = await sharp(screenshot)
    .extract(crop)
    .resize({
      width: crop.width * 3,
      height: crop.height * 3,
      kernel: sharp.kernel.lanczos3,
    })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();

  return runTesseract(image, psm);
}

function findPlayerCount(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d{1,2})(?:\s*[/|]\s*(?:99|100))?$/);
    if (match) {
      const count = Number(match[1]);
      if (count >= 1 && count <= 100) return count;
    }
  }

  return null;
}

function findEliminationLines(text) {
  const words =
    /\b(eliminated|shotgunned|sniped|headshot|blasted)\b/i;

  return [...new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && words.test(line))
  )];
}

function makeEventId(line) {
  // Stabil ID for samme tekstlinje. Ikke nok til Ã¥ skille
  // to ekte elimineringer med helt identisk tekst.
  return Buffer.from(line.toLowerCase()).toString("base64url");
}

async function main() {
  if (!(await fs.stat(TESSERACT).catch(() => null))) {
    throw new Error(`Fant ikke Tesseract: ${TESSERACT}`);
  }

  if (!(await fs.stat(BASE_DIR).catch(() => null))) {
    throw new Error(`Fant ikke prosjektmappen: ${BASE_DIR}`);
  }

  const password = await rl.question("OBS WebSocket-passord: ");
  await obs.connect(OBS_URL, password);
  rl.close();

  console.log("\n=== BONTORA AUTO-EYES ===");
  console.log("Leser killfeed og sender OCR-status til nettsiden.");
  console.log("Automatisk poengfÃ¸ring krever oppdatert API.");
  console.log("Trykk Ctrl+C for Ã¥ avslutte.\n");

  while (running) {
    const started = Date.now();

    try {
      iteration++;

      const screenshot = await captureOBS();
      await fs.writeFile(
        path.join(BASE_DIR, "obs-capture-test.jpg"),
        screenshot
      );

      const [killCrop, playerCrop] = await Promise.all([
        cropImage(screenshot, KILLFEED_CROP, "killfeed-crop.png"),
        cropImage(screenshot, PLAYER_CROP, "player-count-crop.png"),
      ]);

      const [killfeedText, playerText] = await Promise.all([
        runTesseract(
          await sharp(killCrop).resize({ width: 1400 }).png().toBuffer(),
          6
        ),
        runTesseract(
          await sharp(playerCrop)
            .resize({ width: 440 })
            .grayscale()
            .normalize()
            .png()
            .toBuffer(),
          11
        ),
      ]);

      const eliminations = findEliminationLines(killfeedText);
      const playersDetected = findPlayerCount(playerText);

      await postAPI({
        type: "ocr",
        killfeedText,
        playerCountText: playerText,
        eliminations,
        playersDetected,
      });

      console.clear();
      console.log("=== BONTORA AUTO-EYES ===");
      console.log("Runde med OCR:", iteration);
      console.log("\n=== KILLFEED: OCR-TEKST ===");
      console.log(killfeedText || "(ingen tekst gjenkjent)");

      console.log("\n=== ELIMINERINGER FUNNET ===");
      console.log(eliminations.length ? eliminations.join("\n") : "(ingen)");

      console.log("\n=== SPILLERE IGJEN ===");
      console.log(playersDetected ?? "Usikker avlesning");

      if (playersDetected !== null && playersDetected !== lastPlayerCount) {
        lastPlayerCount = playersDetected;
        console.log("Spillertall endret:", playersDetected);
      }

      // Ikke send kill-hendelser automatisk ennÃ¥:
      // OCR-linjen alene beviser ikke sikkert hvem som er killer
      // og hvem som er victim. API-et mÃ¥ ogsÃ¥ hÃ¥ndtere poeng.
      previousKillLines = new Set(eliminations);
      console.log("\nOCR-status sendt til nettsiden.");
    } catch (error) {
      console.error("\nAUTO-EYES-feil:", error.message);
    }

    await sleep(Math.max(0, INTERVAL_MS - (Date.now() - started)));
  }
}

process.on("SIGINT", async () => {
  running = false;
  try {
    await obs.disconnect();
  } catch {}
  process.exit(0);
});

main().catch(async (error) => {
  console.error("Oppstartsfeil:", error.message);
  try {
    await obs.disconnect();
  } catch {}
  process.exit(1);
});


