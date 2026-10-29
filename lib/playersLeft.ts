// "Spillere igjen" leses av OCR, men i tilskuermodus dekker den mørke
// stripa toppen av sifrene, så 8 kan bli lest som 3, 6 eller 2. Her brukes
// sunn fornuft: tallet kan bare gå NED i en kamp, og ikke veldig mye om
// gangen. Av kandidatene fra OCR velges den som passer.

export type PlayersTracker = {
  value: number | null;
  /** Siste flertallsavlesning og hvor mange bilder på rad den er sett. */
  streak: { value: number; count: number } | null;
};

/** Så mange like avlesninger på rad godtas uansett (ny kamp, eller vi tok feil). */
const RECOVER_AFTER = 4;

export function nextPlayersLeft(
  tracker: PlayersTracker,
  candidates: number[],
  majority: number | null,
  secondsSinceLast: number
): PlayersTracker {
  const streak =
    majority === null
      ? tracker.streak
      : tracker.streak?.value === majority
        ? { value: majority, count: tracker.streak.count + 1 }
        : { value: majority, count: 1 };

  const prev = tracker.value;
  if (prev === null) {
    // Første verdi: krev to like avlesninger på rad.
    return { value: streak && streak.count >= 2 ? streak.value : null, streak };
  }
  if (streak && streak.count >= RECOVER_AFTER && streak.value !== prev) {
    return { value: streak.value, streak };
  }

  // Godta et fall på inntil 8, eller mer hvis det er lenge siden sist.
  const maxDrop = Math.max(8, Math.ceil(secondsSinceLast * 4));
  const votes = new Map<number, number>();
  for (const v of candidates) {
    if (v <= prev && v >= prev - maxDrop) votes.set(v, (votes.get(v) ?? 0) + 1);
  }
  if (!votes.size) return { value: prev, streak };

  // Flest stemmer; ved likt velges høyeste (minst fall).
  const [best] = [...votes].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  return { value: best[0], streak };
}
