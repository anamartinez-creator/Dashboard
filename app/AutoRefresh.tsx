"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const EVERY_MS = 60_000;

// Keeps the dashboard in sync with Notion: re-reads the data every minute while
// the tab is visible, when the tab comes back into focus, and on demand.
export default function AutoRefresh({ scope = "/" }: { scope?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (force: boolean) => {
    setBusy(true);
    try {
      if (force) await fetch("/api/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
      router.refresh();
    } finally {
      setTimeout(() => setBusy(false), 800);
    }
  }, [router, scope]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, EVERY_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  return (
    <button type="button" className="refresh" onClick={() => refresh(true)} disabled={busy}>
      {busy ? "Refreshing…" : "Refresh now"}
    </button>
  );
}
