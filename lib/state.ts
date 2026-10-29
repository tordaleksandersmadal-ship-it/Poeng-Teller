// Kampstatus holdes i minnet på serveren. Den nullstilles når serveren
// restartes, eller med "Ny kamp" på dashbordet (DELETE /api/bontora).

export type Elimination = {
  id: string;
  killer: string | null;
  victim: string;
  verb: string;
  at: number;
};

export type RawOcr = {
  kills: string[];
  players: string[];
  spectating: string;
  killfeed: string;
};

export type BontoraState = {
  updatedAt: number | null;
  spectating: boolean;
  spectatingName: string | null;
  playersLeft: number | null;
  kills: number | null;
  eliminations: Elimination[]; // nyeste først
  raw: RawOcr | null;
};

/** Det auto-eyes.mjs sender for hvert bilde. */
export type FramePayload = {
  kills: number | null;
  playersLeft: number | null;
  spectating: boolean;
  spectatingName: string | null;
  eliminations: { killer: string | null; victim: string; verb: string }[];
  raw: RawOcr;
};

const MAX_ELIMINATIONS = 100;

const emptyState = (): BontoraState => ({
  updatedAt: null,
  spectating: false,
  spectatingName: null,
  playersLeft: null,
  kills: null,
  eliminations: [],
  raw: null,
});

// globalThis overlever hot reload i `next dev`.
const store = globalThis as unknown as { bontora?: BontoraState };

export function getState(): BontoraState {
  return (store.bontora ??= emptyState());
}

export function resetState(): BontoraState {
  return (store.bontora = emptyState());
}

/** OCR blander ofte [ { ( | — sammenlign navn kun på bokstaver og tall. */
const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function applyFrame(frame: FramePayload): BontoraState {
  const state = getState();
  const now = Date.now();

  state.updatedAt = now;
  state.spectating = frame.spectating;
  state.spectatingName = frame.spectatingName;
  state.raw = frame.raw;
  // Behold forrige verdi hvis tallet ikke kunne leses i dette bildet.
  state.playersLeft = frame.playersLeft ?? state.playersLeft;
  state.kills = frame.kills ?? state.kills;

  // Samme killfeed-linje står på skjermen i flere sekunder, og en spiller
  // kan bare elimineres én gang per kamp: dedupliser på offerets navn.
  const seen = new Set(state.eliminations.map((e) => nameKey(e.victim)));
  for (const e of frame.eliminations) {
    const key = nameKey(e.victim);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    state.eliminations.unshift({ ...e, id: `${now}-${key}`, at: now });
  }
  state.eliminations.length = Math.min(state.eliminations.length, MAX_ELIMINATIONS);

  return state;
}
