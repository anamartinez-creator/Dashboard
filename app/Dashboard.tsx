"use client";

import { useMemo, useState } from "react";
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

  // Interactivity for Active Client Health: filter by color, pick a client, sort columns
  const [lightFilter, setLightFilter] = useState<Light | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [teamQuery, setTeamQuery] = useState("");
  const [teamDetails, setTeamDetails] = useState(false);
  const [sort, setSort] = useState<{ by: "health" | "name" | "score"; dir: 1 | -1 }>({ by: "health", dir: 1 });
  const pickClient = (key: string) => {
    setSelected((cur) => (cur === key ? null : key));
    document.getElementById(`row-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const toggleSort = (by: "health" | "name" | "score") =>
    setSort((cur) => (cur.by === by ? { by, dir: (cur.dir * -1) as 1 | -1 } : { by, dir: by === "score" ? -1 : 1 }));

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

  // Last client meeting per client (all of them, pilot included), most recent first, clients with no meeting last
  const meetingRows = useMemo(() => {
    const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
    return health
      .map((h) => {
        const m = CLIENT_MEETINGS.find((x) => sameClient(x.client, h.name)) ?? null;
        return { h, m, ago: m ? dayDiff(m.date, today) : null };
      })
      .sort((a, b) => (a.ago === null ? 1 : 0) - (b.ago === null ? 1 : 0) || (a.ago ?? 0) - (b.ago ?? 0) || a.h.name.localeCompare(b.h.name));
  }, [health, today]);

  // Clients in pilot have their own section; the health list is for the rest
  const shownHealth = useMemo(() => {
    const inPilot = new Set(pilotClients.map((p) => p.h.key));
    return health.filter((h) => !inPilot.has(h.key));
  }, [health, pilotClients]);

  const visibleHealth = useMemo(() => {
    const rows = shownHealth.filter((h) => !lightFilter || h.light === lightFilter);
    if (sort.by === "health") return rows; // already red / yellow / green, then score
    return [...rows].sort((a, b) => sort.dir * (sort.by === "score" ? a.score - b.score : a.name.localeCompare(b.name)));
  }, [shownHealth, lightFilter, sort]);

  // People grouped by client, using the client names from Active Clients Status.
  // Someone on two clients shows up under both.
  const teamByClient = useMemo(() => {
    const pilotKeys = new Set(pilotClients.map((p) => p.h.key));
    const m = new Map<string, { client: string; pilot: boolean; light: Light | null; people: Engineer[] }>();
    for (const e of mine) {
      for (const label of e.clients.length ? e.clients : ["No client"]) {
        const match = health.find((h) => sameClient(h.name, label));
        const name = match?.name ?? label;
        const g = m.get(name) ?? { client: name, pilot: match ? pilotKeys.has(match.key) : false, light: match?.light ?? null, people: [] };
        g.people.push(e);
        m.set(name, g);
      }
    }
    return Array.from(m.values()).sort((a, b) => b.people.length - a.people.length || a.client.localeCompare(b.client));
  }, [mine, health, pilotClients]);

  const visibleTeam = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    if (!q) return teamByClient;
    return teamByClient
      .map((g) => (g.client.toLowerCase().includes(q) ? g : { ...g, people: g.people.filter((e) => `${e.name} ${e.role}`.toLowerCase().includes(q)) }))
      .filter((g) => g.people.length > 0);
  }, [teamByClient, teamQuery]);
  const lights = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0 };
    for (const h of shownHealth) c[h.light]++;
    return c;
  }, [shownHealth]);
  const avgScore = shownHealth.length ? Math.round(shownHealth.reduce((n, h) => n + h.score, 0) / shownHealth.length) : 0;

  const flags = useMemo(
    () =>
      mine
        .map(personFlag)
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .sort((a, b) => (a.level === b.level ? a.engineer.name.localeCompare(b.engineer.name) : a.level === "red" ? -1 : 1)),
    [mine]
  );
  const statusMix = useMemo(
    () => [
      { label: "On track", n: counts.onTrack, cls: "seg-ok" },
      { label: "Needs Attention", n: counts.attention, cls: "seg-warn" },
      { label: "High Risk", n: counts.highRisk, cls: "seg-bad" },
      { label: "Onboarding", n: counts.onboarding, cls: "seg-muted" },
    ],
    [counts]
  );

  const risky = counts.attention + counts.highRisk;
  const mixTotal = Math.max(1, statusMix.reduce((n, m) => n + m.n, 0));

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1>SDM Delivery Health</h1>
          <p className="lede">
            <b>{lights.green}</b> clients on track, <b>{lights.yellow}</b> need attention and <b>{lights.red}</b> high risk.{" "}
            <b>{flags.length}</b> of <b>{counts.total}</b> people need follow-up.
          </p>
        </div>
        <p className="owner">SDM: <b>{owner}</b></p>
      </header>

      <div className="kpis">
        <Kpi label="On track" value={lights.green} sub="No alerts" />
        <Kpi label="Needs Attention" value={lights.yellow} sub="Need follow-up" flag={lights.yellow > 0 ? "warn" : undefined} />
        <Kpi label="High Risk" value={lights.red} sub="Action needed" flag={lights.red > 0 ? "bad" : undefined} />
        <Kpi label="Average score" value={avgScore} sub="Out of 100" />
        <Kpi label="People" value={`${counts.attention} / ${counts.highRisk}`} sub="Needs Attention / High Risk" flag={risky > 0 ? "bad" : undefined} />
      </div>

      <section>
        <h2>Active Client Health</h2>
        <HealthChart all={shownHealth} rows={visibleHealth} filter={lightFilter} onFilter={setLightFilter} selected={selected} onPick={pickClient} />
        <div className="tw">
          <table>
            <thead>
              <tr>
                <SortTh label="Client" active={sort.by === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
                <SortTh label="Health" active={sort.by === "health"} dir={sort.dir} onClick={() => setSort({ by: "health", dir: 1 })} />
                <SortTh label="Score" active={sort.by === "score"} dir={sort.dir} onClick={() => toggleSort("score")} />
                <th>Notion status</th><th className="center">People</th><th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {visibleHealth.length === 0 && <EmptyRow cols={6} text={lightFilter ? "No clients with this color." : "No clients on your team."} />}
              {visibleHealth.map((h) => (
                <tr key={h.key} id={`row-${h.key}`} className={`clickable${selected === h.key ? " is-selected" : ""}`} onClick={() => setSelected((cur) => (cur === h.key ? null : h.key))}>
                  <td>{h.url ? <NameLink href={h.url}>{h.name}</NameLink> : h.name}</td>
                  <td><LightPill light={h.light} /></td>
                  <td><ScoreBar h={h} /></td>
                  <td className="muted">{h.status || "—"}</td>
                  <td className="center">{h.engineers.length || h.headcount || "—"}</td>
                  <td className="wide">
                    {h.reasons.length === 0 ? (
                      <span className="muted">No alerts</span>
                    ) : (
                      <ul className="reasons">
                        {h.reasons.map((r, i) => (
                          <li key={i} className={`r-${r.level}`}>{r.text}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Client meetings</h2>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Client</th><th>Last met</th><th>Days ago</th><th>Meeting</th></tr>
            </thead>
            <tbody>
              {meetingRows.length === 0 && <EmptyRow cols={4} text="No clients." />}
              {meetingRows.map(({ h, m, ago }) => (
                <tr key={h.key}>
                  <td>{h.url ? <NameLink href={h.url}>{h.name}</NameLink> : h.name}</td>
                  <td className={m ? "" : "muted"}>{m ? fmtDate(m.date) : "Not found"}</td>
                  <td>{ago === null ? <span className="muted">—</span> : <Pill s={`${ago} d`} className={ago > 30 ? "warn" : "info"} />}</td>
                  <td className="wide">
                    {m ? (
                      <>
                        {m.title}
                        {m.notes && ago !== null && ago <= 31 && (
                          <div className="note">
                            <span className="note-head">Comment · {fmtDate(m.date)}</span>
                            <p>{m.notes.comment}</p>
                          </div>
                        )}
                        {(!m.notes || ago === null || ago > 31) && <div className="muted">No notes from the last month</div>}
                      </>
                    ) : <span className="muted">No client meeting found</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Clients in pilot period</h2>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Client</th><th>People in pilot</th><th>Start</th><th>End</th><th>Status</th></tr>
            </thead>
            <tbody>
              {pilotClients.length === 0 && <EmptyRow cols={5} text="No clients are in a pilot period." />}
              {pilotClients.map((p) => (
                <tr key={p.h.key}>
                  <td>{p.h.url ? <NameLink href={p.h.url}>{p.h.name}</NameLink> : p.h.name}</td>
                  <td className="wide">
                    {p.ppl.length === 0 ? <span className="muted">No dates in Notion</span> : <><b>{p.ppl.length}</b> <span className="muted">· {p.ppl.map((e) => e.name).join(", ")}</span></>}
                  </td>
                  <td>{range(p.start, p.startLast)}</td>
                  <td>{range(p.endFirst, p.end)}</td>
                  <td>
                    {p.daysLeft === null ? (
                      <Pill s="No dates" className="info" />
                    ) : p.notStarted ? (
                      <Pill s={`Starts in ${p.toStart} d`} className="info" />
                    ) : p.daysLeft < 0 ? (
                      <Pill s={`Ended ${-p.daysLeft} d ago`} className="bad" />
                    ) : (
                      <Pill s={`${p.daysLeft} d left`} className={p.daysLeft <= PILOT_WARN_DAYS ? "warn" : "ok"} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
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

      <section>
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

      <section>
        <h2>Team by client</h2>
        <div className="team-tools">
          <input
            type="search" className="team-search" placeholder="Search person, role or client"
            value={teamQuery} onChange={(e) => setTeamQuery(e.target.value)} aria-label="Search the team"
          />
          <label className="team-toggle">
            <input type="checkbox" checked={teamDetails} onChange={(e) => setTeamDetails(e.target.checked)} /> Show details (1:1, start, country)
          </label>
        </div>
        {visibleTeam.length === 0 && <p className="hint">{teamQuery ? "No matches." : "Nobody assigned."}</p>}
        <div className="cards">
          {visibleTeam.map((g) => (
            <article className="card" key={g.client}>
              <header className="card-head">
                <h3>
                  {g.light && <LightPill light={g.light} />} {g.client}
                </h3>
                <span className="count">{g.people.length} {g.people.length === 1 ? "person" : "people"}</span>
                {g.pilot && <Pill s="Pilot" className="info" />}
              </header>
              <ul className="people">
                {g.people.map((e) => (
                  <li key={e.id}>
                    <div className="person-main">
                      <NameLink href={e.url}>{e.name}</NameLink>
                      <span className="person-role">{e.role || "—"}</span>
                    </div>
                    <Pill s={e.status} />
                    {teamDetails && (
                      <div className="person-detail">
                        1:1 {e.cadence ?? "not set"} · Start {fmtDate(e.startDate)} · {e.location || "—"}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <footer className="foot">
        Data from Notion · Master SDM Tracker · updated{" "}
        {new Date(loadedAt).toLocaleString("en-US", { timeZone: "America/Tegucigalpa", dateStyle: "medium", timeStyle: "short" })}
        {" · "}refreshes automatically every minute · <AutoRefresh />
      </footer>
    </main>
  );
}

function Kpi({ label, value, sub, flag }: { label: string; value: number | string; sub: string; flag?: "warn" | "bad" }) {
  return (
    <div className={`kpi ${flag ? "is-" + flag : ""}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-num">{value}</span>
      <span className="kpi-sub">{sub}</span>
    </div>
  );
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

function ScoreBar({ h }: { h: ClientHealth }) {
  return (
    <span className="score" title={`Score ${h.score} de 100`}>
      <span className="score-track"><span className={`score-fill seg-${LIGHT_CLASS[h.light]}`} style={{ width: `${h.score}%` }} /></span>
      <span className="score-num">{h.score}</span>
    </span>
  );
}


function SortTh({ label, active, dir, onClick }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void }) {
  return (
    <th aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className={`sort${active ? " on" : ""}`} onClick={onClick}>
        {label}<span aria-hidden="true">{active ? (dir === 1 ? " ▲" : " ▼") : ""}</span>
      </button>
    </th>
  );
}

// Visual summary of client health: how many clients per color (click to filter), and one bar
// per client (length = score 0-100, color = health light; click to highlight its row below).
function HealthChart({ all, rows, filter, onFilter, selected, onPick }: {
  all: ClientHealth[]; rows: ClientHealth[]; filter: Light | null; onFilter: (l: Light | null) => void;
  selected: string | null; onPick: (key: string) => void;
}) {
  if (all.length === 0) return null;
  const n = (l: Light) => all.filter((h) => h.light === l).length;
  const mix: { light: Light; label: string; count: number }[] = [
    { light: "green", label: "On track", count: n("green") },
    { light: "yellow", label: "Needs Attention", count: n("yellow") },
    { light: "red", label: "High Risk", count: n("red") },
  ];
  const toggle = (l: Light) => onFilter(filter === l ? null : l);
  const bars = [...rows].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return (
    <figure className="hchart" aria-label="Client health chart">
      <div className="hchart-mix">
        <div className="mix" role="group" aria-label="Filter clients by color">
          {mix.filter((m) => m.count > 0).map((m) => (
            <button
              type="button" key={m.light}
              className={`mix-seg seg-${LIGHT_CLASS[m.light]}${filter && filter !== m.light ? " dim" : ""}`}
              style={{ flex: m.count }} onClick={() => toggle(m.light)}
              aria-pressed={filter === m.light} title={`${m.count} ${m.label}. Click to filter`}
            />
          ))}
        </div>
        <div className="legend">
          {mix.map((m) => (
            <button type="button" key={m.light} className={`chip${filter === m.light ? " on" : ""}`} onClick={() => toggle(m.light)} aria-pressed={filter === m.light}>
              <i className={`seg-${LIGHT_CLASS[m.light]}`} />{m.label} {m.count}
            </button>
          ))}
          {filter && <button type="button" className="chip clear" onClick={() => onFilter(null)}>Clear filter</button>}
        </div>
      </div>
      <div className="hchart-bars">
        {bars.map((h) => (
          <button type="button" className={`hbar${selected === h.key ? " is-selected" : ""}`} key={h.key} onClick={() => onPick(h.key)} title={`${h.name}: score ${h.score} of 100. Click to highlight`}>
            <span className="hbar-label">{h.name}</span>
            <span className="hbar-track">
              <span className={`hbar-fill seg-${LIGHT_CLASS[h.light]}`} style={{ width: `${h.score}%` }} />
            </span>
            <span className="hbar-num">{h.score}</span>
          </button>
        ))}
      </div>
    </figure>
  );
}
