import AutoRefresh from "./AutoRefresh";
import { STAGES, titleMatch, type AshbyData, type AshbyRole } from "@/lib/ashby";
import type { HiringData, Role } from "@/lib/hiring";
import { OPEN_STATUSES, lobGroup } from "@/lib/hiring";

const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const tone = (s: string) => (s === "Active" ? "ok" : s === "On Hold" ? "bad" : "warn");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const STALE_DAYS = 30;

export default function TalentAcquisition({ data, ashby = null }: { data: HiringData; ashby?: AshbyData | null }) {
  const { totals, open, openRoles, monthly, byStatus, today } = data;
  const age = (r: Role) => (r.opened ? dayDiff(r.opened, today) : null);
  const aging = openRoles.filter((r) => OPEN_STATUSES.includes(r.status) && (age(r) ?? 0) >= STALE_DAYS);
  const onHold = openRoles.filter((r) => r.status === "On Hold" && (age(r) ?? 0) >= STALE_DAYS);
  const active = openRoles.filter((r) => OPEN_STATUSES.includes(r.status));
  const NO_SUBMIT_DAYS = 14;
  const noSubmit = openRoles.filter((r) => OPEN_STATUSES.includes(r.status) && (age(r) ?? 0) >= NO_SUBMIT_DAYS && (age(r) ?? 0) < STALE_DAYS && !r.submitted);
  const reason = (r: Role) => {
    const a = age(r) ?? 0;
    if (a >= STALE_DAYS && !r.submitted) return `${STALE_DAYS}+ days, no submittals`;
    if (a >= STALE_DAYS) return `${STALE_DAYS}+ days open`;
    return `${NO_SUBMIT_DAYS}+ days, no submittals`;
  };
  const best = monthly.reduce((a, m) => (m.hires > a.hires ? m : a), { month: "", hires: 0 });
  const agingPositions = aging.reduce((n, r) => n + r.positions, 0);

  // Three plain sentences for the top of the page
  const summary = [
    `${plural(totals.hires, "person", "people")} hired since January${best.hires ? `; ${best.month} was the strongest month with ${best.hires}` : ""}.`,
    open.openPositions === 0
      ? "Nothing is open right now."
      : `${plural(open.openPositions, "position", "positions")} open across ${plural(open.openRoles, "role", "roles")}${aging.length ? `, ${aging.length} of them open for ${STALE_DAYS} days or more` : `, none open for ${STALE_DAYS} days or more`}.`,
    `${pct(totals.fillRate)} of the roles that closed ended in a hire (cancelled roles are not counted).`,
  ];
  const briefTone = aging.length > 0 || onHold.length > 0 || noSubmit.length > 0 ? "is-warn" : "is-ok";

  // Quarter-over-quarter hires (current quarter is partial)
  const curQ = Math.floor((parseInt(today.slice(5, 7), 10) - 1) / 3);
  const quarters = [0, 1, 2, 3]
    .filter((q) => q * 3 < monthly.length)
    .map((q) => ({ q: `Q${q + 1}`, hires: monthly.slice(q * 3, q * 3 + 3).reduce((n, m) => n + m.hires, 0), partial: q === curQ }));

  // Link each active role to its Ashby job by title (Ashby titles do not name the client)
  const ashbyFor = new Map<string, { job: AshbyRole; shared: number }>();
  const matchedJobs = new Set<string>();
  if (ashby) {
    for (const job of ashby.roles) {
      const cands = active.map((r) => ({ r, m: titleMatch(r.title, job.title) })).filter((x) => x.m > 0);
      const bestM = Math.max(0, ...cands.map((x) => x.m));
      const best = cands.filter((x) => x.m === bestM);
      for (const x of best) {
        const prev = ashbyFor.get(x.r.key);
        if (!prev || bestM >= 2) ashbyFor.set(x.r.key, { job, shared: best.length });
        matchedJobs.add(job.id);
      }
    }
  }
  const PRE = STAGES.slice(0, 4);
  const CLIENT = STAGES.slice(4, 9);
  const pipeTotal = ashby ? STAGES.reduce((n, k) => n + ashby.stages[k], 0) : 0;
  const pipeMax = ashby ? Math.max(1, ...STAGES.map((k) => ashby.stages[k])) : 1;
  const jobClient = new Map<string, string>();
  for (const r of active) { const m = ashbyFor.get(r.key); if (m && m.shared === 1) jobClient.set(m.job.id, r.client); }
  const unmatched = ashby ? ashby.roles.filter((j) => !matchedJobs.has(j.id)) : [];

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
          <div className={`ta-stat${aging.length ? " is-warn" : ""}`}><b>{aging.length}</b><span>Roles open {STALE_DAYS} days or more{agingPositions > aging.length ? ` (${agingPositions} positions)` : ""}</span></div>
        </div>

        {(aging.length > 0 || onHold.length > 0 || noSubmit.length > 0) && (
          <div className="ta-block">
            <div className="ta-sec"><h2>Needs attention</h2><p>Roles open 30 days or more, and roles open 2 weeks or more with no submittal yet.</p></div>
            <section className="chart-card">
              <div className="ta-scroll">
                <table className="ta-table">
                  <thead><tr><th>Role</th><th>Client</th><th className="c">Open for</th><th>Status</th><th>Why</th></tr></thead>
                  <tbody>
                    {[...aging, ...onHold, ...noSubmit].sort((a, b) => (age(b) ?? 0) - (age(a) ?? 0)).map((r) => (
                      <tr key={r.key}>
                        <td><b>{r.title}</b></td>
                        <td>{r.client}</td>
                        <td className="c">{age(r) === null ? "—" : `${age(r)} days`}</td>
                        <td><span className={`pill ${tone(r.status)}`}>{r.status}</span></td>
                        <td>{reason(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {ashby && (
          <div className="ta-block">
            <div className="ta-sec"><h2>Candidate pipeline</h2><p>Where the candidates for our open jobs are today, from Ashby. Stages are grouped: with Puzzle before submission, with the client, and offers.</p></div>
            <div className="ta-grid">
              <section className="chart-card">
                <h3>Funnel <span className="chart-total">{pipeTotal} candidates in process</span></h3>
                {STAGES.map((n) => (
                  <div className="ta-row ta-fun" key={n}>
                    <span className="g-name">{n}</span>
                    <div className="ta-track"><div className="ta-seg" style={{ width: `${(ashby.stages[n] / pipeMax) * 100}%`, background: PRE.includes(n) ? "var(--blue)" : n === "Offer" ? "var(--ok)" : "var(--cyan, #29abe0)" }} /></div>
                    <span className="ta-val">{ashby.stages[n]}</span>
                  </div>
                ))}
              </section>
              <section className="chart-card">
                <h3>By job</h3>
                <div className="ta-scroll">
                  <table className="ta-table">
                    <thead><tr><th>Job</th><th>Client</th><th className="c">With Puzzle</th><th className="c">With client</th><th className="c">Offer</th></tr></thead>
                    <tbody>
                      {ashby.roles.map((j) => {
                        const sum = (names: string[]) => names.reduce((n, k) => n + j.stages[k], 0);
                        return (
                          <tr key={j.id}>
                            <td><b>{j.title.replace(/\s*\(PZ-?\d+\)/i, "")}</b></td>
                            <td>{jobClient.get(j.id) ?? "—"}</td>
                            <td className="c"><span className={`ta-n${sum(PRE) ? "" : " is-0"}`}>{sum(PRE)}</span></td>
                            <td className="c"><span className={`ta-n${sum(CLIENT) ? "" : " is-0"}`}>{sum(CLIENT)}</span></td>
                            <td className="c"><span className={`ta-n${j.stages.Offer ? "" : " is-0"}`}>{j.stages.Offer}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <details className="ta-details" style={{ marginTop: 12 }}>
              <summary>Every stage, job by job</summary>
              <section className="chart-card">
                <div className="ta-scroll">
                  <table className="ta-table ta-stage-table">
                    <thead><tr><th>Job</th>{STAGES.map((n) => <th className="c" key={n}>{n}</th>)}</tr></thead>
                    <tbody>
                      {ashby.roles.map((j) => (
                        <tr key={j.id}>
                          <td><b>{j.title.replace(/\s*\(PZ-?\d+\)/i, "")}</b></td>
                          {STAGES.map((n) => <td className="c" key={n}><span className={`ta-n${j.stages[n] ? "" : " is-0"}`}>{j.stages[n]}</span></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </details>
          </div>
        )}

        <div className="ta-block">
          <div className="ta-sec"><h2>Active roles</h2><p>{plural(active.length, "role", "roles")} being hired for right now, oldest first, and where their candidates are.</p></div>
          <details className="ta-details ta-active"><summary>Show the {active.length} active roles</summary>
          <section className="chart-card">
            {active.length === 0 && <p className="ta-note">No active roles right now.</p>}
            {active.length > 0 && (
              <div className="ta-scroll">
                <table className="ta-table">
                  <thead>
                    <tr><th>Role</th><th>Client</th><th>Team</th><th className="c">Open for</th><th className="c">Positions</th><th>Status</th><th className="c">Internal</th><th className="c">Submitted</th><th className="c">With client</th>{ashby && <th className="c" title="Candidates in the SDM interview, submitted to the client or in a client interview, read from Ashby">In process (Ashby)</th>}</tr>
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
                        {ashby && (() => {
                          const m = ashbyFor.get(r.key);
                          if (!m) return <td className="c" title="No job with this title in Ashby">—</td>;
                          const j = m.job;
                          return (
                            <td className="c" title={`${j.title}: ${j.sdm} in SDM interview · ${j.submitted} submitted to the client · ${j.client} in client interview${m.shared > 1 ? ` (shared with ${m.shared - 1} other role${m.shared > 2 ? "s" : ""} with the same title)` : ""}`}>
                              <span className={`ta-n${j.total ? "" : " is-0"}`}>{j.total}</span>{m.shared > 1 ? <small className="ta-count">shared</small> : null}
                            </td>
                          );
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {unmatched.length > 0 && (
            <p className="ta-note">Open in Ashby but with no active role of the same title in the sheet: {unmatched.map((j) => `${j.title} (${j.total} in process)`).join("; ")}.</p>
          )}
          </details>
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
            <div className="ta-q">
              {quarters.map((x, i) => {
                const prev = i > 0 ? quarters[i - 1].hires : null;
                const d = prev === null ? null : x.hires - prev;
                return (
                  <div className="ta-q-i" key={x.q}>
                    <span>{x.q}{x.partial ? " (so far)" : ""}</span>
                    <b>{x.hires}</b>
                    {d !== null && !x.partial && <em className={d >= 0 ? "up" : "down"}>{d >= 0 ? "▲" : "▼"} {Math.abs(d)} vs {quarters[i - 1].q}</em>}
                  </div>
                );
              })}
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

        <footer className="foot">
          Updated {new Date().toLocaleString("en-US", { timeZone: "America/Tegucigalpa", dateStyle: "medium", timeStyle: "short" })}
          {" · "}refreshes automatically every minute · <AutoRefresh scope="/talent-acquisition" />
        </footer>
      </main>
    </>
  );
}
