"use client";

import { useState } from "react";
import { isDisqualified } from "@/lib/names";
import { playerPoints, standings, type PlayerResult } from "@/lib/scoring";
import { useBontora } from "@/lib/useBontora";

// Kontrollpanel for arrangøren. Viser cup-tavla, pågående kamp og rå OCR.
export default function DashboardPage() {
  const { state, online, polledAt } = useBontora();

  const secondsSinceUpdate =
    state?.updatedAt && polledAt
      ? Math.round((polledAt - state.updatedAt) / 1000)
      : null;
  const eyesAlive = secondsSinceUpdate !== null && secondsSinceUpdate < 10;

  const dq = state?.disqualified ?? [];
  const table = state
    ? standings([...state.matches.map((m) => m.players), state.players], dq)
    : [];
  // Spillere som fortsatt er med øverst, deretter etter plassering.
  const current = (state?.players ?? [])
    .filter((p) => !isDisqualified(p.name, dq))
    .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || b.kills - a.kills);
  const feed = (state?.eliminations ?? []).filter(
    (e) => !isDisqualified(e.killer, dq) && !isDisqualified(e.victim, dq)
  );
  // Plass 1–10 gir poeng. Varsle om plasser som er "brukt opp" (færre
  // spillere igjen) uten at noen har fått dem.
  const taken = new Set(current.map((p) => p.placement));
  const left = state?.playersLeft ?? null;
  const missingTop10 =
    left === null
      ? []
      : Array.from({ length: 10 }, (_, i) => i + 1).filter(
          (p) => !taken.has(p) && (p > left || (left <= 1 && p === 1))
        );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Bontora Cup – Poeng-Teller</h1>
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
        <Card label="Spillere igjen">{state?.playersLeft ?? "–"}</Card>
        <Card label="Kamp nr.">{(state?.matches.length ?? 0) + 1}</Card>
        <Card label="Modus">
          <span className="text-xl">
            {!state?.updatedAt
              ? "Venter på data"
              : state.spectating
                ? `Ser på ${state.spectatingName ?? "?"}`
                : "Ikke tilskuer"}
          </span>
        </Card>
      </section>

      {missingTop10.length > 0 && (
        <p className="rounded bg-yellow-900/70 px-4 py-3 text-sm text-yellow-100">
          <b>Mangler plassering:</b> ingen har fått plass {missingTop10.join(", ")}. Disse gir
          poeng – finn spilleren i «Denne kampen» og skriv inn plasseringen før du lagrer kampen.
        </p>
      )}

      <section className="flex flex-wrap gap-2">
        <ConfirmButton
          label="Kamp ferdig → ny kamp"
          confirmLabel="Ja, lagre kampen og start ny"
          className="bg-indigo-600"
          onConfirm={() => fetch("/api/bontora/match", { method: "POST" })}
        />
        <ConfirmButton
          label="Nullstill cup"
          confirmLabel="Ja, slett alle kamper og poeng"
          className="bg-zinc-700"
          onConfirm={() => fetch("/api/bontora", { method: "DELETE" })}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Sammenlagt</h2>
        <TableBox>
          <thead className="text-left text-zinc-400">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Spiller</th>
              <th className="p-2">Kamper</th>
              <th className="p-2">Seiere</th>
              <th className="p-2">Kills</th>
              <th className="p-2">Poeng</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {table.length ? (
              table.map((s, i) => (
                <tr key={s.name} className="border-t border-zinc-800">
                  <td className="p-2 text-zinc-400">{i + 1}</td>
                  <td className="p-2 font-medium">{s.name}</td>
                  <td className="p-2">{s.matches}</td>
                  <td className="p-2">{s.wins}</td>
                  <td className="p-2">{s.kills}</td>
                  <td className="p-2 text-lg font-bold">{s.points}</td>
                  <td className="p-2 text-right"><DiskButton name={s.name} /></td>
                </tr>
              ))
            ) : (
              <tr><td className="p-2 text-zinc-500" colSpan={7}>Ingen poeng ennå</td></tr>
            )}
          </tbody>
        </TableBox>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Denne kampen ({current.length} spillere)</h2>
        <TableBox>
          <thead className="text-left text-zinc-400">
            <tr>
              <th className="p-2">Spiller</th>
              <th className="p-2">Kills</th>
              <th className="p-2">Plassering</th>
              <th className="p-2">Poeng</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {current.map((p) => (
              <tr key={p.name} className="border-t border-zinc-800">
                <td className="p-2 font-medium">
                  {p.name}
                  {!p.eliminated && <span className="ml-2 text-xs text-green-400">med</span>}
                </td>
                <td className="p-2"><EditableNumber player={p} field="kills" /></td>
                <td className="p-2"><EditableNumber player={p} field="placement" /></td>
                <td className="p-2 font-bold">{playerPoints(p)}</td>
                <td className="p-2 text-right"><DiskButton name={p.name} /></td>
              </tr>
            ))}
            <tr className="border-t border-zinc-800">
              <td className="p-2" colSpan={5}><AddPlayer /></td>
            </tr>
          </tbody>
        </TableBox>
        <p className="text-xs text-zinc-500">
          Klikk på et tall for å rette det. Tøm plassering for «ukjent».
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Killfeed denne kampen ({feed.length})</h2>
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded bg-zinc-900 p-3 text-sm">
          {feed.length ? (
            feed.map((e) => (
              <li key={e.id} className="flex justify-between gap-4">
                <span className="flex flex-wrap items-center gap-x-1.5">
                  {e.killer ?? "?"}
                  {e.killer && <DiskButton name={e.killer} />}
                  <span className="text-zinc-500">{e.verb}</span>
                  <span className="text-red-400">{e.victim}</span>
                  <DiskButton name={e.victim} />
                </span>
                <time className="text-zinc-500">{new Date(e.at).toLocaleTimeString()}</time>
              </li>
            ))
          ) : (
            <li className="text-zinc-500">Ingen ennå</li>
          )}
        </ul>
      </section>

      {dq.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Diskvalifiserte ({dq.length})</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {dq.map((name) => (
              <li key={name} className="flex items-center gap-2 rounded bg-red-950 px-3 py-1">
                <span className="line-through">{name}</span>
                <button
                  onClick={() => sendDisk("DELETE", name)}
                  className="text-xs text-red-300 underline"
                >
                  Angre
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

function patchPlayer(body: { name: string; kills?: number; placement?: number | null }) {
  return fetch("/api/bontora", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Tall i kamptabellen som kan rettes for hånd. */
function EditableNumber({ player, field }: { player: PlayerResult; field: "kills" | "placement" }) {
  const value = player[field];

  async function submit(input: HTMLInputElement) {
    const text = input.value.trim();
    const next = text === "" ? null : Number(text);
    const invalid =
      (next !== null && !Number.isInteger(next)) || (field === "kills" && next === null);
    if (invalid) {
      input.value = value === null ? "" : String(value);
      return;
    }
    if (next !== value) await patchPlayer({ name: player.name, [field]: next });
  }

  return (
    <input
      // Ny key når verdien endres, så feltet oppdateres uten å avbryte skriving.
      key={value ?? "tom"}
      defaultValue={value ?? ""}
      placeholder="–"
      inputMode="numeric"
      className="w-16 rounded bg-transparent px-1 tabular-nums outline-none hover:bg-zinc-800 focus:bg-zinc-800"
      onBlur={(e) => submit(e.currentTarget)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/** For spillere killfeeden ikke fanget opp, f.eks. en vinner uten kills. */
function AddPlayer() {
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("name") as HTMLInputElement;
        const name = input.value.trim();
        if (!name) return;
        await patchPlayer({ name, kills: 0 });
        input.value = "";
      }}
    >
      <input
        name="name"
        placeholder="Legg til spiller som mangler…"
        className="flex-1 rounded bg-zinc-800 px-2 py-1 text-sm outline-none"
      />
      <button className="rounded bg-zinc-700 px-3 py-1 text-sm">Legg til</button>
    </form>
  );
}

function sendDisk(method: "POST" | "DELETE", name: string) {
  return fetch("/api/bontora/disqualify", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

/** Diskvalifiserer en spiller. Første klikk spør, andre klikk disker. */
function DiskButton({ name }: { name: string }) {
  const [asking, setAsking] = useState(false);

  return (
    <button
      onClick={() => (asking ? sendDisk("POST", name) : setAsking(true))}
      onBlur={() => setAsking(false)}
      title={`Diskvalifiser ${name}`}
      className={`rounded px-1.5 text-[10px] font-bold uppercase ${
        asking ? "bg-red-600 text-white" : "bg-zinc-800 text-red-400 hover:bg-zinc-700"
      }`}
    >
      {asking ? "Sikker?" : "Disk"}
    </button>
  );
}

function ConfirmButton({
  label,
  confirmLabel,
  className,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  className: string;
  onConfirm: () => Promise<unknown>;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button onClick={() => setAsking(true)} className={`rounded px-3 py-2 text-sm ${className}`}>
        {label}
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <button
        onClick={async () => {
          await onConfirm();
          setAsking(false);
        }}
        className="rounded bg-red-600 px-3 py-2 text-sm"
      >
        {confirmLabel}
      </button>
      <button onClick={() => setAsking(false)} className="rounded bg-zinc-800 px-3 py-2 text-sm">
        Avbryt
      </button>
    </div>
  );
}

function TableBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded bg-zinc-900">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="truncate text-3xl font-bold tabular-nums">{children}</div>
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
