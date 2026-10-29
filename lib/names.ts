// OCR leser samme navn litt forskjellig fra bilde til bilde
// ("Juksemaker99", "Juksemaker{99", "juksemaker 99"). Disse hjelperne
// avgjør om to avlesninger er samme spiller.

/** Kun små bokstaver og tall. */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Like nok til å være samme spiller. Lange navn tåler flere OCR-feil
 * ("Bradd:eRoyeles0" = "BraddleRoyale80").
 *
 * Unntak: har navnene nøyaktig samme bokstaver og bare tallene skiller,
 * er det trolig forskjellige spillere ("Anonymous[260]" og "Anonymous[286]").
 * Da må tallene være nesten like.
 */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (Math.min(ka.length, kb.length) < 4) return false;

  const letters = (k: string) => k.replace(/[0-9]/g, "");
  const digits = (k: string) => k.replace(/[^0-9]/g, "");
  if (letters(ka) === letters(kb)) return editDistance(digits(ka), digits(kb)) <= 1;

  // Rester av verbet henger igjen bak navnet: "okak54 eli" = "okak54",
  // "Anonymous[260] finally" = "Anonymous[260]". Krever tall i det korte
  // navnet, så "Anonymous" alene ikke slukes av alle "Anonymous[123]".
  const [short, long] = ka.length < kb.length ? [ka, kb] : [kb, ka];
  if (short.length >= 6 && /[0-9]/.test(short) && long.startsWith(short)) {
    const extra = long.slice(short.length);
    if (extra.length <= 8 && /[a-z]/.test(extra)) return true;
  }

  const longest = Math.max(ka.length, kb.length);
  const allowed = longest >= 12 ? 3 : longest >= 8 ? 2 : 1;
  return editDistance(ka, kb) <= allowed;
}

/** Andel tegn som er forskjellige (0 = like, 1 = helt ulike). */
export function nameDistance(a: string | null | undefined, b: string | null | undefined): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 1;
  return editDistance(ka, kb) / Math.max(ka.length, kb.length);
}

/** Grovere likhet: under halvparten av tegnene er forskjellige. */
export function looselySame(a: string | null | undefined, b: string | null | undefined): boolean {
  return nameDistance(a, b) <= 0.5;
}

export function isDisqualified(name: string | null | undefined, disqualified: string[]): boolean {
  return disqualified.some((dq) => sameName(dq, name));
}
