import AutoRefresh from "./AutoRefresh";
import TaTabs from "./TaTabs";
import { STAGES, titleMatch, type AshbyData, type AshbyRole } from "@/lib/ashby";
import type { HiringData, Role } from "@/lib/hiring";
import type { PendingStart } from "@/lib/notion";
import { OPEN_STATUSES, lobGroup } from "@/lib/hiring";

const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const tone = (s: string) => (s === "Active" ? "ok" : s === "On Hold" ? "bad" : "warn");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const STALE_DAYS = 30;
const STATUS_SHORT: Record<string, string> = { "Pend Functional Spec": "Pending spec", "Sales/In progress": "In sales" };
const SHORT: Record<string, string> = { "Puzzle Internal Assessment": "Internal assessment", "Service Delivery Manager Interview": "SDM interview", "Ready to Submit": "Ready to submit", "Submitted to the client": "Submitted", "Client initial Interview": "Client interview", "Client Assessment": "Client assessment", "2nd Client Interview": "2nd interview", "Waiting for Final Feedback": "Final feedback", "Offer": "Offer" };

export default function TalentAcquisition({ data, ashby = null, pending = null }: { data: HiringData; ashby?: AshbyData | null; pending?: PendingStart[] | null }) {
  const { totals, open, openRoles, monthly, today } = data;
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

  // Three plain sentences for the top of the page
  const activePositions = active.reduce((n, r) => n + r.positions, 0);
  const attention = aging.length + onHold.length + noSubmit.length;
  const oldest = [...active].sort((a, b) => (age(b) ?? 0) - (age(a) ?? 0))[0];
  const withClientStages = ["Submitted to the client", "Client initial Interview", "Client Assessment", "2nd Client Interview", "Waiting for Final Feedback"];
  const beforeSubmit = ["Puzzle Internal Assessment", "Service Delivery Manager Interview", "Ready to Submit"];
  const sumStages = (names: string[]) => (ashby ? names.reduce((n, k) => n + (ashby.stages[k] ?? 0), 0) : 0);
  // This week = Monday to Sunday of the current week
  const dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
  const addD = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const wkStart = addD(today, -dow);
  const wkEnd = addD(wkStart, 6);
  const inWeek = (d: string | null | undefined) => !!d && d >= wkStart && d <= wkEnd;
  const allRoles = data.clientHistory.flatMap((g) => g.clients.flatMap((c) => c.roles.map((r) => ({ ...r, client: c.client }))));
  const openedWk = allRoles.filter((r) => inWeek(r.opened));
  const closedWk = allRoles.filter((r) => inWeek(r.closed) && ["Filled", "Cancelled", "Lost"].includes(r.status));
  const hiresWk = (data.hires ?? []).filter((h) => inWeek(h.date));
  const startingSoon = pending ?? [];
  const attentionList = [...aging, ...onHold, ...noSubmit].slice(0, 4);
  const offers = ashby?.stages.Offer ?? 0;
  const summary = [
    active.length === 0
      ? "No roles are being hired for right now."
      : `${plural(active.length, "role is", "roles are")} being hired for right now (${plural(activePositions, "opening", "openings")}).`,
  ];
  const prevStart = addD(wkStart, -7);
  const prevEnd = addD(wkStart, -1);
  const hiresPrev = (data.hires ?? []).filter((h) => h.date >= prevStart && h.date <= prevEnd).length;
  const diff = hiresWk.length - hiresPrev;
  const weekCards: { n: number | string; label: string; note: string }[] = [
    { n: hiresWk.length, label: "Hires this week", note: data.hires ? (diff === 0 ? "same as last week" : `${diff > 0 ? "+" : ""}${diff} vs last week`) : "" },
    { n: openedWk.length, label: "Roles opened", note: `${closedWk.length} closed` },
    { n: pending ? pending.length : "—", label: "Pending to start", note: pending && pending[0] ? `next: ${fmtDate(pending[0].startDate).replace(/, \d{4}$/, "")}` : "" },
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
  const unmatched = ashby ? ashby.roles.filter((j) => !matchedJobs.has(j.id)) : [];
  // Client of an Ashby-only job: the one client whose sheet roles (any status) have a similar title
  const guessClient = (title: string) => {
    const hits = new Set<string>();
    for (const g of data.clientHistory) for (const c of g.clients) for (const r of c.roles) if (titleMatch(r.title, title) > 0) hits.add(c.client);
    return hits.size === 1 ? [...hits][0] : "—";
  };

  // Roles by the quarter they were opened, and how they ended up
  const byQuarter = [0, 1, 2, 3].filter((q) => q <= curQ).map((q) => {
    const row = { q: `Q${q + 1}`, partial: q === curQ, opened: 0, filled: 0, cancelled: 0, lost: 0, dropped: 0, open: 0 };
    for (const g of data.clientHistory) for (const c of g.clients) for (const r of c.roles) {
      if (!r.opened || Math.floor((parseInt(r.opened.slice(5, 7), 10) - 1) / 3) !== q) continue;
      row.opened += 1;
      if (r.status === "Filled") row.filled += 1;
      else if (r.status === "Cancelled") row.cancelled += 1;
      else if (r.status === "Lost") row.lost += 1;
      else if (r.status === "Dropped") row.dropped += 1;
      else row.open += 1;
    }
    return row;
  });

  const yr = byQuarter.reduce((t, x) => ({ opened: t.opened + x.opened, filled: t.filled + x.filled, cancelled: t.cancelled + x.cancelled, lost: t.lost + x.lost, open: t.open + x.open }), { opened: 0, filled: 0, cancelled: 0, lost: 0, open: 0 });

  const maxHires = Math.max(1, ...monthly.map((m) => m.hires));
  const histMax = Math.max(1, ...data.clientHistory.flatMap((g) => g.clients.map((c) => c.total)));

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
              <p className="brief-eyebrow">This week · {fmtDate(wkStart).replace(/, \d{4}$/, "")} – {fmtDate(wkEnd).replace(/, \d{4}$/, "")}</p>
              <h2 className="brief-title">{summary[0]}</h2>
              <div className="ta-cards ta-bento">
                {weekCards.map((c) => {
                  const rows: { a: string; b: string; c: string }[] =
                    c.label === "Pending to start" && pending
                      ? pending.map((h) => ({ a: h.name, b: `${h.role} · ${h.client}`, c: `${fmtDate(h.startDate)} · ${h.daysUntil === 1 ? "tomorrow" : `in ${h.daysUntil} days`}` }))
                      : c.label === "Roles opened"
                        ? [
                            ...openedWk.map((r) => ({ a: r.title, b: `${r.client} · opened`, c: r.opened ? fmtDate(r.opened) : "" })),
                            ...closedWk.map((r) => ({ a: r.title, b: `${r.client} · ${r.status.toLowerCase()}`, c: r.closed ? fmtDate(r.closed) : "" })),
                          ]
                        : [];
                  return rows.length > 0 ? (
                    <details key={c.label} className={`ta-card ta-card-open bt-${c.label.split(" ")[0].toLowerCase()}`}>
                      <summary>
                        <b>{c.n}</b><span>{c.label}</span>{c.note && <small>{c.note}</small>}
                        <em className="ta-card-hint">Click for details</em>
                      </summary>
                      <ul className="ta-pend-list">
                        {rows.map((r, i) => (
                          <li key={i}><span className="pn">{r.a}</span><span className="pr">{r.b}</span><span className="pd">{r.c}</span></li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <div key={c.label} className={`ta-card bt-${c.label.split(" ")[0].toLowerCase()}`}><b>{c.n}</b><span>{c.label}</span>{c.note && <small>{c.note}</small>}</div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <TaTabs
        footer={
          <>
        <footer className="foot">
          Updated {new Date().toLocaleString("en-US", { timeZone: "America/Tegucigalpa", dateStyle: "medium", timeStyle: "short" })}
          {" · "}refreshes automatically every minute · <AutoRefresh scope="/talent-acquisition" />
        </footer>
          </>
        }
        tabs={[
          { id: "roles", label: "Active roles & pipeline", node: (<>
        <div className="ta-block" id="roles">
          <div className="ta-sec"><h2>Active roles</h2><p>{plural(active.length, "role", "roles")} being hired for right now, oldest first, and where their candidates are in the pipeline.</p></div>
          <section className="chart-card">
            {active.length === 0 && <p className="ta-note">No active roles right now.</p>}
            {active.length > 0 && (
              <div className="ta-scroll">
                <table className={`ta-table${ashby ? " ta-active-table" : ""}`}>
                  {ashby && (
                    <colgroup>
                      <col style={{ width: "16%" }} /><col style={{ width: "10%" }} /><col style={{ width: "5%" }} /><col style={{ width: "6%" }} /><col style={{ width: "11%" }} />
                      {STAGES.map((n) => <col key={n} style={{ width: "5.8%" }} />)}
                    </colgroup>
                  )}
                  <thead>
                    {ashby && (
                      <tr className="ta-grp">
                        <th colSpan={5} />
                        <th colSpan={3} className="g1">With Puzzle</th>
                        <th colSpan={5} className="g2">With the client</th>
                        <th className="g3" />
                      </tr>
                    )}
                    <tr><th>Role</th><th>Client</th><th className="c">Open for</th><th className="c">Openings</th><th>Status</th>
                      {ashby
                        ? STAGES.map((n, k) => <th className={`c ${k < 3 ? "g1" : k < 8 ? "g2" : "g3"}${k === 0 || k === 3 || k === 8 ? " gl" : ""}`} key={n} title={n}>{SHORT[n] ?? n}</th>)
                        : <><th className="c">Internal</th><th className="c">Submitted</th><th className="c">With client</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((r) => (
                      <tr key={r.key}>
                        <td><b>{r.title}</b></td>
                        <td>{r.client}</td>
                        <td className="c">{age(r) === null ? "—" : `${age(r)}d`}</td>
                        <td className="c">{r.positions}</td>
                        <td><span className={`pill ${tone(r.status)}`} title={r.status}>{STATUS_SHORT[r.status] ?? r.status}</span></td>
                        {ashby ? (() => {
                          const m = ashbyFor.get(r.key);
                          if (!m) return <td className="c gl ta-none" colSpan={STAGES.length} title="No job with this title in Ashby">Not in Ashby</td>;
                          return STAGES.map((n, k) => (
                            <td className={`c${k === 0 || k === 3 || k === 8 ? " gl" : ""}`} key={n} title={k === 0 && m.shared > 1 ? `Shared with ${m.shared - 1} other role${m.shared > 2 ? "s" : ""} with the same title` : undefined}>
                              <span className={`ta-n${m.job.stages[n] ? "" : " is-0"}`}>{m.job.stages[n]}</span>
                            </td>
                          ));
                        })() : (
                          <>
                            <td className="c"><span className={`ta-n${r.internal ? "" : " is-0"}`}>{r.internal}</span></td>
                            <td className="c"><span className={`ta-n${r.submitted ? "" : " is-0"}`}>{r.submitted}</span></td>
                            <td className="c"><span className={`ta-n${r.inProcess ? "" : " is-0"}`}>{r.inProcess}</span></td>
                          </>
                        )}
                      </tr>
                    ))}
                    {ashby && unmatched.map((j) => (
                      <tr key={j.id}>
                        <td><b>{j.title.replace(/\s*\(PZ-?\d+\)/i, "")}</b></td>
                        <td>{guessClient(j.title)}</td>
                        <td className="c">—</td>
                        <td className="c">—</td>
                        <td><span className="pill warn" title="Open in Ashby, but no active role with this title in the sheet">Ashby only</span></td>
                        {STAGES.map((n, k) => <td className={`c${k === 0 || k === 3 || k === 8 ? " gl" : ""}`} key={n}><span className={`ta-n${j.stages[n] ? "" : " is-0"}`}>{j.stages[n]}</span></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

          </>) },
          { id: "attention", label: "Needs attention", node: (<>
        {(aging.length > 0 || onHold.length > 0 || noSubmit.length > 0) && (
          <div className="ta-block" id="attention">
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

          </>) },
          { id: "momentum", label: "Hiring momentum", node: (<>
        <div className="ta-stats">
          <div className="ta-stat"><b>{yr.opened}</b><span>Roles opened since January</span></div>
          <div className="ta-stat"><b>{yr.filled}</b><span>Roles filled</span></div>
          <div className="ta-stat"><b>{yr.cancelled}</b><span>Roles cancelled</span></div>
          <div className="ta-stat"><b>{yr.lost}</b><span>Roles lost</span></div>
          <div className="ta-stat"><b>{yr.open}</b><span>Roles still open</span></div>
          <div className="ta-stat"><b>{totals.hires}</b><span>People hired</span></div>
          <div className="ta-stat"><b>{pct(totals.fillRate)}</b><span>Fill rate (cancelled not counted)</span></div>
          <div className="ta-stat"><b>{data.avgDaysToStart === null ? "—" : `${Math.round(data.avgDaysToStart)} d`}</b><span>Average time to hire</span></div>
        </div>

        <div className="ta-block" id="momentum">
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

        <div className="ta-block" id="quarters">
          <div className="ta-sec"><h2>Roles by quarter</h2><p>Roles grouped by the quarter they were opened, and how each one ended up so far.</p></div>
          <section className="chart-card">
            <div className="ta-scroll">
              <table className="ta-table">
                <thead><tr><th>Quarter</th><th className="c">Opened</th><th className="c">Filled</th><th className="c">Cancelled</th><th className="c">Lost</th><th className="c">Dropped</th><th className="c">Still open</th></tr></thead>
                <tbody>
                  {byQuarter.map((x) => (
                    <tr key={x.q}>
                      <td><b>{x.q}</b>{x.partial ? " (so far)" : ""}</td>
                      <td className="c"><b>{x.opened}</b></td>
                      <td className="c"><span className="pill ok">{x.filled}</span></td>
                      <td className="c">{x.cancelled}</td>
                      <td className="c">{x.lost}</td>
                      <td className="c">{x.dropped}</td>
                      <td className="c">{x.open}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ta-note">Dropped: the role disappeared from the tracker without a final status.</p>
          </section>
        </div>

          </>) },
          { id: "clients", label: "Demand by client", node: (<>
        <div className="ta-block" id="clients">
          <div className="ta-sec"><h2>Demand by client</h2><p>Openings each client has had since January, and where they stand today. Click a client to see its roles with opening and closing dates. A role without a closing date keeps counting days as open until the sheet is edited.</p></div>
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
                      <thead><tr><th>Role</th><th>Status</th><th className="c">Openings</th><th>Opened</th><th>Closed</th><th className="c">Days</th></tr></thead>
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

          </>) },
        ]}
      />
    </>
  );
}
