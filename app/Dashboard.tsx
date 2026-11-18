"use client";

import { useMemo, useState } from "react";
import type { Client, Engineer, Sow } from "@/lib/notion";
import AutoRefresh from "./AutoRefresh";

type Props = { engineers: Engineer[]; sows: Sow[]; clients: Client[]; loadedAt: string; today: string };

const ALL = "Todos";

const tone = (s: string) =>
  ({ "On track": "ok", Signed: "ok", "Needs Attention": "warn", Sent: "warn", "To confirm": "warn", "High Risk": "bad", Pending: "bad" } as Record<string, string>)[s] ?? "info";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
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

export default function Dashboard({ engineers, sows, clients, loadedAt }: Props) {
  const sdmNames = useMemo(() => Array.from(new Set(engineers.flatMap((e) => e.sdms))).sort(), [engineers]);
  const [sdm, setSdm] = useState(ALL);
  const mine = useMemo(() => engineers.filter((e) => sdm === ALL || e.sdms.includes(sdm)), [engineers, sdm]);

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

  // Pilots that end within 30 days, ended in the last 30, or haven't started yet
  const pilots = useMemo(
    () =>
      mine
        .filter((e) => e.pilotDaysLeft !== null && e.pilotDaysLeft >= -30 && e.pilotDaysLeft <= 120 && (e.pilotDaysLeft <= 30 || e.pilotDaysLeft > 90))
        .sort((a, b) => (a.pilotDaysLeft ?? 0) - (b.pilotDaysLeft ?? 0)),
    [mine]
  );

  const byClient = useMemo(() => {
    const m = new Map<string, { client: string; onTrack: number; attention: number; onboarding: number; total: number }>();
    for (const e of mine) {
      for (const c of e.clients.length ? e.clients : ["Sin cliente"]) {
        const r = m.get(c) ?? { client: c, onTrack: 0, attention: 0, onboarding: 0, total: 0 };
        if (e.status === "Needs Attention" || e.status === "High Risk") r.attention++;
        else if (e.status === "New Hire" || e.status === "Hiring") r.onboarding++;
        else r.onTrack++;
        r.total++;
        m.set(c, r);
      }
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total || a.client.localeCompare(b.client));
  }, [mine]);
  const maxTotal = Math.max(1, ...byClient.map((r) => r.total));

  const openSows = sows.filter((s) => s.status !== "Signed");
  const flaggedClients = clients.filter((c) => c.status !== "On track");
  const risky = counts.attention + counts.highRisk;

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1>Estado de delivery SDM</h1>
          <p className="lede">
            De <b>{counts.total}</b> personas en el tracker, <b>{counts.onTrack}</b> están On track y <b>{counts.onboarding}</b> están en onboarding.{" "}
            <b>{counts.noCadence}</b> no tienen cadencia de 1:1 definida.
          </p>
        </div>
        <label className="filter">
          SDM
          <select value={sdm} onChange={(e) => setSdm(e.target.value)}>
            <option value={ALL}>{ALL}</option>
            {sdmNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="kpis">
        <Kpi label="Personas activas" value={counts.total} sub="Software Development" />
        <Kpi label="On track" value={counts.onTrack} sub="Status en Notion" />
        <Kpi label="Needs Attention / High Risk" value={`${counts.attention} / ${counts.highRisk}`} sub="Requieren seguimiento" flag={risky > 0 ? "bad" : undefined} />
        <Kpi label="En onboarding" value={counts.onboarding} sub="New Hire o Hiring" />
        <Kpi label="Sin cadencia de 1:1" value={counts.noCadence} sub="Campo vacío en Notion" flag={counts.noCadence > 0 ? "warn" : undefined} />
      </div>

      <section>
        <h2>Pilotos de 90 días</h2>
        <p className="hint">Personas cuyo piloto (inicio + 90 días) termina en los próximos 30 días, terminó hace menos de 30, o que todavía no empiezan.</p>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Persona</th><th>Cliente</th><th>Inicio</th><th>Fin del piloto</th><th>Días</th></tr>
            </thead>
            <tbody>
              {pilots.length === 0 && <EmptyRow cols={5} text="Ningún piloto termina cerca de hoy para este SDM." />}
              {pilots.map((e) => {
                const d = e.pilotDaysLeft ?? 0;
                return (
                  <tr key={e.id}>
                    <td><NameLink href={e.url}>{e.name}</NameLink></td>
                    <td>{e.clients.join(", ") || "—"}</td>
                    <td>{fmtDate(e.startDate)}</td>
                    <td>{fmtDate(e.pilotEnd)}</td>
                    <td>
                      <Pill
                        s={d < 0 ? `Terminó hace ${-d} d` : d > 90 ? `Empieza en ${d - 90} d` : `${d} d`}
                        className={d < 0 ? "bad" : d <= 30 ? "warn" : "info"}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2">
        <section>
          <h2>SOWs sin firmar</h2>
          <p className="hint">Del SOW Tracker. Todo lo que no está en Signed.</p>
          <div className="tw">
            <table>
              <thead><tr><th>Cliente</th><th>Estado</th><th>Siguiente paso</th></tr></thead>
              <tbody>
                {openSows.length === 0 && <EmptyRow cols={3} text="Todos los SOWs están firmados." />}
                {openSows.map((s) => (
                  <tr key={s.id}>
                    <td><NameLink href={s.url}>{s.client}</NameLink></td>
                    <td><Pill s={s.status} /></td>
                    <td className="wide">{s.nextStep || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2>Clientes que no están On track</h2>
          <p className="hint">De Active Clients Status, incluye Customer Success.</p>
          <div className="tw">
            <table>
              <thead><tr><th>Cliente</th><th>Estado</th><th>Unidad</th><th>Headcount</th></tr></thead>
              <tbody>
                {flaggedClients.length === 0 && <EmptyRow cols={4} text="Todos los clientes están On track." />}
                {flaggedClients.map((c) => (
                  <tr key={c.id}>
                    <td><NameLink href={c.url}>{c.client}</NameLink></td>
                    <td><Pill s={c.status} /></td>
                    <td className="muted">{c.unit || "—"}</td>
                    <td className="num">{c.headcount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section>
        <h2>Personas por cliente</h2>
        <p className="hint">Según el SDM elegido. Quien está en dos clientes cuenta en ambos.</p>
        <div className="legend">
          <span><i className="seg-ok" />On track</span>
          <span><i className="seg-warn" />Needs Attention / High Risk</span>
          <span><i className="seg-muted" />Onboarding</span>
        </div>
        <div className="bars" role="img" aria-label={"Personas por cliente: " + byClient.map((r) => `${r.client} ${r.total}`).join(", ")}>
          {byClient.map((r) => (
            <div className="bar-row" key={r.client} title={`${r.client}: ${r.onTrack} on track · ${r.attention} atención · ${r.onboarding} onboarding`}>
              <span className="bar-label">{r.client}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(r.total / maxTotal) * 100}%` }}>
                  {r.onTrack > 0 && <span className="seg-ok" style={{ flex: r.onTrack }} />}
                  {r.attention > 0 && <span className="seg-warn" style={{ flex: r.attention }} />}
                  {r.onboarding > 0 && <span className="seg-muted" style={{ flex: r.onboarding }} />}
                </span>
                <span className="bar-num">{r.total}</span>
              </span>
            </div>
          ))}
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
              {mine.length === 0 && <EmptyRow cols={7} text="Nadie asignado a este SDM." />}
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
