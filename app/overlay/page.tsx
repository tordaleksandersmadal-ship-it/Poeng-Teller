"use client";

import { isDisqualified } from "@/lib/names";
import { standings } from "@/lib/scoring";
import { useBontora } from "@/lib/useBontora";

const TOP = 10;

// Legges inn i OBS som Browser Source: http://localhost:3000/overlay
// Bakgrunnen er gjennomsiktig, så bare boksene vises over spillet.
export default function OverlayPage() {
  const { state } = useBontora();
  if (!state?.updatedAt && !state?.matches.length) return null;

  const dq = state.disqualified;
  const table = standings([...state.matches.map((m) => m.players), state.players], dq).slice(0, TOP);
  const recent = state.eliminations
    .filter((e) => !isDisqualified(e.killer, dq) && !isDisqualified(e.victim, dq))
    .slice(0, 5);

  return (
    <main className="flex w-fit flex-col gap-3 p-6 text-white">
      <div className="flex gap-3">
        <Stat label="Spillere igjen" value={state.playersLeft} />
        <Stat label="Kamp" value={state.matches.length + 1} />
      </div>

      {table.length > 0 && (
        <table className="rounded-md bg-black/70 text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-white/60">
            <tr>
              <th className="px-3 pt-2">#</th>
              <th className="px-3 pt-2">Spiller</th>
              <th className="px-3 pt-2 text-right">Kills</th>
              <th className="px-3 pt-2 text-right">Poeng</th>
            </tr>
          </thead>
          <tbody>
            {table.map((s, i) => (
              <tr key={s.name} className={i === 0 ? "text-yellow-300" : undefined}>
                <td className="px-3 py-0.5 text-white/60">{i + 1}</td>
                <td className="max-w-48 truncate px-3 py-0.5 font-medium">{s.name}</td>
                <td className="px-3 py-0.5 text-right tabular-nums">{s.kills}</td>
                <td className="px-3 py-0.5 text-right text-base font-bold tabular-nums">{s.points}</td>
              </tr>
            ))}
            <tr><td className="pb-2" colSpan={4}></td></tr>
          </tbody>
        </table>
      )}

      {recent.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md bg-black/70 px-3 py-2 text-sm">
          {recent.map((e) => (
            <li key={e.id}>
              {e.killer ?? "?"} <span className="text-white/60">{e.verb}</span>{" "}
              <span className="text-red-400">{e.victim}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-28 rounded-md bg-black/70 px-4 py-2">
      <div className="text-xs uppercase tracking-wide text-white/70">{label}</div>
      <div className="text-4xl font-bold tabular-nums">{value ?? "–"}</div>
    </div>
  );
}
