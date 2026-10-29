"use client";

import { useBontora } from "@/lib/useBontora";

// Legges inn i OBS som Browser Source: http://localhost:3000/overlay
// Bakgrunnen er gjennomsiktig, så bare boksene vises over spillet.
export default function OverlayPage() {
  const { state } = useBontora();
  if (!state?.updatedAt) return null;

  const recent = state.eliminations.slice(0, 5);

  return (
    <main className="flex flex-col gap-3 p-6 text-white">
      <div className="flex gap-3">
        <Stat label="Spillere igjen" value={state.playersLeft} />
        <Stat label="Kills" value={state.kills} />
      </div>

      {state.spectating && (
        <div className="w-fit rounded-md bg-black/70 px-3 py-1 text-sm">
          Ser på: <b>{state.spectatingName ?? "ukjent"}</b>
        </div>
      )}

      {recent.length > 0 && (
        <ul className="flex w-fit flex-col gap-1 rounded-md bg-black/70 px-3 py-2 text-sm">
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
    <div className="min-w-32 rounded-md bg-black/70 px-4 py-2">
      <div className="text-xs uppercase tracking-wide text-white/70">{label}</div>
      <div className="text-4xl font-bold tabular-nums">{value ?? "–"}</div>
    </div>
  );
}
