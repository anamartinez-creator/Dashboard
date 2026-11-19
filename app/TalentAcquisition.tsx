import type { HiringData, Role } from "@/lib/hiring";
import { OPEN_STATUSES } from "@/lib/hiring";

const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const tone = (s: string) => (s === "Active" ? "ok" : s === "On Hold" ? "bad" : "warn");

export default function TalentAcquisition({ data }: { data: HiringData }) {
  const { totals, open, byClient, openRoles, monthly, byStatus, today } = data;
  const age = (r: Role) => (r.opened ? dayDiff(r.opened, today) : null);
  const stale = openRoles.filter((r) => OPEN_STATUSES.includes(r.status) && (age(r) ?? 0) > 30).length;
  const headline =
    open.openPositions === 0
      ? "No open positions right now"
      : `${open.openPositions} ${open.openPositions === 1 ? "position" : "positions"} open across ${open.openRoles} ${open.openRoles === 1 ? "role" : "roles"}${open.holdRoles ? ` · ${open.holdRoles} on hold` : ""}`;
  const briefTone = stale > 0 ? "is-warn" : "is-ok";

  const maxClient = Math.max(1, ...byClient.map((c) => c.open + c.hold + c.presales));
  const histMax = Math.max(1, ...data.clientHistory.flatMap((g) => g.clients.map((c) => c.total)));
  const maxHires = Math.max(1, ...monthly.map((m) => m.hires));
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.positions));

  return (
    <>
      <div className="hero">
        <div className="hero-in">
          <div className="hero-bar">
            <h1 className="hero-title">Talent Acquisition</h1>
            <p className="owner">Source: Active Job Openings sheet<br />Latest tab: {data.latestTab}</p>
          </div>
          <div className={`brief ${briefTone}`}>
            <div className="brief-main">
              <p className="brief-eyebrow">Today at a glance</p>
              <h2 className="brief-title">{headline}</h2>
            </div>
          </div>
        </div>
      </div>

      <main className="ta">
        <div className="ta-stats">
          <div className="ta-stat"><b>{open.openPositions}</b><span>Openings ({open.openRoles} roles)</span></div>
          <div className="ta-stat"><b>{open.submitted}</b><span>Candidates submitted on open roles</span></div>
          <div className="ta-stat"><b>{totals.hires}</b><span>{data.hires ? "Hires in 2026" : `Hires in 2026 (${totals.filledRoles} roles filled)`}</span></div>
          <div className="ta-stat"><b>{data.avgDaysToStart === null ? "—" : `${Math.round(data.avgDaysToStart)} d`}</b><span>Average time to hire</span></div>
        </div>

        <div className="ta-block">
          <div className="ta-sec"><h2>Open roles</h2><p>What is being hired for right now, and where the candidates are.</p></div>
          <section className="chart-card">
            <div className="ta-scroll">
              <table className="ta-table">
                <thead>
                  <tr><th>Role</th><th>Owner</th><th className="c">Age</th><th className="c">Positions</th><th>Status</th><th className="c">Internal</th><th className="c">Submitted</th><th className="c">With client</th><th>Comment</th></tr>
                </thead>
                <tbody>
                  {openRoles.map((r) => (
                    <tr key={r.key}>
                      <td><b>{r.title}</b><small>{r.client}</small></td>
                      <td>{r.owner || "—"}</td>
                      <td className="c">{age(r) === null ? "—" : `${age(r)}d`}</td>
                      <td className="c">{r.positions}</td>
                      <td><span className={`pill ${tone(r.status)}`}>{r.status}</span></td>
                      <td className="c"><span className={`ta-n${r.internal ? "" : " is-0"}`}>{r.internal}</span></td>
                      <td className="c"><span className={`ta-n${r.submitted ? "" : " is-0"}`}>{r.submitted}</span></td>
                      <td className="c"><span className={`ta-n${r.inProcess ? "" : " is-0"}`}>{r.inProcess}</span></td>
                      <td className="ta-comment">{r.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="chart-card">
            <h3>Openings by client <span className="chart-total">blue open · red on hold · cyan in sales</span></h3>
            {byClient.length === 0 && <p className="ta-note">Nothing open.</p>}
            {byClient.map((c) => (
              <div className="ta-row" key={c.client}>
                <span className="g-name">{c.client}</span>
                <div className="ta-track">
                  <div className="ta-seg" style={{ width: `${(c.open / maxClient) * 100}%`, background: "var(--blue)" }} />
                  <div className="ta-seg" style={{ width: `${(c.hold / maxClient) * 100}%`, background: "var(--bad)" }} />
                  <div className="ta-seg" style={{ width: `${(c.presales / maxClient) * 100}%`, background: "var(--cyan)" }} />
                </div>
                <span className="ta-val">{c.open + c.hold + c.presales}</span>
              </div>
            ))}
          </section>
        </div>

        <div className="ta-block">
          <div className="ta-sec"><h2>Openings per client</h2><p>Positions each client has opened since January, and how they stand today.</p></div>
          <div className="ta-grid">
            {data.clientHistory.map((g) => (
              <section className="chart-card" key={g.group}>
                <h3>{g.group} <span className="chart-total">{g.clients.reduce((n, c) => n + c.total, 0)} openings since January</span></h3>
                {g.clients.map((c) => (
                  <div className="ta-row" key={c.client}>
                    <span className="g-name">{c.client}</span>
                    <div className="ta-track" title={`${c.filled} filled · ${c.open} open · ${c.closed} closed without a hire`}>
                      <div className="ta-seg" style={{ width: `${(c.filled / histMax) * 100}%`, background: "var(--ok)" }} />
                      <div className="ta-seg" style={{ width: `${(c.open / histMax) * 100}%`, background: "var(--blue)" }} />
                      <div className="ta-seg" style={{ width: `${(c.closed / histMax) * 100}%`, background: "var(--seg-muted)" }} />
                    </div>
                    <span className="ta-val">{c.total}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
          <div className="ta-legend">
            <span><i style={{ background: "var(--ok)" }} />Filled</span>
            <span><i style={{ background: "var(--blue)" }} />Still open</span>
            <span><i style={{ background: "var(--seg-muted)" }} />Cancelled, lost or dropped</span>
          </div>
        </div>

        <div className="ta-block">
          <div className="ta-sec"><h2>Hires</h2><p>{data.hires ? "People hired since January, from the Bonuses sheet." : "How many people joined each month."}</p></div>
          <div>
            <section className="chart-card">
              <h3>Hires by month <span className="chart-total">2026</span></h3>
              <div className="ta-cols">
                {monthly.map((m) => (
                  <div className="ta-col" key={m.month}>
                    <b>{m.hires || ""}</b>
                    <div className="ta-colbar" style={{ height: `${(m.hires / maxHires) * 100}%` }} />
                    <span>{m.month}</span>
                  </div>
                ))}
              </div>
            </section>
            {data.hires && (
              <section className="chart-card" style={{ marginTop: 14 }}>
                <h3>Hires since January <span className="chart-total">{data.hires.length} people · newest first</span></h3>
                <div className="ta-scroll ta-tall">
                  <table className="ta-table">
                    <thead><tr><th>Hire date</th><th>Client</th><th>Role</th></tr></thead>
                    <tbody>
                      {data.hires.map((h, i) => (
                        <tr key={i}><td>{fmtDate(h.date)}</td><td>{h.client === "Staff" ? "Puzzle (staff)" : h.client}</td><td>{h.role}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="ta-block">
          <div className="ta-sec"><h2>How 2026 roles ended up</h2><p>Fill rate {pct(totals.fillRate)}: filled ÷ (filled + lost). Cancelled roles are not counted.</p></div>
          <section className="chart-card">
            <h3>Positions by outcome <span className="chart-total">{totals.roles} roles opened since January 2026</span></h3>
            {byStatus.map((s) => (
              <div className="ta-row" key={s.status}>
                <span className="g-name">{s.status}<small>{s.roles} {s.roles === 1 ? "role" : "roles"}</small></span>
                <div className="ta-track"><div className="ta-seg" style={{ width: `${(s.positions / maxStatus) * 100}%`, background: s.status === "Filled" ? "var(--ok)" : s.status === "Cancelled" || s.status === "Lost" || s.status === "Dropped" ? "var(--seg-muted)" : "var(--blue)" }} /></div>
                <span className="ta-val">{s.positions}</span>
              </div>
            ))}
          </section>
        </div>

        <p className="ta-note">Billing rates and salaries are never loaded into this page.</p>
      </main>
    </>
  );
}
