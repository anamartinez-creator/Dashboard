import type { HiringData, Role } from "@/lib/hiring";
import { OPEN_STATUSES, lobGroup } from "@/lib/hiring";

const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const tone = (s: string) => (s === "Active" ? "ok" : s === "On Hold" ? "bad" : "warn");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const STALE_DAYS = 30;

export default function TalentAcquisition({ data }: { data: HiringData }) {
  const { totals, open, openRoles, monthly, byStatus, today } = data;
  const age = (r: Role) => (r.opened ? dayDiff(r.opened, today) : null);
  const aging = openRoles.filter((r) => OPEN_STATUSES.includes(r.status) && (age(r) ?? 0) > STALE_DAYS);
  const onHold = openRoles.filter((r) => r.status === "On Hold");
  const active = openRoles.filter((r) => OPEN_STATUSES.includes(r.status));
  const best = monthly.reduce((a, m) => (m.hires > a.hires ? m : a), { month: "", hires: 0 });
  const agingPositions = aging.reduce((n, r) => n + r.positions, 0);

  // Three plain sentences for the top of the page
  const summary = [
    `${plural(totals.hires, "person", "people")} hired since January${best.hires ? `; ${best.month} was the strongest month with ${best.hires}` : ""}.`,
    open.openPositions === 0
      ? "Nothing is open right now."
      : `${plural(open.openPositions, "position", "positions")} open across ${plural(open.openRoles, "role", "roles")}${aging.length ? `, ${aging.length} of them open for more than ${STALE_DAYS} days` : ", none open for more than 30 days"}.`,
    `${pct(totals.fillRate)} of the roles that closed ended in a hire (cancelled roles are not counted).`,
  ];
  const briefTone = aging.length > 0 || onHold.length > 0 ? "is-warn" : "is-ok";

  const maxHires = Math.max(1, ...monthly.map((m) => m.hires));
  const histMax = Math.max(1, ...data.clientHistory.flatMap((g) => g.clients.map((c) => c.total)));
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.positions));

  return (
    <>
      <div className="hero">
        <div className="hero-in">
          <div className="hero-bar">
            <h1 className="hero-title">Talent Acquisition</h1>
            <p className="owner">Source: Active Job Openings and Bonuses sheets<br />Latest tab: {data.latestTab}</p>
          </div>
          <div className={`brief ${briefTone}`}>
            <div className="brief-main">
              <p className="brief-eyebrow">Executive summary</p>
              <h2 className="brief-title">{summary[0]}</h2>
              <p className="ta-sum">{summary[1]}<br />{summary[2]}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="ta">
        <div className="ta-stats">
          <div className="ta-stat"><b>{totals.hires}</b><span>Hires since January</span></div>
          <div className="ta-stat"><b>{open.openPositions}</b><span>Open positions ({plural(open.openRoles, "role", "roles")})</span></div>
          <div className="ta-stat"><b>{pct(totals.fillRate)}</b><span>Fill rate</span></div>
          <div className="ta-stat"><b>{data.avgDaysToStart === null ? "—" : `${Math.round(data.avgDaysToStart)} d`}</b><span>Average time to hire</span></div>
          <div className={`ta-stat${aging.length ? " is-warn" : ""}`}><b>{aging.length}</b><span>Roles open over {STALE_DAYS} days{agingPositions > aging.length ? ` (${agingPositions} positions)` : ""}</span></div>
        </div>

        {(aging.length > 0 || onHold.length > 0) && (
          <div className="ta-block">
            <div className="ta-sec"><h2>Needs attention</h2><p>Roles that have been open the longest, and roles on hold.</p></div>
            <section className="chart-card">
              <div className="ta-scroll">
                <table className="ta-table">
                  <thead><tr><th>Role</th><th>Client</th><th className="c">Open for</th><th>Status</th></tr></thead>
                  <tbody>
                    {[...aging, ...onHold].sort((a, b) => (age(b) ?? 0) - (age(a) ?? 0)).map((r) => (
                      <tr key={r.key}>
                        <td><b>{r.title}</b></td>
                        <td>{r.client}</td>
                        <td className="c">{age(r) === null ? "—" : `${age(r)} days`}</td>
                        <td><span className={`pill ${tone(r.status)}`}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        <div className="ta-block">
          <div className="ta-sec"><h2>Active roles</h2><p>{plural(active.length, "role", "roles")} being hired for right now, oldest first, and where their candidates are.</p></div>
          <section className="chart-card">
            {active.length === 0 && <p className="ta-note">No active roles right now.</p>}
            {active.length > 0 && (
              <div className="ta-scroll">
                <table className="ta-table">
                  <thead>
                    <tr><th>Role</th><th>Client</th><th>Team</th><th className="c">Open for</th><th className="c">Positions</th><th>Status</th><th className="c">Internal</th><th className="c">Submitted</th><th className="c">With client</th></tr>
                  </thead>
                  <tbody>
                    {active.map((r) => (
                      <tr key={r.key}>
                        <td><b>{r.title}</b></td>
                        <td>{r.client}</td>
                        <td>{lobGroup(r.lob)}</td>
                        <td className="c">{age(r) === null ? "—" : `${age(r)}d`}</td>
                        <td className="c">{r.positions}</td>
                        <td><span className={`pill ${tone(r.status)}`}>{r.status}</span></td>
                        <td className="c"><span className={`ta-n${r.internal ? "" : " is-0"}`}>{r.internal}</span></td>
                        <td className="c"><span className={`ta-n${r.submitted ? "" : " is-0"}`}>{r.submitted}</span></td>
                        <td className="c"><span className={`ta-n${r.inProcess ? "" : " is-0"}`}>{r.inProcess}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="ta-block">
          <div className="ta-sec"><h2>Hiring momentum</h2><p>People hired each month this year.</p></div>
          <section className="chart-card">
            <h3>Hires by month <span className="chart-total">{totals.hires} in total</span></h3>
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
        </div>

        <div className="ta-block">
          <div className="ta-sec"><h2>Demand by client</h2><p>Positions each client has opened since January, and where they stand today. Click a client to see its roles with opening and closing dates. A role without a closing date keeps counting days as open until the sheet is edited.</p></div>
          <div className="ta-grid">
            {data.clientHistory.map((g) => (
              <section className="chart-card" key={g.group}>
                <h3>{g.group} <span className="chart-total">{g.clients.reduce((n, c) => n + c.total, 0)} openings</span></h3>
                {g.clients.map((c) => (
                  <details className="ta-cl" key={c.client}>
                    <summary className="ta-row">
                      <span className="g-name">{c.client}</span>
                      <div className="ta-track ta-track-tip">
                        {([[c.filled, "var(--ok)", "Filled"], [c.open, "var(--blue)", "Still open"], [c.cancelled, "var(--seg-muted)", "Cancelled"], [c.lost, "var(--bad)", "Lost"], [c.dropped, "#dfe4ea", "Dropped"]] as [number, string, string][])
                          .filter(([n]) => n > 0)
                          .map(([n, col, lab]) => (
                            <div key={lab} className="ta-seg" data-tip={`${lab}: ${n} ${n === 1 ? "opening" : "openings"}`} style={{ width: `${(n / histMax) * 100}%`, background: col }} />
                          ))}
                      </div>
                      <span className="ta-val">{c.total}</span>
                    </summary>
                    <table className="ta-table ta-cl-table">
                      <thead><tr><th>Role</th><th>Status</th><th className="c">Pos.</th><th>Opened</th><th>Closed</th><th className="c">Days</th></tr></thead>
                      <tbody>
                        {c.roles.map((r, i) => (
                          <tr key={i}>
                            <td><b>{r.title}</b></td>
                            <td><span className={`pill ${r.status === "Filled" ? "ok" : r.status === "Active" ? "ok" : r.status === "Cancelled" || r.status === "Lost" || r.status === "Dropped" ? "bad" : "warn"}`}>{r.status}</span></td>
                            <td className="c">{r.positions}</td>
                            <td>{r.opened ? fmtDate(r.opened) : "—"}</td>
                            <td>{r.closed ? fmtDate(r.closed) : "—"}</td>
                            <td className="c" title={r.counting ? "No closing date recorded: still counting until the sheet is edited" : undefined}>{r.days === null ? "—" : `${r.days}d`}{r.counting && r.days !== null ? <small className="ta-count">counting</small> : null}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ))}
              </section>
            ))}
          </div>
          <div className="ta-legend">
            <span><i style={{ background: "var(--ok)" }} />Filled</span>
            <span><i style={{ background: "var(--blue)" }} />Still open</span>
            <span><i style={{ background: "var(--seg-muted)" }} />Cancelled</span>
            <span><i style={{ background: "var(--bad)" }} />Lost</span>
            <span><i style={{ background: "#dfe4ea", border: "1px solid #b9c2cc" }} />Dropped: the role disappeared from the tracker without a final status</span>
          </div>
        </div>

        <div className="ta-block">
          <div className="ta-sec"><h2>Outcomes</h2><p>What happened to the {totals.roles} roles opened since January.</p></div>
          <section className="chart-card">
            {byStatus.map((s) => (
              <div className="ta-row" key={s.status}>
                <span className="g-name">{s.status}<small>{plural(s.roles, "role", "roles")}</small></span>
                <div className="ta-track ta-track-tip"><div className="ta-seg" tabIndex={0} data-tip={`${s.status}: ${s.positions} ${s.positions === 1 ? "position" : "positions"} in ${plural(s.roles, "role", "roles")}`} style={{ width: `${(s.positions / maxStatus) * 100}%`, background: s.status === "Filled" ? "var(--ok)" : s.status === "Cancelled" || s.status === "Lost" || s.status === "Dropped" ? "var(--seg-muted)" : "var(--blue)" }} /></div>
                <span className="ta-val">{s.positions}</span>
              </div>
            ))}
            <p className="ta-note">Fill rate = filled ÷ (filled + lost). Cancelled roles are not counted. Dropped roles disappeared from the tracker without a final status.</p>
          </section>
        </div>

        <div className="ta-block">
          <div className="ta-sec"><h2>Detail</h2><p>The full list of hires behind the numbers above.</p></div>
          {data.hires && (
            <details className="chart-card ta-details">
              <summary>Hires since January ({data.hires.length})</summary>
              <div className="ta-scroll ta-tall">
                <table className="ta-table">
                  <thead><tr><th>Hire date</th><th>Client</th><th>Role</th></tr></thead>
                  <tbody>
                    {data.hires.map((h, i) => (
                      <tr key={i}>
                        <td>{new Date(h.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</td>
                        <td>{h.client === "Staff" ? "Puzzle (staff)" : h.client}</td>
                        <td>{h.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>

        <p className="ta-note">Billing rates, salaries, names and bonus amounts are never loaded into this page.</p>
      </main>
    </>
  );
}
