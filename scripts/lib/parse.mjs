// Rene tekst-parsere uten avhengigheter, så de er enkle å teste.

/** OCR blander ofte [ { ( | — sammenlign navn kun på bokstaver og tall. */
export function nameKey(name) {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * "SPECTATING: Navn" -> { spectating: true, name: "Navn" }
 * Teksten er høyrejustert, så lange navn kan skyve "SPEC" ut av utklippet.
 */
export function parseSpectating(text) {
  const match = (text ?? "").match(/TATING\s*[:;.]?\s*(.*)/i);
  if (!match) return { spectating: false, name: null };
  return { spectating: true, name: match[1].trim() || null };
}

/**
 * Rydder et navn fra killfeeden:
 *  - fjerner OCR-søppel foran ("_ Young goat4258" -> "Young goat4258")
 *  - fjerner tallet i parentes bak ("Romano8D (121)" -> "Romano8D"). OCR
 *    blander ( { [, men det må stå et mellomrom foran, ellers er det en del
 *    av navnet ("Anonymous[312]").
 */
export function cleanName(name) {
  return (name ?? "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+[({[]\s*[\d\s*]*[)}\]]?\s*$/, "")
    .replace(/[^\p{L}\p{N}\])}]+$/u, "")
    .trim();
}

/** Minst tre bokstaver/tall – ellers er det OCR-støy. */
const looksLikeName = (name) => (name.match(/[\p{L}\p{N}]/gu) ?? []).length >= 3;

// Hvite ord mellom killer og offer. Fortnite har mange varianter; ukjente
// verb håndteres ved å anta at siste hvite ord før offeret er verbet.
// Lengste først, så "finally eliminated" ikke blir "<navn> finally" + "eliminated".
const VERB_PHRASES = [
  "drained the life from",
  "finally eliminated",
  "knocked down",
  "eliminated",
  "shotgunned",
  "farmed",
  "staked",
  "sniped",
  "headshot",
  "blasted",
  "finished",
];

// Linjer der offeret står først, f.eks. storm eller fall.
const NO_KILLER = /\b(storm|fell|fall|died|eliminated|self)\b/i;

const textOf = (run) => run.words.join(" ");

/**
 * Tolker killfeed-linjer. Hvert ord har en farge:
 *   "white" – killer og verb
 *   "red"   – offeret
 *   "gold"  – spilleren du ser på, enten som killer eller offer
 * Offeret er derfor første fargede ord-gruppe som kommer ETTER hvit tekst.
 *   "A eliminated *B* with a rifle"      ->  killer A, offer B
 *   "^A^ staked *B*"                     ->  killer A (gul), offer B
 *   "A eliminated ^B^ with a rifle"      ->  offer B (gul) – den du så på døde
 *   "^B^ is now spectating with you"     ->  ignoreres
 *   "^B^ dropped a Victory Crown!"       ->  ignoreres
 * Mangler killeren (avlest dårlig), telles drapet likevel med killer = null,
 * siden offerets plassering er det viktigste.
 */
export function parseEliminations(lines) {
  const result = [];

  for (const words of lines ?? []) {
    const runs = [];
    for (const w of words) {
      const last = runs[runs.length - 1];
      if (last?.color === w.color) last.words.push(w.text);
      else runs.push({ color: w.color, words: [w.text] });
    }
    const line = words.map((w) => w.text).join(" ");

    const v = runs.findIndex((r, i) => r.color !== "white" && runs.slice(0, i).some((x) => x.color === "white"));
    if (v === -1) {
      // Offeret først: storm/fall, eller "is now spectating"/"Victory Crown".
      if (runs[0]?.color === "red") {
        const victim = cleanName(textOf(runs[0]));
        const after = runs.slice(1).map(textOf).join(" ");
        if (looksLikeName(victim) && !/spectat/i.test(after) && NO_KILLER.test(after)) {
          result.push({ killer: null, verb: after.trim().split(/\s+/)[0] ?? "", victim, line });
        }
      }
      continue;
    }

    // "with a rifle" blir av og til lest som farget – det er ikke en del av navnet.
    const victim = cleanName(textOf(runs[v]).replace(/\s+with\b.*$/i, ""));
    if (!looksLikeName(victim)) continue;

    // Siste hvite gruppe før offeret inneholder verbet (og killeren hvis den er hvit).
    const verbRun = runs.slice(0, v).findLastIndex((r) => r.color === "white");
    const white = textOf(runs[verbRun]).trim();
    const coloredKiller = runs.slice(0, verbRun).filter((r) => r.color !== "white").map(textOf).join(" ");

    // Verbet står rett før offeret, av og til uten mellomrom
    // ("CounterMantra.eliminated"). Står et kjent verb midt i den hvite
    // teksten, mangler offeret i avlesningen – hopp over linjen.
    const lower = white.toLowerCase();
    const phrase = VERB_PHRASES.find((p) => lower.endsWith(p));
    if (!phrase && VERB_PHRASES.some((p) => lower.includes(p))) continue;
    const verb = phrase ?? white.split(/\s+/).pop();
    if (!phrase && !/^\p{L}{4,}$/u.test(verb)) continue; // ukjent "verb" som ikke er et ord

    const whiteKiller = white.slice(0, white.length - verb.length);
    const killer = cleanName(coloredKiller || whiteKiller);
    // Ren avlesning: kjent verb stavet riktig. Kan telles fra ett bilde.
    const certain = Boolean(phrase);
    result.push({
      killer: looksLikeName(killer) ? killer : null,
      verb: verb.toLowerCase(),
      victim,
      certain,
      line,
    });
  }

  return result;
}
