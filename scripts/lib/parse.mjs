// Rene tekst-parsere uten avhengigheter, så de er enkle å teste.

const KILL_VERBS = /\b(eliminated|shotgunned|sniped|headshot|blasted)\b/i;

/** Velger det tallet flest avlesninger er enige om (første vinner ved likt). */
export function majorityNumber(readings, { min = 0, max = 100 } = {}) {
  const counts = new Map();
  for (const text of readings) {
    const digits = (text ?? "").replace(/\D/g, "");
    if (!digits || digits.length > 3) continue;
    const value = Number(digits);
    if (value < min || value > max) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** OCR blander ofte [ { ( | — sammenlign navn kun på bokstaver og tall. */
export function nameKey(name) {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "SPECTATING: Navn" -> { spectating: true, name: "Navn" } */
export function parseSpectating(text) {
  const match = (text ?? "").match(/SPECTAT\w*\s*[:;.]?\s*(.*)/i);
  if (!match) return { spectating: false, name: null };
  return { spectating: true, name: match[1].trim() || null };
}

/** "A eliminated B with a pistol" -> { killer: "A", verb: "eliminated", victim: "B", line } */
export function parseEliminations(text) {
  const seen = new Set();
  const result = [];

  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    const verb = line.match(KILL_VERBS);
    if (!verb || seen.has(line)) continue;
    seen.add(line);

    const killer = line.slice(0, verb.index).trim();
    const victim = line
      .slice(verb.index + verb[0].length)
      .replace(/\s+with\b.*$/i, "")
      .trim();

    if (!victim) continue;
    result.push({ killer: killer || null, verb: verb[1].toLowerCase(), victim, line });
  }

  return result;
}
