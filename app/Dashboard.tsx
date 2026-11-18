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
  const TAB_OF: Record<string, Tab> = { "sec-clients": "clients", "sec-pilot": "clients", "sec-client-followup": "clients", "sec-followup": "people", "sec-team": "people", "sec-people-client": "people" };
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
          <div className="hero-groups">
            <div>
              <div className="group-label">Clients</div>
              <div className="kpis">
                <Kpi label="On track" value={lights.green} sub="Clients" onClick={() => goTo("sec-clients", "green")} />
                <Kpi label="Needs Attention" value={lights.yellow} sub="Clients" flag={lights.yellow > 0 ? "warn" : undefined} onClick={() => goTo("sec-clients", "yellow")} />
                <Kpi label="High Risk" value={lights.red} sub="Clients" flag={lights.red > 0 ? "bad" : undefined} onClick={() => goTo("sec-clients", "red")} />
                <Kpi label="Pilot" value={pilotClients.length} sub="Clients" onClick={() => goTo("sec-pilot")} />
              </div>
            </div>
            <div>
              <div className="group-label">People</div>
              <div className="kpis">
                <Kpi label="Total" value={counts.total} sub="People" onClick={() => goTo("sec-team")} />
                <Kpi label="Needs Attention" value={counts.attention} sub="People" flag={counts.attention > 0 ? "warn" : undefined} onClick={() => goTo("sec-followup")} />
                <Kpi label="High Risk" value={counts.highRisk} sub="People" flag={counts.highRisk > 0 ? "bad" : undefined} onClick={() => goTo("sec-followup")} />
              </div>
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
            <section>
              <h2>Needs action</h2>
              <div className="ov-grid">
                <div className="ov-card">
                  <div className="ov-head"><h3>Clients</h3><span className="count">{clientFlags.length}</span></div>
                  {clientFlags.length === 0 && <p className="muted">No clients need follow-up.</p>}
                  <ul className="ov-list">
                    {clientFlags.slice(0, 5).map((f) => (
                      <li key={f.h.key}>
                        <Pill s={f.level === "red" ? "High" : "Medium"} className={f.level === "red" ? "bad" : "warn"} />
                        <div><b>{f.h.name}</b>{f.pilot && <> <Pill s="Pilot" className="info" /></>}<span className="ov-sub">{f.reasons[0]}{f.reasons.length > 1 ? ` · +${f.reasons.length - 1} more` : ""}</span></div>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="more" onClick={() => goTo("sec-client-followup")}>See all clients →</button>
                </div>
                <div className="ov-card">
                  <div className="ov-head"><h3>People</h3><span className="count">{flags.length}</span></div>
                  {flags.length === 0 && <p className="muted">Nobody needs follow-up.</p>}
                  <ul className="ov-list">
                    {flags.slice(0, 5).map((f) => (
                      <li key={f.engineer.id}>
                        <Pill s={f.level === "red" ? "High" : "Medium"} className={f.level === "red" ? "bad" : "warn"} />
                        <div><b>{f.engineer.name}</b><span className="ov-sub">{f.engineer.clients.join(", ") || "No client"} · {f.reasons[0]}</span></div>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="more" onClick={() => goTo("sec-followup")}>See all people →</button>
                </div>
              </div>
            </section>

            {pilotClients.length > 0 && (
              <section>
                <h2>Pilots</h2>
                <div className="pilot-cards">
                  {pilotClients.map((p) => {
                    const pct = p.daysLeft === null || p.notStarted ? 0 : Math.max(0, Math.min(100, ((PILOT_DAYS - p.daysLeft) / PILOT_DAYS) * 100));
                    return (
                      <div className="pilot-card" key={p.h.key}>
                        <div className="ov-head"><h3>{p.h.name}</h3><PilotTag p={p} /></div>
                        <div className="pilot-track" role="img" aria-label={`${Math.round(pct)}% of the pilot elapsed`}><span style={{ width: `${pct}%` }} /></div>
                        <p className="ov-sub">{range(p.start, p.end)} · {headcount(p.h) || "—"} {headcount(p.h) === 1 ? "person" : "people"}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {recentComments.length > 0 && (
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
        <h2>Active Client Health</h2>
        <div className="legend">
          {([["green", "On track"], ["yellow", "Needs Attention"], ["red", "High Risk"]] as [Light, string][]).map(([l, label]) => (
            <button type="button" key={l} className={`chip${lightFilter === l ? " on" : ""}`} onClick={() => setLightFilter(lightFilter === l ? null : l)} aria-pressed={lightFilter === l}>
              <i className={`seg-${LIGHT_CLASS[l]}`} />{label}
            </button>
          ))}
          {lightFilter && <button type="button" className="chip clear" onClick={() => setLightFilter(null)}>Clear filter</button>}
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Client</th><th className="center">Health</th><th className="center">People</th><th>Pilot period</th>
                <th>Last contact</th><th className="center">Days ago</th><th>Why and latest comment</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && <EmptyRow cols={7} text={lightFilter ? "No clients with this color." : "No clients on your team."} />}
              {visibleRows.map(({ h, m, ago, pilot, pilotInfo }) => {
                const open = selected === h.key;
                const recent = m?.notes && ago !== null && ago <= 31;
                return (
                  <tr key={h.key} className={`clickable${open ? " is-selected" : ""}`} onClick={() => setSelected((cur) => (cur === h.key ? null : h.key))}>
                    <td>{h.url ? <NameLink href={h.url}>{h.name}</NameLink> : h.name}</td>
                    <td className="center">{pilot ? <Pill s="Pilot" className="info" /> : <LightPill light={h.light} />}</td>
                    <td className="center">{headcount(h) || "—"}</td>
                    <td>
                      {pilotInfo ? (
                        <>
                          {range(pilotInfo.start, pilotInfo.end)}
                          <div><PilotTag p={pilotInfo} /></div>
                        </>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className={m ? "" : "muted"}>{m ? fmtDate(m.date) : "Not found"}</td>
                    <td className="center">{ago === null ? <span className="muted">—</span> : <Pill s={`${ago} d ago`} className={ago > 30 ? "warn" : "info"} />}</td>
                    <td className="wide">
                      {h.reasons.length === 0 ? (
                        <span className="muted">No alerts</span>
                      ) : (
                        <ul className="reasons">
                          {(open ? h.reasons : h.reasons.slice(0, 1)).map((r, i) => (
                            <li key={i} className={`r-${r.level}`}>{r.text}</li>
                          ))}
                          {!open && h.reasons.length > 1 && <li className="r-info">+{h.reasons.length - 1} more (click the row)</li>}
                        </ul>
                      )}
                      {recent && m?.notes && (
                        <div className="note">
                          <span className="note-head">Comment · {fmtDate(m.date)}</span>
                          <p>{m.notes.comment}</p>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section id="sec-pilot">
        <h2>Clients in pilot period</h2>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Client</th><th className="center">Headcount</th><th>Start</th><th>End</th><th>Status</th></tr>
            </thead>
            <tbody>
              {pilotClients.length === 0 && <EmptyRow cols={5} text="No clients are in a pilot period." />}
              {pilotClients.map((p) => (
                <tr key={p.h.key}>
                  <td>{p.h.url ? <NameLink href={p.h.url}>{p.h.name}</NameLink> : p.h.name}</td>
                  <td className="center">{headcount(p.h) || "—"}</td>
                  <td>{range(p.start, p.startLast)}</td>
                  <td>{range(p.endFirst, p.end)}</td>
                  <td>
                    <PilotTag p={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="sec-client-followup">
        <h2>Clients who need follow-up</h2>
        <div className="tw">
          <table>
            <thead>
              <tr><th className="center">Client</th><th className="center">Priority</th><th className="center">People</th><th>Last contact</th><th>Reasons</th></tr>
            </thead>
            <tbody>
              {clientFlags.length === 0 && <EmptyRow cols={5} text="No clients need follow-up." />}
              {clientFlags.map((f) => (
                <tr key={f.h.key}>
                  <td className="center">
                    {f.h.url ? <NameLink href={f.h.url}>{f.h.name}</NameLink> : f.h.name}
                    {f.pilot && <> <Pill s="Pilot" className="info" /></>}
                  </td>
                  <td className="center"><Pill s={f.level === "red" ? "High" : "Medium"} className={f.level === "red" ? "bad" : "warn"} /></td>
                  <td className="center">{headcount(f.h) || "—"}</td>
                  <td className={f.m ? "" : "muted"}>{f.m ? `${fmtDate(f.m.date)} · ${f.ago} d ago` : "Not found"}</td>
                  <td className="wide">{f.reasons.join(" · ")}</td>
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

      <section id="sec-people-client">
        <h2>People by client</h2>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Client</th><th className="center">People</th><th>Team</th></tr>
            </thead>
            <tbody>
              {health.filter((h) => h.engineers.length > 0).map((h) => (
                <tr key={h.key}>
                  <td>{h.url ? <NameLink href={h.url}>{h.name}</NameLink> : h.name}</td>
                  <td className="center">{h.engineers.length}</td>
                  <td className="wide">
                    <ul className="plist">
                      {[...h.engineers].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                        <li key={e.id}>
                          <NameLink href={e.url}>{e.name}</NameLink>
                          {e.role && <span className="muted"> · {e.role}</span>} <Pill s={e.status} />
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
