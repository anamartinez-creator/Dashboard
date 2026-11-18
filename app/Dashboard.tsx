"use client";

import { useMemo } from "react";
import type { Client, Engineer, LatestNote, Sow } from "@/lib/notion";
import AutoRefresh from "./AutoRefresh";
import { PILOT_DAYS, PILOT_STARTS } from "@/lib/pilots";
import { CLIENT_MEETINGS, MEETINGS_AS_OF, MEETINGS_SEARCHED_SINCE } from "@/lib/client-meetings";
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

  // Last client meeting per client (all of them, pilot included), longest without contact first
  const meetingRows = useMemo(() => {
    const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
    return health
      .map((h) => {
        const m = CLIENT_MEETINGS.find((x) => sameClient(x.client, h.name)) ?? null;
        return { h, m, ago: m ? dayDiff(m.date, today) : null };
      })
      .sort((a, b) => (a.ago === null ? 1 : 0) - (b.ago === null ? 1 : 0) || (b.ago ?? 0) - (a.ago ?? 0) || a.h.name.localeCompare(b.h.name));
  }, [health, today]);

  // Clients in pilot have their own section; the health list is for the rest
  const shownHealth = useMemo(() => {
    const inPilot = new Set(pilotClients.map((p) => p.h.key));
    return health.filter((h) => !inPilot.has(h.key));
  }, [health, pilotClients]);

  // People grouped by client, using the client names from Active Clients Status.
  // Someone on two clients shows up under both.
  const teamByClient = useMemo(() => {
    const pilotKeys = new Set(pilotClients.map((p) => p.h.key));
    const m = new Map<string, { client: string; pilot: boolean; people: Engineer[] }>();
    for (const e of mine) {
      for (const label of e.clients.length ? e.clients : ["No client"]) {
        const match = health.find((h) => sameClient(h.name, label));
        const name = match?.name ?? label;
        const g = m.get(name) ?? { client: name, pilot: match ? pilotKeys.has(match.key) : false, people: [] };
        g.people.push(e);
        m.set(name, g);
      }
    }
    return Array.from(m.values()).sort((a, b) => b.people.length - a.people.length || a.client.localeCompare(b.client));
  }, [mine, health, pilotClients]);
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
            <b>{lights.green}</b> clients green, <b>{lights.yellow}</b> yellow and <b>{lights.red}</b> red.{" "}
            <b>{flags.length}</b> of <b>{counts.total}</b> people need follow-up.
          </p>
        </div>
        <p className="owner">SDM: <b>{owner}</b><br />Excludes Customer Success</p>
      </header>

      <div className="kpis">
        <Kpi label="Green clients" value={lights.green} sub="No alerts" />
        <Kpi label="Yellow clients" value={lights.yellow} sub="Need follow-up" flag={lights.yellow > 0 ? "warn" : undefined} />
        <Kpi label="Red clients" value={lights.red} sub="Action needed" flag={lights.red > 0 ? "bad" : undefined} />
        <Kpi label="Average score" value={avgScore} sub="Out of 100" />
        <Kpi label="Needs Attention / High Risk" value={`${counts.attention} / ${counts.highRisk}`} sub="People" flag={risky > 0 ? "bad" : undefined} />
      </div>

      <section>
        <h2>Client health</h2>
        <p className="hint">
          Clients outside the pilot period. Red first, then yellow. Red: High Risk, SOW Pending or expired pilot. Yellow: Needs Attention, unsigned SOW, pilot ending in {PILOT_WARN_DAYS} days or less, or people without a 1:1 cadence.
          The score (0 to 100) orders clients within each color.
        </p>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Client</th><th>Health</th><th>Score</th><th>Notion status</th><th>People</th><th>Reasons</th></tr>
            </thead>
            <tbody>
              {shownHealth.length === 0 && <EmptyRow cols={6} text="No clients on your team." />}
              {shownHealth.map((h) => (
                <tr key={h.key}>
                  <td>{h.url ? <NameLink href={h.url}>{h.name}</NameLink> : h.name}</td>
                  <td><LightPill light={h.light} /></td>
                  <td><ScoreBar h={h} /></td>
                  <td className="muted">{h.status || "—"}</td>
                  <td className="num">{h.engineers.length || h.headcount || "—"}</td>
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
        <p className="hint">Last client check-in per client, from Fathom and Google Calendar (searched since {fmtDate(MEETINGS_SEARCHED_SINCE)}). Snapshot as of {fmtDate(MEETINGS_AS_OF)}.</p>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Client</th><th>Last met</th><th>Days ago</th><th>Source</th><th>Meeting</th></tr>
            </thead>
            <tbody>
              {meetingRows.length === 0 && <EmptyRow cols={5} text="No clients." />}
              {meetingRows.map(({ h, m, ago }) => (
                <tr key={h.key}>
                  <td>{h.url ? <NameLink href={h.url}>{h.name}</NameLink> : h.name}</td>
                  <td className={m ? "" : "muted"}>{m ? fmtDate(m.date) : "Not found"}</td>
                  <td>{ago === null ? <span className="muted">—</span> : <Pill s={`${ago} d`} className={ago > 30 ? "warn" : "info"} />}</td>
                  <td className="muted">{m?.source ?? "—"}</td>
                  <td className="wide">
                    {m ? (
                      <>
                        {m.url ? <NameLink href={m.url}>{m.title}</NameLink> : m.title}
                        {m.notes && (
                          <div className="note">
                            <span className="note-head">Last notes · {fmtDate(m.date)}</span>
                            <p>{m.notes.summary}</p>
                            <ul className="reasons">
                              {m.notes.takeaways.map((t, i) => <li key={i}>{t}</li>)}
                            </ul>
                            {m.notes.nextSteps.length > 0 && (
                              <>
                                <span className="note-head">Next steps</span>
                                <ul className="reasons">
                                  {m.notes.nextSteps.map((t, i) => <li key={i}>{t}</li>)}
                                </ul>
                              </>
                            )}
                          </div>
                        )}
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
              <tr><th>Person</th><th>Priority</th><th>Client</th><th>SDM</th><th>Reasons</th></tr>
            </thead>
            <tbody>
              {flags.length === 0 && <EmptyRow cols={5} text="Nobody needs follow-up." />}
              {flags.map((f) => (
                <tr key={f.engineer.id}>
                  <td><NameLink href={f.engineer.url}>{f.engineer.name}</NameLink></td>
                  <td><Pill s={f.level === "red" ? "High" : "Medium"} className={f.level === "red" ? "bad" : "warn"} /></td>
                  <td>{f.engineer.clients.join(", ") || "—"}</td>
                  <td className="muted">{f.engineer.sdms.join(", ") || "—"}</td>
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
        <p className="hint">Clients with the most people first; within each, whoever needs attention comes first. The name opens the person's Notion page. People on two clients appear under both.</p>
        {teamByClient.length === 0 && <p className="hint">Nobody assigned.</p>}
        <div className="groups">
          {teamByClient.map((g) => (
            <div className="group" key={g.client}>
              <h3>
                {g.client} <span className="count">{g.people.length} {g.people.length === 1 ? "person" : "people"}</span>
                {g.pilot && <Pill s="Pilot" className="info" />}
              </h3>
              <div className="tw">
                <table className="team-table">
                  <thead>
                    <tr><th>Person</th><th>Status</th><th>Role</th><th>1:1</th><th>Start</th><th>Country</th></tr>
                  </thead>
                  <tbody>
                    {g.people.map((e) => (
                      <tr key={e.id}>
                        <td><NameLink href={e.url}>{e.name}</NameLink></td>
                        <td><Pill s={e.status} /></td>
                        <td className="muted">{e.role || "—"}</td>
                        <td className={e.cadence ? "" : "muted"}>{e.cadence ?? "Not set"}</td>
                        <td className="muted">{fmtDate(e.startDate)}</td>
                        <td className="muted">{e.location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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

const LIGHT_LABEL: Record<Light, string> = { green: "Verde", yellow: "Amarillo", red: "Rojo" };
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
