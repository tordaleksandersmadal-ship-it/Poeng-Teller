"use client";

import { useEffect, useState } from "react";
import type { BontoraState } from "./state";

/** Henter kampstatus fra API-et med jevne mellomrom. */
export function useBontora(intervalMs = 1000) {
  const [state, setState] = useState<BontoraState | null>(null);
  const [online, setOnline] = useState(true);
  const [polledAt, setPolledAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/bontora", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as BontoraState;
        if (!cancelled) {
          setState(data);
          setOnline(true);
          setPolledAt(Date.now());
        }
      } catch {
        if (!cancelled) setOnline(false);
      }
    }

    poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { state, online, polledAt };
}
