"use client";

import { useMemo } from "react";
import type { Client, Engineer, Sow } from "@/lib/notion";
import AutoRefresh from "./AutoRefresh";
import { PILOT_DAYS, PILOT_STARTS } from "@/lib/pilots";
import { computeClientHealth, sameClient, personFlag, PILOT_WARN_DAYS, type ClientHealth, type Light } from "@/lib/health";

type Props = { owner: string; engineers: Engineer[]; sows: Sow[]; clients: Client[]; loadedAt: string; today: string };

const tone = (s: string) =>
  ({ "On track": "ok", Signed: "ok", "Needs Attention": "warn", Sent: "warn", "To confirm": "warn", "High Risk": "bad", Pending: "bad" } as Record<string, string>)[s] ?? "info";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

// "12 nov 2026" or, when people start on different days, "12 nov – 30 nov 2026"
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

export default function Dashboard({ owner, engineers, sows, clients, loadedAt, today }: Props) {
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
  const shownHealth = health;

  // Clients in pilot: status "Pilot" in Notion, or with people still in their 90 days.
  // Dates come from the people: first start and last end among those in pilot.
  const pilotClients = useMemo(() => {
    const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
    return health
      .map((h) => {
        const ppl = h.engineers.filter((e) => e.pilotTracked && e.startDate && e.pilotEnd);
        if (h.status !== "Pilot" && ppl.length === 0) return null;
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
          <h1>Health del delivery SDM</h1>
          <p className="lede">
            <b>{lights.green}</b> clientes en verde, <b>{lights.yellow}</b> en amarillo y <b>{lights.red}</b> en rojo.{" "}
            <b>{flags.length}</b> de <b>{counts.total}</b> personas requieren seguimiento.
          </p>
        </div>
        <p className="owner">SDM: <b>{owner}</b><br />Sin Customer Success</p>
      </header>

      <div className="kpis">
        <Kpi label="Clientes en verde" value={lights.green} sub="Sin alertas" />
        <Kpi label="Clientes en amarillo" value={lights.yellow} sub="Requieren seguimiento" flag={lights.yellow > 0 ? "warn" : undefined} />
        <Kpi label="Clientes en rojo" value={lights.red} sub="Acción necesaria" flag={lights.red > 0 ? "bad" : undefined} />
        <Kpi label="Score promedio" value={avgScore} sub="De 0 a 100" />
        <Kpi label="Needs Attention / High Risk" value={`${counts.attention} / ${counts.highRisk}`} sub="Personas" flag={risky > 0 ? "bad" : undefined} />
        <Kpi label="Sin cadencia de 1:1" value={counts.noCadence} sub="Campo vacío en Notion" flag={counts.noCadence > 0 ? "warn" : undefined} />
      </div>

      <section>
        <h2>Health por cliente</h2>
        <p className="hint">
          Primero los rojos, luego los amarillos. Rojo: High Risk, SOW Pending o piloto vencido. Amarillo: Needs Attention, SOW sin firmar, piloto que termina en {PILOT_WARN_DAYS} días o menos, o personas sin cadencia de 1:1.
          El score (0 a 100) ordena dentro de cada color.
        </p>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Cliente</th><th>Health</th><th>Score</th><th>Status en Notion</th><th>Personas</th><th>Motivos</th></tr>
            </thead>
            <tbody>
              {shownHealth.length === 0 && <EmptyRow cols={6} text="Ningún cliente en tu equipo." />}
              {shownHealth.map((h) => (
                <tr key={h.key}>
                  <td>{h.url ? <NameLink href={h.url}>{h.name}</NameLink> : h.name}</td>
                  <td><LightPill light={h.light} /></td>
                  <td><ScoreBar h={h} /></td>
                  <td className="muted">{h.status || "—"}</td>
                  <td className="num">{h.engineers.length || h.headcount || "—"}</td>
                  <td className="wide">
                    {h.reasons.length === 0 ? (
                      <span className="muted">Sin alertas</span>
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
        <h2>Clientes en periodo de piloto</h2>
        <p className="hint">
          Clientes con status Pilot en Notion o con personas en sus primeros 90 días. Inicio y fin salen de la fecha de inicio y de Pilot End de cada persona
          (si falta Pilot End, inicio + 90 días). Si las personas entran en fechas distintas se muestra el rango. VertexOne usa la fecha de inicio del cliente (16 nov) + 90 días; se cambia en lib/pilots.ts.
        </p>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Cliente</th><th>Personas en piloto</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {pilotClients.length === 0 && <EmptyRow cols={5} text="Ningún cliente está en periodo de piloto." />}
              {pilotClients.map((p) => (
                <tr key={p.h.key}>
                  <td>{p.h.url ? <NameLink href={p.h.url}>{p.h.name}</NameLink> : p.h.name}</td>
                  <td className="wide">
                    {p.ppl.length === 0 ? <span className="muted">Sin fechas en Notion</span> : <><b>{p.ppl.length}</b> <span className="muted">· {p.ppl.map((e) => e.name).join(", ")}</span></>}
                  </td>
                  <td>{range(p.start, p.startLast)}</td>
                  <td>{range(p.endFirst, p.end)}</td>
                  <td>
                    {p.daysLeft === null ? (
                      <Pill s="Sin fechas" className="info" />
                    ) : p.notStarted ? (
                      <Pill s={`Empieza en ${p.toStart} d`} className="info" />
                    ) : p.daysLeft < 0 ? (
                      <Pill s={`Terminó hace ${-p.daysLeft} d`} className="bad" />
                    ) : (
                      <Pill s={`${p.daysLeft} d restantes`} className={p.daysLeft <= PILOT_WARN_DAYS ? "warn" : "ok"} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Salud del equipo</h2>
        <p className="hint">Solo tu equipo. Las personas en dos clientes cuentan una sola vez.</p>
        <div className="legend">
          {statusMix.map((m) => (
            <span key={m.label}><i className={m.cls} />{m.label} ({m.n})</span>
          ))}
        </div>
        <div className="mix" role="img" aria-label={"Estado del equipo: " + statusMix.map((m) => `${m.label} ${m.n}`).join(", ")}>
          {statusMix.filter((m) => m.n > 0).map((m) => (
            <span key={m.label} className={m.cls} style={{ flex: m.n / mixTotal }} title={`${m.label}: ${m.n}`} />
          ))}
        </div>
      </section>

      <section>
        <h2>Personas que requieren seguimiento</h2>
        <p className="hint">High Risk, Needs Attention, piloto vencido o por vencer, o sin cadencia de 1:1.</p>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Persona</th><th>Prioridad</th><th>Cliente</th><th>SDM</th><th>Motivos</th></tr>
            </thead>
            <tbody>
              {flags.length === 0 && <EmptyRow cols={5} text="Nadie requiere seguimiento." />}
              {flags.map((f) => (
                <tr key={f.engineer.id}>
                  <td><NameLink href={f.engineer.url}>{f.engineer.name}</NameLink></td>
                  <td><Pill s={f.level === "red" ? "Alta" : "Media"} className={f.level === "red" ? "bad" : "warn"} /></td>
                  <td>{f.engineer.clients.join(", ") || "—"}</td>
                  <td className="muted">{f.engineer.sdms.join(", ") || "—"}</td>
                  <td className="wide">{f.reasons.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Equipo</h2>
        <p className="hint">Primero lo que necesita atención. El nombre abre la página de la persona en Notion.</p>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Persona</th><th>Status</th><th>Cliente</th><th>Rol</th><th>SDM</th><th>1:1</th><th>País</th></tr>
            </thead>
            <tbody>
              {mine.length === 0 && <EmptyRow cols={7} text="Nadie asignado." />}
              {mine.map((e) => (
                <tr key={e.id}>
                  <td><NameLink href={e.url}>{e.name}</NameLink></td>
                  <td><Pill s={e.status} /></td>
                  <td>{e.clients.join(", ") || "—"}</td>
                  <td className="muted">{e.role || "—"}</td>
                  <td className="muted">{e.sdms.join(", ") || "—"}</td>
                  <td className={e.cadence ? "" : "muted"}>{e.cadence ?? "Sin definir"}</td>
                  <td className="muted">{e.location || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="foot">
        Datos de Notion · Master SDM Tracker · actualizado{" "}
        {new Date(loadedAt).toLocaleString("es-HN", { timeZone: "America/Tegucigalpa", dateStyle: "medium", timeStyle: "short" })}
        {" · "}se actualiza solo cada minuto · <AutoRefresh />
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
  return <span className={`pill ${LIGHT_CLASS[light]}`}>{LIGHT_LABEL[light]}</span>;
}

function ScoreBar({ h }: { h: ClientHealth }) {
  return (
    <span className="score" title={`Score ${h.score} de 100`}>
      <span className="score-track"><span className={`score-fill seg-${LIGHT_CLASS[h.light]}`} style={{ width: `${h.score}%` }} /></span>
      <span className="score-num">{h.score}</span>
    </span>
  );
}
