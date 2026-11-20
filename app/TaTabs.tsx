"use client";

import { useEffect, useState, type ReactNode } from "react";

export type TaTab = { id: string; label: string; node: ReactNode };

// Tabs for Talent Acquisition. The first tab opens by default; the tab is kept in the URL hash.
export default function TaTabs({ tabs, footer }: { tabs: TaTab[]; footer: ReactNode }) {
  const [tab, setTab] = useState(tabs[0]?.id ?? "");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (tabs.some((t) => t.id === h)) setTab(h);
  }, [tabs]);
  const pick = (id: string) => {
    setTab(id);
    window.history.replaceState(null, "", id === tabs[0]?.id ? window.location.pathname : `#${id}`);
  };
  return (
    <>
      <nav className="tabs" role="tablist" aria-label="Talent Acquisition sections">
        <div className="tabs-in">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? " on" : ""}`} onClick={() => pick(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <main className="ta">
        {tabs.map((t) => (
          <div key={t.id} role="tabpanel" hidden={tab !== t.id} className="ta-panel">{t.node}</div>
        ))}
        {footer}
      </main>
    </>
  );
}
