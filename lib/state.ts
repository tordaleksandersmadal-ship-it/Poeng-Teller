// Cup-status holdes på serveren og lagres i data/bontora.json, så
// turneringen overlever at `npm run dev` restartes.
//
// Arrangøren ser på lobbyen i tilskuermodus. Poeng kommer fra killfeeden:
//   "A eliminated B"  ->  A får ett kill, B får plassering = spillere igjen + 1

import fs from "node:fs";
import path from "node:path";
import { looselySame, nameDistance, sameName } from "./names";
import { nextPlayersLeft } from "./playersLeft";
import type { MatchResult, PlayerResult } from "./scoring";

export type Elimination = {
  id: string;
  killer: string | null;
  victim: string;
  verb: string;
  at: number;
};

/** En killfeed-linje som er sett, men ikke bekreftet i nok bilder ennå. */
type PendingElimination = {
  killer: string | null;
  victim: string;
  verb: string;
  firstAt: number;
  sightings: number;
  certain?: boolean;
};

/**
 * Plasseringer kobles til nedganger i spillertallet: faller tallet fra 5 til
 * 4, er plass 5 "ledig", og en eliminering sett samtidig får den.
 */
type OpenPlace = { placement: number; at: number };
type AwaitingPlace = { victim: string; at: number };

export type RawOcr = {
  players: string[];
  spectating: string;
  killfeed: string;
};

export type BontoraState = {
  updatedAt: number | null;
  spectating: boolean;
  spectatingName: string | null;
  playersLeft: number | null;
  playersStreak: { value: number; count: number } | null;
  /** Høyeste "spillere igjen" denne kampen. Drap teller først når tallet har falt. */
  maxPlayersLeft: number | null;
  players: PlayerResult[]; // denne kampen
  eliminations: Elimination[]; // denne kampen, nyeste først
  pending: PendingElimination[];
  openPlaces: OpenPlace[];
  awaitingPlace: AwaitingPlace[];
  raw: RawOcr | null;
  matches: MatchResult[]; // ferdige kamper, eldste først
  /** Diskvalifiserte navn. Skjules fra tavla, men data beholdes så det kan angres. */
  disqualified: string[];
};

/** Det auto-eyes.mjs sender for hvert bilde. */
export type FramePayload = {
  /** Tidspunkt (ms). Settes bare ved avspilling av opptak; ellers brukes nå. */
  at?: number;
  playersLeft: number | null;
  playersCandidates?: number[];
  spectating: boolean;
  spectatingName: string | null;
  eliminations: {
    killer: string | null;
    victim: string;
    verb: string;
    /** Ren avlesning som kan telles fra ett bilde. */
    certain?: boolean;
  }[];
  raw: RawOcr;
};

const MAX_ELIMINATIONS = 200;
/** Usikre linjer må sees i så mange bilder før de teller (filtrerer OCR-støy). */
const CONFIRM_SIGHTINGS = 2;
/** Sees et offer igjen etter så lang tid, er det en ny eliminering. */
const REELIMINATION_MS = 12_000;
/** Ubekreftede linjer glemmes etter så lang tid. */
const PENDING_TTL_MS = 15_000;
/**
 * En eliminering og nedgangen i spillertallet må skje innen så lang tid av
 * hverandre. Eliminering uten nedgang = ikke endelig (gjenoppliving o.l.).
 */
const PLACE_WINDOW_MS = 8_000;
const FILE = process.env.BONTORA_DATA_FILE ?? path.join(process.cwd(), "data", "bontora.json");

const emptyMatch = () => ({
  updatedAt: null,
  spectating: false,
  spectatingName: null,
  playersLeft: null,
  playersStreak: null,
  maxPlayersLeft: null,
  players: [],
  eliminations: [],
  pending: [],
  openPlaces: [],
  awaitingPlace: [],
  raw: null,
});

const emptyState = (): BontoraState => ({ ...emptyMatch(), matches: [], disqualified: [] });

function load(): BontoraState {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const state: BontoraState = { ...emptyState(), ...saved };
    // Hopp over kamper lagret i et eldre format.
    state.matches = state.matches.filter((m) => Array.isArray(m?.players));
    return state;
  } catch {
    return emptyState();
  }
}

function save(state: BontoraState): BontoraState {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  return state;
}

// globalThis overlever hot reload i `next dev`.
const store = globalThis as unknown as { bontora?: BontoraState };

export function getState(): BontoraState {
  // Fyller inn felt som mangler hvis tilstanden er fra en eldre versjon
  // (f.eks. etter hot reload mens serveren kjører).
  return (store.bontora = { ...emptyState(), ...(store.bontora ?? load()) });
}

function findPlayer(state: BontoraState, name: string) {
  return state.players.find((p) => sameName(p.name, name));
}

/**
 * Finner eller lager spilleren. Hver skrivemåte OCR har sett telles, og
 * spilleren vises med den vanligste ("SilentRogue98" slår "SilentRague98").
 */
function getOrAddPlayer(state: BontoraState, name: string) {
  let player = findPlayer(state, name);
  if (!player) {
    player = { name, kills: 0, placement: null, eliminated: false, spellings: {} };
    state.players.push(player);
  }
  noteSpelling(player, name);
  return player;
}

function noteSpelling(player: PlayerResult, name: string) {
  const spellings = (player.spellings ??= {});
  spellings[name] = (spellings[name] ?? 0) + 1;
  player.name = Object.entries(spellings).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Killer-navn er ofte mer forvansket enn offernavn. Finnes ingen nær match,
 * velg den klart nærmeste kjente spilleren hvis den er rimelig lik
 * ("MermeDogS4" = "MarineDog54"). Ellers blir det en ny spiller.
 */
function getOrAddKiller(state: BontoraState, name: string) {
  if (!findPlayer(state, name)) {
    const ranked = state.players
      .map((p) => ({ p, d: nameDistance(p.name, name) }))
      .sort((a, b) => a.d - b.d);
    const [best, second] = ranked;
    if (best && best.d <= 0.4 && (!second || second.d - best.d >= 0.15)) {
      noteSpelling(best.p, name);
      return best.p;
    }
  }
  return getOrAddPlayer(state, name);
}

/**
 * Killeren dukker ofte opp før offeret, så et forvansket killer-navn
 * ("MermeDogS4") kan bli egen spiller før det riktige ("MarineDog54") er
 * sett. Når den riktige så røk ut, kan ikke "fantomet" fortsatt være med:
 * slå sammen en levende spiller med en klart lignende som er ute.
 */
function mergePhantoms(state: BontoraState) {
  for (const phantom of state.players.filter((p) => !p.eliminated && p.placement === null)) {
    const ranked = state.players
      .filter((p) => p !== phantom)
      .map((p) => ({ p, d: nameDistance(p.name, phantom.name) }))
      .sort((a, b) => a.d - b.d);
    const [best, second] = ranked;
    if (!best?.p.eliminated || best.d > 0.4 || (second && second.d - best.d < 0.15)) continue;

    best.p.kills += phantom.kills;
    for (const [spelling, count] of Object.entries(phantom.spellings ?? {})) {
      best.p.spellings = { ...best.p.spellings, [spelling]: (best.p.spellings?.[spelling] ?? 0) + count };
    }
    state.players = state.players.filter((p) => p !== phantom);
  }
}

/** Nullstiller hele turneringen, inkludert kamphistorikk og disk-liste. */
export function resetAll(): BontoraState {
  return save((store.bontora = emptyState()));
}

/** Lagrer kampen i historikken og starter en ny. */
export function finishMatch(): BontoraState {
  const { matches, disqualified, players } = getState();
  if (players.length) matches.push({ endedAt: Date.now(), players });
  return save((store.bontora = { ...emptyMatch(), matches, disqualified }));
}

/** Manuell retting av en spiller i pågående kamp. Lager spilleren hvis den mangler. */
export function editPlayer(name: string, changes: { kills?: number; placement?: number | null }) {
  const state = getState();
  const player = getOrAddPlayer(state, name);
  if (changes.kills !== undefined) player.kills = changes.kills;
  if (changes.placement !== undefined) player.placement = changes.placement;
  return save(state);
}

export function disqualify(name: string): BontoraState {
  const state = getState();
  if (!state.disqualified.some((n) => sameName(n, name))) state.disqualified.push(name);
  return save(state);
}

export function undoDisqualify(name: string): BontoraState {
  const state = getState();
  state.disqualified = state.disqualified.filter((n) => !sameName(n, name));
  return save(state);
}

/**
 * Kobler elimineringer til nedganger i spillertallet, eldste først. Faller
 * tallet med 2 (fra 5 til 3), får den eldste elimineringen plass 5 og den
 * neste plass 4.
 *
 * I moduser med gjenoppliving/andre sjanse står det "X eliminated Y" uten at
 * Y er ute. Da faller ikke tallet, elimineringen får ingen plass, og Y regnes
 * som i live igjen når vinduet har gått ut. Den stjeler dermed ikke plassen
 * til en som faktisk røk ut.
 */
function assignPlaces(state: BontoraState, now: number) {
  for (const waiting of state.awaitingPlace) {
    if (now - waiting.at <= PLACE_WINDOW_MS) continue;
    const player = findPlayer(state, waiting.victim);
    if (player?.eliminated && player.placement === null) player.eliminated = false;
  }
  state.awaitingPlace = state.awaitingPlace
    .filter((w) => now - w.at <= PLACE_WINDOW_MS)
    .sort((a, b) => a.at - b.at);
  state.openPlaces = state.openPlaces
    .filter((s) => now - s.at <= PLACE_WINDOW_MS)
    .sort((a, b) => b.placement - a.placement);

  // Hver ledig plass går til elimineringen nærmest i tid (ved likt: den
  // eldste, som da får dårligst plass). Er ingen innen 2 sek, vent litt –
  // linjen for den som faktisk døde kan komme i neste bilde.
  for (const place of [...state.openPlaces]) {
    if (!state.awaitingPlace.length) break;
    const closest = state.awaitingPlace.reduce((a, b) =>
      Math.abs(b.at - place.at) < Math.abs(a.at - place.at) ? b : a
    );
    if (Math.abs(closest.at - place.at) > 2_000 && now - place.at < 3_000) continue;

    const player = findPlayer(state, closest.victim);
    if (player) player.placement = place.placement;
    state.awaitingPlace = state.awaitingPlace.filter((w) => w !== closest);
    state.openPlaces = state.openPlaces.filter((s) => s !== place);
  }
}

/** En bekreftet eliminering gir kill, og venter på plass (se assignPlaces). */
function confirm(state: BontoraState, p: PendingElimination, now: number) {
  const victim = getOrAddPlayer(state, p.victim);
  victim.eliminated = true;
  victim.eliminatedAt = p.firstAt;
  state.awaitingPlace = state.awaitingPlace.filter((w) => !sameName(w.victim, p.victim));
  state.awaitingPlace.push({ victim: victim.name, at: p.firstAt });

  if (p.killer && !sameName(p.killer, p.victim)) {
    const killer = getOrAddKiller(state, p.killer);
    // Den som tar et kill, lever. Ble killeren registrert som ute FØR denne
    // linjen dukket opp, var det feil (f.eks. en lik spiller), så frigjør
    // plasseringen – hen får riktig plass når hen faktisk dør.
    const diedBefore = killer.eliminatedAt !== undefined && p.firstAt > killer.eliminatedAt + 3000;
    if (killer.eliminated && diedBefore && nameDistance(killer.name, p.killer) <= 0.15) {
      killer.eliminated = false;
      killer.placement = null;
      state.awaitingPlace = state.awaitingPlace.filter((w) => !sameName(w.victim, killer.name));
    }
    killer.kills++;
  }
  state.eliminations.unshift({
    id: `${now}-${state.eliminations.length}`,
    killer: p.killer,
    victim: p.victim,
    verb: p.verb,
    at: now,
  });
}

export function applyFrame(frame: FramePayload): BontoraState {
  const state = getState();
  const now = frame.at ?? Date.now();
  const before = state.playersLeft;

  const tracker = nextPlayersLeft(
    { value: state.playersLeft, streak: state.playersStreak },
    frame.playersCandidates ?? (frame.playersLeft === null ? [] : [frame.playersLeft]),
    frame.playersLeft,
    state.updatedAt ? (now - state.updatedAt) / 1000 : 0
  );
  state.playersLeft = tracker.value;
  state.playersStreak = tracker.streak;
  if (tracker.value !== null) {
    state.maxPlayersLeft = Math.max(state.maxPlayersLeft ?? 0, tracker.value);
  }
  // På oppvarmingsøya før kampen dør folk uten at tallet går ned (de
  // gjenoppstår). Drap teller derfor først når tallet har falt.
  const matchRunning =
    state.playersLeft !== null &&
    state.maxPlayersLeft !== null &&
    state.playersLeft < state.maxPlayersLeft;

  // Tallet falt fra f.eks. 5 til 3: plass 5 og 4 er nå ledige.
  if (before !== null && state.playersLeft !== null && state.playersLeft < before) {
    for (let place = before; place > state.playersLeft; place--) {
      state.openPlaces.push({ placement: place, at: now });
    }
  }

  // Hver gang en kjent spiller dukker opp, telles skrivemåten.
  for (const e of frame.eliminations) {
    for (const name of [e.killer, e.victim]) {
      const player = name ? findPlayer(state, name) : undefined;
      if (player && name) noteSpelling(player, name);
    }
  }

  // Samme killfeed-linje står på skjermen i flere sekunder. En spiller kan
  // bare elimineres én gang per kamp, så linjen er ny bare hvis offeret ikke
  // allerede er ute.
  // Samme linje kan også leses med to ulike skrivemåter av offeret
  // ("Aim Like Idaho" / "Aim L [dah"). Samme killer + lignende offer
  // innen kort tid er da samme drap.
  const recentDuplicate = (e: FramePayload["eliminations"][number]) =>
    state.eliminations.some(
      (old) =>
        now - old.at < 20_000 &&
        sameName(old.killer, e.killer) &&
        looselySame(old.victim, e.victim)
    );
  // Samme linje står på skjermen i ~10 sekunder. Sees offeret igjen senere,
  // er det en ny eliminering (spilleren var gjenopplivet).
  const recentlyEliminated = (name: string) => {
    const p = findPlayer(state, name);
    return p?.eliminatedAt !== undefined && now - p.eliminatedAt < REELIMINATION_MS;
  };
  const fresh = frame.eliminations.filter(
    (e, i, all) =>
      !recentlyEliminated(e.victim) &&
      !recentDuplicate(e) &&
      all.findIndex((other) => sameName(other.victim, e.victim)) === i
  );

  // Killfeeden har nyeste linje nederst. Kommer flere nye i samme bilde,
  // røk den øverste først: gi den et litt tidligere tidspunkt, så den får
  // dårligst plassering.
  fresh.forEach((e, i) => {
    let pending = state.pending.find((p) => sameName(p.victim, e.victim));
    if (!pending) {
      pending = { ...e, firstAt: now - (fresh.length - i), sightings: 0 };
      state.pending.push(pending);
    }
    pending.sightings++;
    pending.certain ||= e.certain;
  });

  // Bekreft i den rekkefølgen linjene dukket opp.
  for (const pending of [...state.pending]) {
    const seenEnough = pending.certain || pending.sightings >= CONFIRM_SIGHTINGS;
    if (matchRunning && seenEnough && !recentlyEliminated(pending.victim)) {
      confirm(state, pending, now);
      state.pending = state.pending.filter((p) => p !== pending);
    }
  }
  state.pending = state.pending.filter((p) => now - p.firstAt < PENDING_TTL_MS);
  assignPlaces(state, now);
  mergePhantoms(state);
  state.eliminations.length = Math.min(state.eliminations.length, MAX_ELIMINATIONS);

  // Én spiller igjen: vinneren er den som tok siste kill, ellers den
  // arrangøren ser på (kameraet står på vinneren til slutt).
  if (state.playersLeft === 1 && !state.players.some((p) => p.placement === 1)) {
    const lastKiller = state.eliminations[0]?.killer;
    let winner = lastKiller ? findPlayer(state, lastKiller) : undefined;
    if ((!winner || winner.eliminated) && frame.spectatingName) {
      winner = getOrAddPlayer(state, frame.spectatingName);
    }
    if (winner && !winner.eliminated) winner.placement = 1;
  }

  state.updatedAt = now;
  state.spectating = frame.spectating;
  state.spectatingName = frame.spectatingName;
  state.raw = frame.raw;

  return save(state);
}
