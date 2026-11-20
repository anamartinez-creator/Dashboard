"use client";

import { useState } from "react";

export type WeekCard = { label: string; n: number | string; note: string; rows: { a: string; b: string; c: string }[] };

// Four equal cards in a 2x2 block. Clicking one with details shows them in a panel to the right.
export default function WeekCards({ cards }: { cards: WeekCard[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const open = cards.find((c) => c.label === sel) ?? null;
  return (
    <div className="wc">
      <div className="wc-grid">
        {cards.map((c) => {
          const clickable = c.rows.length > 0;
          const body = (
            <>
              <b>{c.n}</b>
              <span>{c.label}</span>
              {c.note && <small>{c.note}</small>}
              {clickable && <em className="wc-hint">Click for details</em>}
            </>
          );
          return clickable ? (
            <button type="button" key={c.label} className={`wc-card wc-click${sel === c.label ? " on" : ""}`} aria-pressed={sel === c.label} onClick={() => setSel(sel === c.label ? null : c.label)}>
              {body}
            </button>
          ) : (
            <div key={c.label} className="wc-card">{body}</div>
          );
        })}
      </div>
      <div className={`wc-panel${open ? " on" : ""}`}>
        {open ? (
          <>
            <div className="wc-panel-head">
              <h3>{open.label}</h3>
              <button type="button" className="wc-x" aria-label="Close details" onClick={() => setSel(null)}>×</button>
            </div>
            <ul>
              {open.rows.map((r, i) => (
                <li key={i}><span className="pn">{r.a}</span><span className="pr">{r.b}</span><span className="pd">{r.c}</span></li>
              ))}
            </ul>
          </>
        ) : (
          <p className="wc-empty">Click <b>Roles opened</b> or <b>Pending to start</b> to see the details here.</p>
        )}
      </div>
    </div>
  );
}
