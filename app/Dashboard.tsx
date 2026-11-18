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

  // Active Client Health: filter by color, click a row for all reasons
  const [lightFilter, setLightFilter] = useState<Light | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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
      return { h, m, ago: m ? dayDiff(m.date, today) : null, pilot: inPilot.has(h.key) };
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

  const mixTotal = Math.max(1, statusMix.reduce((n, m) => n + m.n, 0));

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1>Software Service Delivery Dashboard</h1>
          <p className="lede">
            <b>{lights.green}</b> clients on track, <b>{lights.yellow}</b> need attention and <b>{lights.red}</b> high risk.{" "}
            <b>{flags.length}</b> of <b>{counts.total}</b> people need follow-up.
          </p>
        </div>
        <p className="owner">SDM: <b>{owner}</b></p>
      </header>

      <section>
        <h2>Client Status</h2>
        <div className="kpis">
          <Kpi label="On track" value={lights.green} sub="Clients" />
          <Kpi label="Needs Attention" value={lights.yellow} sub="Clients" flag={lights.yellow > 0 ? "warn" : undefined} />
          <Kpi label="High Risk" value={lights.red} sub="Clients" flag={lights.red > 0 ? "bad" : undefined} />
          <Kpi label="Pilot" value={pilotClients.length} sub="Clients" />
          <Kpi label="Average score" value={avgScore} sub="Out of 100" />
        </div>
      </section>

      <section>
        <h2>People</h2>
        <div className="kpis">
          <Kpi label="Total" value={counts.total} sub="People on your team" />
          <Kpi label="Needs Attention" value={counts.attention} sub="People" flag={counts.attention > 0 ? "warn" : undefined} />
          <Kpi label="High Risk" value={counts.highRisk} sub="People" flag={counts.highRisk > 0 ? "bad" : undefined} />
        </div>
      </section>

      <section>
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
                <th>Client</th><th className="center">Health</th><th className="center">People</th>
                <th>Last contact</th><th className="center">Days ago</th><th>Why and latest comment</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && <EmptyRow cols={6} text={lightFilter ? "No clients with this color." : "No clients on your team."} />}
              {visibleRows.map(({ h, m, ago, pilot }) => {
                const open = selected === h.key;
                const recent = m?.notes && ago !== null && ago <= 31;
                return (
                  <tr key={h.key} className={`clickable${open ? " is-selected" : ""}`} onClick={() => setSelected((cur) => (cur === h.key ? null : h.key))}>
                    <td>{h.url ? <NameLink href={h.url}>{h.name}</NameLink> : h.name}</td>
                    <td className="center">{pilot ? <Pill s="Pilot" className="info" /> : <LightPill light={h.light} />}</td>
                    <td className="center">{headcount(h) || "—"}</td>
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

// People on the client: the engineers found in Notion, else the headcount typed on the client page
const headcount = (h: ClientHealth) => h.engineers.length || h.headcount || 0;

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
