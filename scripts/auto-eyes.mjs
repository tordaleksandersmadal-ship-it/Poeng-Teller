// BONTORA AUTO-EYES
// Henter skjermbilder fra OBS, leser HUD-en med OCR og sender resultatet
// til nettsiden (npm run dev må kjøre).
//
//   npm run eyes             start
//   npm run eyes -- --debug  lagrer siste bilde + utklipp i debug/live/

import OBSWebSocket from "obs-websocket-js";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { config, REFERENCE } from "./lib/config.mjs";
import { readFrame } from "./lib/ocr.mjs";

const debugDir = process.argv.includes("--debug")
  ? path.resolve(import.meta.dirname, "..", "debug", "live")
  : undefined;

const obs = new OBSWebSocket();
let running = true;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function askPassword() {
  if (config.obsPassword !== null) return config.obsPassword;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question("OBS WebSocket-passord (tomt hvis av): ");
  rl.close();
  return password || undefined;
}

async function connectOBS(password) {
  await obs.connect(config.obsUrl, password);
  console.log(`Koblet til OBS på ${config.obsUrl}`);
}

async function captureOBS() {
  const { imageData } = await obs.call("GetSourceScreenshot", {
    sourceName: config.obsSource,
    imageFormat: "jpg",
    imageWidth: REFERENCE.width,
    imageHeight: REFERENCE.height,
    imageCompressionQuality: 95,
  });

  const match = imageData.match(/^data:image\/[\w.+-]+;base64,(.+)$/s);
  if (!match) throw new Error("OBS returnerte ikke et gyldig bilde.");
  return Buffer.from(match[1], "base64");
}

async function postFrame(frame) {
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(frame),
  });
  if (!response.ok) {
    throw new Error(`API svarte ${response.status}: ${await response.text()}`);
  }
}

function printStatus(iteration, frame, apiError) {
  console.clear();
  console.log("=== BONTORA AUTO-EYES ===  (Ctrl+C for å avslutte)");
  console.log(`Runde: ${iteration}   Kilde: "${config.obsSource}"`);
  console.log(
    `Modus: ${frame.spectating ? `TILSKUER (${frame.spectatingName ?? "ukjent"})` : "spiller"}`
  );
  console.log(`Spillere igjen: ${frame.playersLeft ?? "usikker"}   (rå: ${JSON.stringify(frame.raw.players)})`);
  console.log(`Kills:          ${frame.kills ?? "usikker"}   (rå: ${JSON.stringify(frame.raw.kills)})`);
  console.log("\n--- Elimineringer i killfeed ---");
  console.log(
    frame.eliminations.length
      ? frame.eliminations.map((e) => `${e.killer ?? "?"} -> ${e.victim}`).join("\n")
      : "(ingen)"
  );
  console.log("\n--- Rå killfeed-tekst ---");
  console.log(frame.raw.killfeed || "(ingen tekst)");
  console.log(apiError ? `\nNettside: FEIL – ${apiError}` : "\nNettside: oppdatert");
}

async function main() {
  await fs.access(config.tesseract).catch(() => {
    throw new Error(
      `Fant ikke Tesseract på ${config.tesseract}. Installer den eller sett TESSERACT_PATH.`
    );
  });

  const password = await askPassword();
  await connectOBS(password);

  let iteration = 0;
  while (running) {
    const started = Date.now();
    try {
      if (!obs.identified) await connectOBS(password);

      iteration++;
      const frame = await readFrame(await captureOBS(), debugDir);

      // Vis alltid OCR-resultatet, også om nettsiden er nede.
      let apiError = null;
      await postFrame(frame).catch((error) => (apiError = error.cause?.code ?? error.message));
      printStatus(iteration, frame, apiError);
    } catch (error) {
      console.error("\nAUTO-EYES-feil:", error.message);
    }
    await sleep(Math.max(0, config.intervalMs - (Date.now() - started)));
  }
}

process.on("SIGINT", async () => {
  running = false;
  await obs.disconnect().catch(() => {});
  process.exit(0);
});

main().catch(async (error) => {
  console.error("Oppstartsfeil:", error.message);
  await obs.disconnect().catch(() => {});
  process.exit(1);
});
