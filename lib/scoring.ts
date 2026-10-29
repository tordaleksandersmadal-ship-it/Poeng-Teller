// Poengregler og sammenlagt-tabell. Brukes både på serveren og i nettleseren.

import { isDisqualified, sameName } from "./names";

export const POINTS_PER_KILL = 5;

export type PlayerResult = {
  name: string;
  kills: number;
  placement: number | null;
  /** Har dukket opp som offer i killfeeden denne kampen. */
  eliminated: boolean;
  /** Når offer-linjen ble sett (ms). */
  eliminatedAt?: number;
  /** Skrivemåter OCR har lest for denne spilleren, med antall. */
  spellings?: Record<string, number>;
};

export type MatchResult = {
  endedAt: number;
  players: PlayerResult[];
};

export type Standing = {
  name: string;
  matches: number;
  kills: number;
  wins: number;
  points: number;
};

/** 1. plass = 10, 2. plass = 9 … 10. plass = 1, 11. plass og dårligere = 0. */
export function placementPoints(placement: number | null): number {
  if (!placement || placement < 1) return 0;
  return Math.max(0, 11 - placement);
}

export function playerPoints(p: Pick<PlayerResult, "kills" | "placement">): number {
  return p.kills * POINTS_PER_KILL + placementPoints(p.placement);
}

/** Sammenlagt for alle kamper (inkl. pågående), sortert etter poeng. Disket spillere tas ut. */
export function standings(matches: PlayerResult[][], disqualified: string[]): Standing[] {
  const table: Standing[] = [];
  for (const players of matches) {
    for (const p of players) {
      if (isDisqualified(p.name, disqualified)) continue;
      let row = table.find((s) => sameName(s.name, p.name));
      if (!row) table.push((row = { name: p.name, matches: 0, kills: 0, wins: 0, points: 0 }));
      row.matches++;
      row.kills += p.kills;
      row.wins += p.placement === 1 ? 1 : 0;
      row.points += playerPoints(p);
    }
  }
  return table.sort((a, b) => b.points - a.points || b.wins - a.wins || b.kills - a.kills);
}
