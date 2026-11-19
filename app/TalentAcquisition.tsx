import type { HiringData, Role } from "@/lib/hiring";
import { OPEN_STATUSES } from "@/lib/hiring";
import type { AshbyData } from "@/lib/ashby";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const tone = (s: string) => (s === "Active" ? "ok" : s === "On Hold" ? "bad" : "warn");

export default function TalentAcquisition({ data, ashby = null }: { data: HiringData; ashby?: AshbyData | null }) {
  const { totals, open, byClient, openRoles, filled, monthly, byStatus, today } = data;
  const age = (r: Role) => (r.opened ? dayDiff(r.opened, today) : null);
  const stale = openRoles.filter((r) => OPEN_STATUSES.includes(r.status) && (age(r) ?? 0) > 30).length;
  const headline =
    open.openPositions === 0
      ? "No open positions right now"
      : `${open.openPositions} ${open.openPositions === 1 ? "position" : "positions"} open across ${open.openRoles} ${open.openRoles === 1 ? "role" : "roles"}${open.holdRoles ? ` · ${open.holdRoles} on hold` : ""}`;
  const briefTone = stale > 0 ? "is-warn" : "is-ok";

  const maxClient = Math.max(1, ...byClient.map((c) => c.open + c.hold + c.presales));
  const pipeline = openRoles.filter((r) => r.internal + r.submitted + r.inProcess > 0);
  const pipeMax = Math.max(1, ...pipeline.flatMap((r) => [r.internal, r.submitted, r.inProcess]));
  const maxHires = Math.max(1, ...monthly.map((m) => m.hires));
  const recent = filled.filter((r) => r.daysToStart !== null).slice(0, 14);
  const maxDays = Math.max(1, ...recent.map((r) => r.daysToStart as number));
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
          <div className="ta-stat"><b>{open.openPositions}</b><span>Open positions ({open.openRoles} roles)</span></div>
          <div className="ta-stat"><b>{ashby ? ashby.totals.total : open.submitted}</b><span>{ashby ? "Candidates in SDM interview, submitted or in client interview (Ashby)" : "Candidates submitted on open roles"}</span></div>
          <div className="ta-stat"><b>{totals.hires}</b><span>Hires in 2026 ({totals.filledRoles} roles filled)</span></div>
          <div className="ta-stat"><b>{pct(totals.fillRate)}</b><span>Fill rate: filled ÷ (filled + cancelled + lost)</span></div>
          <div className="ta-stat"><b>{data.avgDaysToStart === null ? "—" : `${Math.round(data.avgDaysToStart)} d`}</b><span>Average time to hire</span></div>
        </div>

        <div className="ta-grid">
          <section className="chart-card">
            <h3>Open positions by client <span className="chart-total">blue open · red on hold · cyan in sales</span></h3>
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

          {ashby ? (
            <section className="chart-card">
              <h3>Hiring pipeline <span className="chart-total">Ashby · open roles · candidates in the last three stages</span></h3>
              {ashby.roles.filter((r) => r.total > 0).length === 0 && <p className="ta-note">No candidates in these stages yet.</p>}
              {ashby.roles.filter((r) => r.total > 0).map((r) => (
                <div className="ta-pipe" key={r.id}>
                  <span className="g-name">{r.title}</span>
                  <div>
                    {([[r.sdm, "#8cc63f", "SDM interview"], [r.submitted, "#29abe0", "Submitted to the client"], [r.client, "#00406c", "Client interview"]] as [number, string, string][]).map(([n, col, lab]) => (
                      <div className="ta-line" key={lab} title={`${lab}: ${n}`}>
                        <span className="ta-bar" style={{ width: `${(n / Math.max(1, ...ashby.roles.flatMap((x) => [x.sdm, x.submitted, x.client]))) * 100}%`, background: col }} />
                        <b>{n}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="ta-legend">
                <span><i style={{ background: "#8cc63f" }} />SDM interview ({ashby.totals.sdm})</span>
                <span><i style={{ background: "#29abe0" }} />Submitted to the client ({ashby.totals.submitted})</span>
                <span><i style={{ background: "#00406c" }} />Client interview ({ashby.totals.client})</span>
              </div>
            </section>
          ) : (
          <section className="chart-card">
            <h3>Hiring pipeline <span className="chart-total">per open role</span></h3>
            {pipeline.length === 0 && <p className="ta-note">No candidates in process yet.</p>}
            {pipeline.map((r) => (
              <div className="ta-pipe" key={r.key}>
                <span className="g-name">{r.title}<small>{r.client}</small></span>
                <div>
                  {([[r.internal, "#8cc63f", "Internal interviews"], [r.submitted, "#29abe0", "Submitted"], [r.inProcess, "#00406c", "In process with client"]] as [number, string, string][]).map(([n, col, lab]) => (
                    <div className="ta-line" key={lab} title={`${lab}: ${n}`}>
                      <span className="ta-bar" style={{ width: `${(n / pipeMax) * 100}%`, background: col }} />
                      <b>{n}</b>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="ta-legend">
              <span><i style={{ background: "#8cc63f" }} />Internal interviews</span>
              <span><i style={{ background: "#29abe0" }} />Submitted</span>
              <span><i style={{ background: "#00406c" }} />In process with client</span>
            </div>
          </section>
          )}

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

          <section className="chart-card">
            <h3>How roles ended up <span className="chart-total">positions, roles opened in 2026 and carried over</span></h3>
            {byStatus.map((s) => (
              <div className="ta-row" key={s.status}>
                <span className="g-name">{s.status}<small>{s.roles} {s.roles === 1 ? "role" : "roles"}</small></span>
                <div className="ta-track"><div className="ta-seg" style={{ width: `${(s.positions / maxStatus) * 100}%`, background: s.status === "Filled" ? "var(--ok)" : s.status === "Cancelled" || s.status === "Lost" || s.status === "Dropped" ? "var(--seg-muted)" : "var(--blue)" }} /></div>
                <span className="ta-val">{s.positions}</span>
              </div>
            ))}
            <p className="ta-note">{totals.opened2026} roles opened in 2026 · {totals.carried} carried over from 2025</p>
          </section>
        </div>

        {recent.length > 0 && (
          <section className="chart-card">
            <h3>Time to hire <span className="chart-total">days from opening to hire date · latest {recent.length} roles</span></h3>
            {recent.map((r) => (
              <div className="ta-row" key={r.key}>
                <span className="g-name">{r.title}<small>{r.client}{r.positions > 1 ? ` · ${r.positions} positions` : ""} · starts {fmtDate(r.startDate)}</small></span>
                <div className="ta-track"><div className="ta-seg" style={{ width: `${((r.daysToStart as number) / maxDays) * 100}%`, background: "var(--blue)" }} /></div>
                <span className="ta-val">{r.daysToStart}d</span>
              </div>
            ))}
            <p className="ta-note">Hire dates come from the sheet's Closed Date, or from the "starting on…" note when it is still =today().</p>
          </section>
        )}

        <section className="chart-card">
          <h3>Open roles</h3>
          <div className="ta-scroll">
            <table className="ta-table">
              <thead>
                <tr><th>Role</th><th>Owner</th><th className="c">Age</th><th className="c">Positions</th><th>Status</th><th className="c">Internal</th><th className="c">Submitted</th><th className="c">In process</th><th>Comment</th></tr>
              </thead>
              <tbody>
                {openRoles.map((r) => (
                  <tr key={r.key}>
                    <td><b>{r.title}</b><small>{r.client}</small></td>
                    <td>{r.owner || "—"}</td>
                    <td className="c">{age(r) === null ? "—" : `${age(r)}d`}</td>
                    <td className="c">{r.positions}</td>
                    <td><span className={`pill ${tone(r.status)}`}>{r.status}</span></td>
                    <td className="c">{r.internal}</td>
                    <td className="c">{r.submitted}</td>
                    <td className="c">{r.inProcess}</td>
                    <td className="ta-comment">{r.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <p className="ta-note">Billing rates and salaries are never loaded into this page.</p>
      </main>
    </>
  );
}
