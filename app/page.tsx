"use client";

import { useState } from "react";
import { useBontora } from "@/lib/useBontora";

// Kontrollpanel for den som styrer sendingen. Viser rå OCR for feilsøking.
export default function DashboardPage() {
  const { state, online, polledAt } = useBontora();
  const [confirmReset, setConfirmReset] = useState(false);

  const secondsSinceUpdate =
    state?.updatedAt && polledAt
      ? Math.round((polledAt - state.updatedAt) / 1000)
    : null;
  const eyesAlive = secondsSinceUpdate !== null && secondsSinceUpdate < 10;

  async function reset() {
    await fetch("/api/bontora", { method: "DELETE" });
    setConfirmReset(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Bontora Poeng-Teller</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge ok={online}>{online ? "Server OK" : "Server nede"}</Badge>
          <Badge ok={eyesAlive}>
            {secondsSinceUpdate === null
              ? "Auto-eyes ikke startet"
              : eyesAlive
                ? "Auto-eyes kjører"
                : `Auto-eyes stille i ${secondsSinceUpdate}s`}
          </Badge>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card label="Spillere igjen" value={state?.playersLeft} />
        <Card label="Kills" value={state?.kills} />
        <Card
          label="Modus"
          value={state?.spectating ? `Tilskuer: ${state.spectatingName ?? "?"}` : "Spiller"}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Elimineringer ({state?.eliminations.length ?? 0})
          </h2>
          {confirmReset ? (
            <div className="flex gap-2">
              <button onClick={reset} className="rounded bg-red-600 px-3 py-1 text-sm">
                Ja, nullstill
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="rounded bg-zinc-700 px-3 py-1 text-sm"
              >
                Avbryt
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="rounded bg-zinc-700 px-3 py-1 text-sm"
            >
              Ny kamp
            </button>
          )}
        </div>
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded bg-zinc-900 p-3 text-sm">
          {state?.eliminations.length ? (
            state.eliminations.map((e) => (
              <li key={e.id} className="flex justify-between gap-4">
                <span>
                  {e.killer ?? "?"} <span className="text-zinc-500">{e.verb}</span>{" "}
                  <span className="text-red-400">{e.victim}</span>
                </span>
                <time className="text-zinc-500">{new Date(e.at).toLocaleTimeString()}</time>
              </li>
            ))
          ) : (
            <li className="text-zinc-500">Ingen ennå</li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Rå OCR (feilsøking)</h2>
        <pre className="overflow-x-auto rounded bg-zinc-900 p-3 text-xs text-zinc-400">
          {state?.raw ? JSON.stringify(state.raw, null, 2) : "Ingen data ennå"}
        </pre>
      </section>

      <p className="text-sm text-zinc-500">
        OBS-overlay: <code>/overlay</code> — legg inn som Browser Source.
      </p>
    </main>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="truncate text-3xl font-bold tabular-nums">{value ?? "–"}</div>
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-3 py-1 ${ok ? "bg-green-900 text-green-200" : "bg-red-900 text-red-200"}`}>
      {children}
    </span>
  );
}
