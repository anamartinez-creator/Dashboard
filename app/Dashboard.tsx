"use client";

import { useEffect, useMemo, useState } from "react";
import type { Client, Engineer, LatestNote, Sow } from "@/lib/notion";
import AutoRefresh from "./AutoRefresh";
import { PILOT_DAYS, PILOT_STARTS } from "@/lib/pilots";
import { CLIENT_MEETINGS } from "@/lib/client-meetings";
import { computeClientHealth, sameClient, personFlag, PILOT_WARN_DAYS, type ClientHealth, type Light } from "@/lib/health";

type Props = { owner: string; notes: Record<string, LatestNote>; engineers: Engineer[]; sows: Sow[]; clients: Client[]; loadedAt: string; today: string };

const tone = (s: string) =>
  ({ "On track": "ok", Signed: "ok", "Needs Attention": "warn", Sent: "warn", "To confirm": "warn", "High Risk": "bad", Pending: "bad" } as Record<string, string>)[s] ?? "info";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

// "Nov 12, 2026" or, when people start on different days, "Nov 12, 2026 – Nov 30, 2026"
const range = (a: string | null, b: string | null) => {
  if (!a) return "—";
  if (!b || a === b) return fmtDate(a);
  return `${fmtDate(a)} – ${fmtDate(b)}`;
};

function Pill({ s, className }: { s: string; className?: string }) {
  return <span className={`pill ${className ?? tone(s)}`}>{s || "—"}</span>;
}

function NameLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function Dashboard({ owner, notes, engineers, sows, clients, loadedAt, today }: Props) {
  const mine = engineers;

  const counts = useMemo(() => {
    const c = { total: mine.length, onTrack: 0, attention: 0, highRisk: 0, onboarding: 0, noCadence: 0 };
    for (const e of mine) {
      if (e.status === "On track") c.onTrack++;
      else if (e.status === "Needs Attention") c.attention++;
      else if (e.status === "High Risk") c.highRisk++;
      else if (e.status === "New Hire" || e.status === "Hiring") c.onboarding++;
      if (!e.cadence) c.noCadence++;
    }
    return c;
  }, [mine]);

  const health = useMemo(() => computeClientHealth(clients, engineers, sows), [clients, engineers, sows]);

  // Active Client Health: filter by color, click a row for all reasons
  const [lightFilter, setLightFilter] = useState<Light | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Tabs: Overview (what needs action), Clients, People. The tab is kept in the URL hash.
  type Tab = "overview" | "clients" | "people";
  const [tab, setTabState] = useState<Tab>("overview");
  const setTab = (t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, "", t === "overview" ? window.location.pathname : `#${t}`);
  };
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h === "clients" || h === "people") setTabState(h);
  }, []);

  // Summary cards jump to their tab and section (client cards also set the color filter)
  const TAB_OF: Record<string, Tab> = { "sec-clients": "clients", "sec-followup": "people", "sec-team": "people" };
  const goTo = (id: string, light?: Light | null) => {
    if (light !== undefined) setLightFilter(light);
    setTab(TAB_OF[id] ?? "overview");
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  // Clients in pilot: status "Pilot" in Notion, or with people still in their 90 days.
  // Dates come from the people: first start and last end among those in pilot.
  const pilotClients = useMemo(() => {
    const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
    return health
      .map((h) => {
        const ppl = h.engineers.filter((e) => e.pilotTracked && e.startDate && e.pilotEnd);
        // Pilot client: status Pilot in Notion, or everyone on it is still in their 90 days
        const allNew = h.engineers.length > 0 && ppl.length === h.engineers.length;
        if (h.status !== "Pilot" && !allNew) return null;
        const starts = ppl.map((e) => e.startDate as string).sort();
        const ends = ppl.map((e) => e.pilotEnd as string).sort();
        let start = starts[0] ?? null, startLast = starts[starts.length - 1] ?? null;
        let end = ends[ends.length - 1] ?? null, endFirst = ends[0] ?? null;
        // A start date set by hand for the client wins over the people's dates
        const manual = Object.entries(PILOT_STARTS).find(([n]) => sameClient(n, h.name))?.[1];
        if (manual) {
          const d = new Date(manual + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + PILOT_DAYS);
          start = startLast = manual;
          end = endFirst = d.toISOString().slice(0, 10);
        }
        const notStarted = start !== null && dayDiff(today, start) > 0;
        const daysLeft = end ? dayDiff(today, end) : null;
        return { h, ppl, start, startLast, end, endFirst, notStarted, daysLeft, toStart: start ? dayDiff(today, start) : null };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (a.end ?? "9999").localeCompare(b.end ?? "9999") || a.h.name.localeCompare(b.h.name));
  }, [health, today]);

  // One row per client: health, people, last contact and why. Active clients first (red, yellow, green),
  // pilot clients after them (they are not counted in the health cards).
  const clientRows = useMemo(() => {
    const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
    const inPilot = new Set(pilotClients.map((p) => p.h.key));
    const rows = health.map((h) => {
      const m = CLIENT_MEETINGS.find((x) => sameClient(x.client, h.name)) ?? null;
      return { h, m, ago: m ? dayDiff(m.date, today) : null, pilot: inPilot.has(h.key), pilotInfo: pilotClients.find((x) => x.h.key === h.key) ?? null };
    });
    return [...rows.filter((r) => !r.pilot), ...rows.filter((r) => r.pilot).sort((a, b) => a.h.name.localeCompare(b.h.name))];
  }, [health, pilotClients, today]);

  // Clients in pilot have their own section; the health list is for the rest
  const shownHealth = useMemo(() => {
    const inPilot = new Set(pilotClients.map((p) => p.h.key));
    return health.filter((h) => !inPilot.has(h.key));
  }, [health, pilotClients]);

  const visibleRows = useMemo(() => clientRows.filter((r) => !lightFilter || (!r.pilot && r.h.light === lightFilter)), [clientRows, lightFilter]);

  const lights = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0 };
    for (const h of shownHealth) c[h.light]++;
    return c;
  }, [shownHealth]);

  const flags = useMemo(
    () =>
      mine
        .map(personFlag)
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .sort((a, b) => (a.level === b.level ? a.engineer.name.localeCompare(b.engineer.name) : a.level === "red" ? -1 : 1)),
    [mine]
  );

  // Clients that need follow-up: yellow or red health (alerts), or a known last contact over 30 days ago.
  // Clients with no meeting on record are not flagged for that alone: the meeting data is incomplete.
  const clientFlags = useMemo(() => {
    return clientRows
      .map((r) => {
        const reasons = r.h.reasons.filter((x) => x.level !== "info").map((x) => x.text);
        const stale = r.ago !== null && r.ago > 30;
        if (stale) reasons.push(`No client contact in ${r.ago} days`);
        const level: "red" | "yellow" | null = r.h.reasons.some((x) => x.level === "red") ? "red" : reasons.length ? "yellow" : null;
        return level ? { ...r, level, reasons } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((x, y) => (x.level === y.level ? (y.ago ?? -1) - (x.ago ?? -1) || x.h.name.localeCompare(y.h.name) : x.level === "red" ? -1 : 1));
  }, [clientRows]);
  const statusMix = useMemo(
    () => [
      { label: "On track", n: counts.onTrack, cls: "seg-ok" },
      { label: "Needs Attention", n: counts.attention, cls: "seg-warn" },
      { label: "High Risk", n: counts.highRisk, cls: "seg-bad" },
      { label: "Onboarding", n: counts.onboarding, cls: "seg-muted" },
    ],
    [counts]
  );

  const mixTotal = Math.max(1, statusMix.reduce((n, m) => n + m.n, 0));

  // Executive map: plain-language summary, quick questions, search and a side panel per client
  type Quick = "all" | "risk" | "attention" | "pilot" | "ending" | "new" | "stale";
  const [quick, setQuick] = useState<Quick>("all");
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenKey(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const QUICK_TEST: Record<Quick, (r: (typeof clientRows)[number]) => boolean> = {
    all: () => true,
    risk: (r) => r.h.light === "red",
    attention: (r) => r.h.light === "yellow",
    pilot: (r) => r.pilot,
    ending: (r) => r.pilotInfo?.daysLeft != null && r.pilotInfo.daysLeft <= PILOT_WARN_DAYS,
    new: (r) => r.h.engineers.some((e) => e.status === "New Hire" || e.status === "Hiring"),
    stale: (r) => r.ago !== null && r.ago > 30,
  };
  const QUICK_LABEL: [Quick, string][] = [["all", "All clients"], ["risk", "What's at risk?"], ["attention", "Needs attention"], ["pilot", "In pilot"], ["ending", "Pilots ending soon"], ["stale", "No recent contact"]];
  const mapRows = useMemo(() => {
    const sev = { red: 0, yellow: 1, green: 2 } as Record<Light, number>;
    const needle = q.trim().toLowerCase();
    return clientRows
      .filter((r) => QUICK_TEST[quick](r))
      .filter((r) => !needle || r.h.name.toLowerCase().includes(needle) || r.h.engineers.some((e) => e.name.toLowerCase().includes(needle)))
      .sort((a, b) => sev[a.h.light] - sev[b.h.light] || a.h.name.localeCompare(b.h.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientRows, quick, q]);
  const quickCount = (k: Quick) => clientRows.filter(QUICK_TEST[k]).length;
  const openRow = openKey ? clientRows.find((r) => r.h.key === openKey) ?? null : null;
  const endingSoon = pilotClients.filter((p) => p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= PILOT_WARN_DAYS);
  const headline =
    lights.red > 0 ? `${lights.red} ${lights.red === 1 ? "client is" : "clients are"} at risk`
    : lights.yellow > 0 ? `${lights.yellow} ${lights.yellow === 1 ? "client needs" : "clients need"} attention`
    : "All active clients are on track";

  const updated = new Date(loadedAt).toLocaleString("en-US", { timeZone: "America/Tegucigalpa", dateStyle: "medium", timeStyle: "short" });
  const recentComments = clientRows
    .filter((r) => r.m?.notes && r.ago !== null && r.ago <= 31)
    .sort((x, y) => (x.ago ?? 0) - (y.ago ?? 0));

  return (
    <>
      <div className="hero">
        <div className="hero-in">
          <div className="hero-top">
            <div>
              <p className="eyebrow">Puzzle · Service Delivery</p>
              <h1>Software Service Delivery Dashboard</h1>
            </div>
            <p className="owner">SDM: <b>{owner}</b><br />Updated {updated}</p>
          </div>
      <div className={`brief ${lights.red > 0 ? "is-bad" : lights.yellow > 0 ? "is-warn" : "is-ok"}`}>
        <div className="brief-main">
          <p className="brief-eyebrow">Today at a glance</p>
          <h2 className="brief-title">{headline}</h2>
        </div>
        <div className="brief-actions">
          <button type="button" onClick={() => { setTab("overview"); setQuick("attention"); setTimeout(() => document.querySelector(".map")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }}>See what needs attention</button>
          <button type="button" className="ghost" onClick={() => goTo("sec-followup")}>People follow-up →</button>
        </div>
      </div>

        </div>
      </div>

      <nav className="tabs" role="tablist" aria-label="Dashboard sections">
        <div className="tabs-in">
          {([["overview", "Overview"], ["clients", "Clients"], ["people", "People"]] as [Tab, string][]).map(([t, label]) => (
            <button type="button" key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>
      </nav>

      <main className="wrap" role="tabpanel">
        {tab === "overview" && (
          <>
            <section className="exec">
              <div className="ask">
                <span className="ask-label">Quick questions</span>
                {QUICK_LABEL.map(([k, label]) => (
                  <button type="button" key={k} className={`chip big${quick === k ? " on" : ""}`} aria-pressed={quick === k} onClick={() => setQuick(k)}>
                    {label} <em>{quickCount(k)}</em>
                  </button>
                ))}
                <input className="map-search" type="search" placeholder="Search a client or person…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients or people" />
              </div>

              {quick === "all" && (
              <div className="groups-map">
                {(() => {
                  const groups: { key: string; label: string; rows: typeof mapRows }[] = [
                    { key: "bad", label: "High Risk", rows: mapRows.filter((r) => !r.pilot && r.h.light === "red") },
                    { key: "warn", label: "Needs Attention", rows: mapRows.filter((r) => !r.pilot && r.h.light === "yellow") },
                    { key: "pilot", label: "Pilot", rows: mapRows.filter((r) => r.pilot) },
                    { key: "ok", label: "On track", rows: mapRows.filter((r) => !r.pilot && r.h.light === "green") },
                  ];
                  return groups.filter((g) => g.rows.length > 0).map((g) => (
                    <div className="mgroup" key={g.key}>
                      <h3 className={`mgroup-h mg-${g.key}`}>{g.label}<span>{g.rows.length}</span></h3>
                      <div className="map" role="list">
                        {g.rows.map((r) => {
                  const pi = r.pilotInfo;
                          const sub = pi
                            ? pi.notStarted ? `Pilot starts ${fmtDate(pi.start)}` : pi.daysLeft === null ? "Pilot" : pi.daysLeft < 0 ? "Pilot period ended" : `Pilot · ${pi.daysLeft} days left`
                            : r.ago !== null ? `Last contact ${r.ago === 0 ? "today" : `${r.ago} days ago`}` : "No contact on record";
                          const n = headcount(r.h);
                          return (
                            <button type="button" role="listitem" key={r.h.key} className={`tile tile-${LIGHT_CLASS[r.h.light]}${openKey === r.h.key ? " open" : ""}`} onClick={() => setOpenKey(r.h.key)}>
                              <span className="tile-top"><LightPill light={r.h.light} />{r.pilot && <span className="tag">Pilot</span>}</span>
                              <span className="tile-name">{r.h.name}</span>
                              <span className="tile-meta"><b>{n || "—"}</b> {n === 1 ? "person" : "people"}</span>
                              <span className="tile-sub">{sub}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
              )}
              {quick !== "all" && mapRows.length === 0 && <p className="muted">No clients match this question.</p>}
            </section>


            {quick !== "all" && mapRows.length > 0 && (
              <section className="needs-detail">
                <h2>{QUICK_LABEL.find(([k]) => k === quick)?.[1]} · details</h2>
                <div className="detail-list">
                  {mapRows.map((r) => {
                    const why = r.h.reasons.filter((x) => x.level !== "info");
                    const staleTxt = r.ago !== null && r.ago > 30 ? `No client contact in ${r.ago} days` : null;
                    return (
                      <article key={r.h.key} className={`detail tile-${LIGHT_CLASS[r.h.light]}`}>
                        <header>
                          <h3>{r.h.url ? <NameLink href={r.h.url}>{r.h.name}</NameLink> : r.h.name}</h3>
                          <span className="muted">{headcount(r.h) || "—"} people{r.pilotInfo ? ` · Pilot ${range(r.pilotInfo.start, r.pilotInfo.end)}` : ""}</span>
                          <button type="button" className="more" onClick={() => setOpenKey(r.h.key)}>Full detail →</button>
                        </header>
                        {r.pilotInfo && (() => {
                          const pi = r.pilotInfo;
                          const pct = pi.daysLeft === null || pi.notStarted ? 0 : Math.max(0, Math.min(100, ((PILOT_DAYS - pi.daysLeft) / PILOT_DAYS) * 100));
                          return (
                            <div className="detail-pilot">
                              <div className="detail-pilot-row"><PilotTag p={pi} /><span className="muted">{range(pi.start, pi.end)}</span></div>
                              <div className="pilot-track" role="img" aria-label={`${Math.round(pct)}% of the pilot elapsed`}><span style={{ width: `${pct}%` }} /></div>
                              {r.h.engineers.length > 0 && <p className="ov-sub">{[...r.h.engineers].sort((a, b) => a.name.localeCompare(b.name)).map((e) => e.name).join(", ")}</p>}
                            </div>
                          );
                        })()}
                        <ul className="reasons">
                          {why.map((x, i) => <li key={i} className={`r-${x.level}`}>{x.text}</li>)}
                          {staleTxt && <li className="r-yellow">{staleTxt}</li>}
                          {why.length === 0 && !staleTxt && <li className="r-info">Nothing flagged.</li>}
                        </ul>
                        {r.m?.notes && r.ago !== null && r.ago <= 31 && <div className="note"><span className="note-head">Latest comment · {fmtDate(r.m.date)}</span><p>{r.m.notes.comment}</p></div>}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {openRow && (
              <>
                <div className="scrim" onClick={() => setOpenKey(null)} />
                <aside className="drawer" role="dialog" aria-modal="true" aria-label={openRow.h.name}>
                  <button type="button" className="drawer-x" onClick={() => setOpenKey(null)} aria-label="Close">×</button>
                  <p className="brief-eyebrow">{LIGHT_LABEL[openRow.h.light]}{openRow.pilot ? " · Pilot" : ""}</p>
                  <h3 className="drawer-title">{openRow.h.url ? <NameLink href={openRow.h.url}>{openRow.h.name}</NameLink> : openRow.h.name}</h3>
                  <div className="drawer-stats">
                    <div><b>{headcount(openRow.h) || "—"}</b><span>People</span></div>
                    <div><b>{openRow.ago === null ? "—" : openRow.ago}</b><span>Days since contact</span></div>
                    {openRow.pilotInfo && <div><b>{openRow.pilotInfo.daysLeft === null ? "—" : Math.max(0, openRow.pilotInfo.daysLeft)}</b><span>Pilot days left</span></div>}
                  </div>
                  {openRow.pilotInfo && <p className="drawer-line"><span>Pilot period</span>{range(openRow.pilotInfo.start, openRow.pilotInfo.end)}</p>}
                  {openRow.m && <p className="drawer-line"><span>Last contact</span>{fmtDate(openRow.m.date)}</p>}
                  {openRow.m?.notes && openRow.ago !== null && openRow.ago <= 31 && (
                    <div className="note"><span className="note-head">Latest comment</span><p>{openRow.m.notes.comment}</p></div>
                  )}
                  {openRow.h.reasons.some((x) => x.level !== "info") && (
                    <>
                      <h4>Why</h4>
                      <ul className="reasons">
                        {openRow.h.reasons.filter((x) => x.level !== "info").map((x, i) => <li key={i} className={`r-${x.level}`}>{x.text}</li>)}
                      </ul>
                    </>
                  )}
                  <h4>People</h4>
                  {openRow.h.engineers.length === 0 && <p className="muted">No people listed in Notion for this client.</p>}
                  <ul className="pc-list">
                    {[...openRow.h.engineers].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                      <li key={e.id}>
                        <span className="avatar" aria-hidden="true">{e.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
                        <span className="who"><NameLink href={e.url}>{e.name}</NameLink><small>{e.role || "—"}</small></span>
                        <Pill s={e.status} />
                      </li>
                    ))}
                  </ul>
                </aside>
              </>
            )}


            {quick === "all" && recentComments.length > 0 && (
              <section>
                <h2>Latest client comments</h2>
                <div className="comment-cards">
                  {recentComments.map((r) => (
                    <div className="note comment-card" key={r.h.key}>
                      <span className="note-head"><b>{r.h.name}</b> · {fmtDate(r.m!.date)}</span>
                      <p>{r.m!.notes!.comment}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {tab === "clients" && (
          <>
      <section id="sec-clients">
        <h2>Clients</h2>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Client</th><th className="center">Status</th><th className="center">People</th></tr>
            </thead>
            <tbody>
              {clientRows.length === 0 && <EmptyRow cols={3} text="No clients on your team." />}
              {clientRows.map(({ h, pilot }) => (
                <tr key={h.key}>
                  <td>{h.url ? <NameLink href={h.url}>{h.name}</NameLink> : h.name}</td>
                  <td className="center">{pilot ? <Pill s="Pilot" className="info" /> : <Pill s={LIGHT_LABEL[h.light]} className={LIGHT_CLASS[h.light]} />}</td>
                  <td className="center">{headcount(h) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
          </>
        )}

        {tab === "people" && (
          <>
      <section id="sec-team">
        <h2>Team health</h2>
        <p className="hint">Your team only. People on two clients are counted once.</p>
        <div className="legend">
          {statusMix.map((m) => (
            <span key={m.label}><i className={m.cls} />{m.label} ({m.n})</span>
          ))}
        </div>
        <div className="mix" role="img" aria-label={"Team status: " + statusMix.map((m) => `${m.label} ${m.n}`).join(", ")}>
          {statusMix.filter((m) => m.n > 0).map((m) => (
            <span key={m.label} className={m.cls} style={{ flex: m.n / mixTotal }} title={`${m.label}: ${m.n}`} />
          ))}
        </div>
      </section>

      <section id="sec-followup">
        <h2>People who need follow-up</h2>
        <div className="tw">
          <table>
            <thead>
              <tr><th className="center">Person</th><th className="center">Priority</th><th className="center">Client</th><th className="center">SDM</th><th>Reasons</th></tr>
            </thead>
            <tbody>
              {flags.length === 0 && <EmptyRow cols={5} text="Nobody needs follow-up." />}
              {flags.map((f) => (
                <tr key={f.engineer.id}>
                  <td className="center"><NameLink href={f.engineer.url}>{f.engineer.name}</NameLink></td>
                  <td className="center"><Pill s={f.level === "red" ? "High" : "Medium"} className={f.level === "red" ? "bad" : "warn"} /></td>
                  <td className="center">{f.engineer.clients.join(", ") || "—"}</td>
                  <td className="center muted">{f.engineer.sdms.join(", ") || "—"}</td>
                  <td className="wide">
                    {f.reasons.join(" · ")}
                    {notes[f.engineer.id] && (
                      <div className="note">
                        <span className="note-head">
                          Last 1:1{notes[f.engineer.id].date ? ` · ${fmtDate(notes[f.engineer.id].date)}` : ""}
                          {notes[f.engineer.id].health ? ` · ${notes[f.engineer.id].health}` : ""}
                        </span>
                        {notes[f.engineer.id].comment && <p>{notes[f.engineer.id].comment}</p>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
          </>
        )}

        <footer className="foot">
          Updated {updated}
          {" · "}refreshes automatically every minute · <AutoRefresh />
        </footer>
      </main>
    </>
  );
}

function Kpi({ label, value, sub, flag, onClick }: { label: string; value: number | string; sub: string; flag?: "warn" | "bad"; onClick?: () => void }) {
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-num">{value}</span>
      <span className="kpi-sub">{sub}</span>
    </>
  );
  const cls = `kpi ${flag ? "is-" + flag : ""}`;
  return onClick ? (
    <button type="button" className={`${cls} kpi-link`} onClick={onClick} title="Click to see the details">{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// People on the client: the engineers found in Notion, else the headcount typed on the client page
const headcount = (h: ClientHealth) => h.engineers.length || h.headcount || 0;

// "88 d left", "Starts in 3 d", "Ended 5 d ago"
function PilotTag({ p }: { p: { daysLeft: number | null; notStarted: boolean; toStart: number | null } }) {
  if (p.daysLeft === null) return <Pill s="No dates" className="info" />;
  if (p.notStarted) return <Pill s={`Starts in ${p.toStart} d`} className="info" />;
  if (p.daysLeft < 0) return <Pill s={`Ended ${-p.daysLeft} d ago`} className="bad" />;
  return <Pill s={`${p.daysLeft} d left`} className={p.daysLeft <= PILOT_WARN_DAYS ? "warn" : "ok"} />;
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="empty">{text}</td>
    </tr>
  );
}

const LIGHT_LABEL: Record<Light, string> = { green: "On track", yellow: "Needs Attention", red: "High Risk" };
const LIGHT_CLASS: Record<Light, string> = { green: "ok", yellow: "warn", red: "bad" };

function LightPill({ light }: { light: Light }) {
  // Color only; the name goes in aria-label and the tooltip for screen readers
  return <span className={`dot seg-${LIGHT_CLASS[light]}`} role="img" aria-label={LIGHT_LABEL[light]} title={LIGHT_LABEL[light]} />;
}
