// Reads the "Active Job Openings- Monthly" Google Sheet (2026 tabs only) and turns it
// into one record per role. Rules: see claude/job-openings-tracker-rules.md in the project.
//
// Rates and salaries are confidential: they are never read into the objects below.

import { createSign } from "crypto";
import { sameClient } from "./health";

export const OPEN_STATUSES = ["Active", "Pend Functional Spec"];
export const PRESALES_STATUSES = ["Pending SOW", "MSA sent", "Sales/In progress"];
export const FINAL_STATUSES = ["Filled", "Cancelled", "Lost"];

export type Role = {
  key: string;
  title: string;
  client: string;
  owner: string;
  lob: string;
  opened: string | null; // ISO
  positions: number;
  status: string; // latest status
  internal: number;
  submitted: number;
  inProcess: number;
  comment: string;
  firstTab: string;
  lastTab: string;
  startDate: string | null; // ISO. Filled roles: hire date. Cancelled or Lost roles: the date it was closed, when recorded
  daysToStart: number | null;
  carried: boolean; // opened before 2026 (or no opening date)
  dropped: boolean; // vanished from the tracker without a final status
};

export type Tab = { name: string; rows: string[][] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const YEAR = 2026;

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const normClient = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, "");
// Client names that are typed two ways in the sheets. The key is the normalized misspelling, the value is the real name.
const CLIENT_ALIASES: Record<string, string> = { improvifi: "Improvify", drtaz: "Hol+", holplus: "Hol+", hol: "Hol+" };
const canonClient = (s: string) => CLIENT_ALIASES[normClient(s)] ?? s;
const normTitle = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const toInt = (s: string) => {
  const n = parseInt(clean(s).replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

// "11/5/2026" -> "2026-11-05"
function isoDate(s: string): string | null {
  const m = clean(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

const STATUS_CANON: Record<string, string> = {
  active: "Active",
  "pend functional spec": "Pend Functional Spec",
  "pending sow": "Pending SOW",
  "msa sent": "MSA sent",
  "sales/in progress": "Sales/In progress",
  "on hold": "On Hold",
  filled: "Filled",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  lost: "Lost",
};
const canonStatus = (s: string) => STATUS_CANON[clean(s).toLowerCase()] ?? clean(s);

// "Mateus starting on Jun 8th" -> "2026-06-08"
function startFromComment(comment: string, year: number): string | null {
  const m = comment.match(/starting(?:\s+date)?(?:\s+on)?\s+([A-Za-z]{3,9})\.?\s+(\d{1,2})/i);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  if (mi < 0) return null;
  return `${year}-${String(mi + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

type Row = { title: string; client: string; owner: string; lob: string; opened: string | null; positions: number; status: string; closed: string | null; internal: number; submitted: number; inProcess: number; comment: string };

function parseTab(tab: Tab): Row[] {
  const h = tab.rows.findIndex((r) => clean(r[1]).toLowerCase() === "opening date");
  if (h < 0) return [];
  const head = tab.rows[h].map((c) => clean(c).toLowerCase());
  const col = (test: (s: string) => boolean) => head.findIndex(test);
  const c = {
    opened: col((s) => s === "opening date"),
    title: col((s) => s === "job title"),
    client: col((s) => s === "client"),
    lob: col((s) => s === "lob"),
    owner: col((s) => s.startsWith("assigned to")),
    positions: col((s) => s.startsWith("# of positions")),
    status: col((s) => s === "status"),
    closed: col((s) => s === "closed date"),
    internal: col((s) => s.startsWith("internal")),
    submitted: col((s) => s === "submittals"),
    inProcess: col((s) => s.startsWith("candidates in process")),
    comment: col((s) => s === "comments"),
  };
  const out: Row[] = [];
  for (const r of tab.rows.slice(h + 1)) {
    if (clean(r[1]).toLowerCase() === "total") break;
    const title = clean(r[c.title]);
    const client = canonClient(clean(r[c.client]));
    if (!title && !client) continue;
    out.push({
      title,
      client,
      owner: clean(r[c.owner]),
      lob: clean(r[c.lob]),
      opened: isoDate(r[c.opened] ?? ""),
      positions: Math.max(1, toInt(r[c.positions] ?? "1")),
      status: canonStatus(r[c.status] ?? ""),
      closed: isoDate(r[c.closed] ?? ""),
      internal: toInt(r[c.internal] ?? ""),
      submitted: toInt(r[c.submitted] ?? ""),
      inProcess: toInt(r[c.inProcess] ?? ""),
      comment: clean(r[c.comment]),
    });
  }
  return out;
}

const tabOrder = (name: string) => {
  const m = name.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  return m ? parseInt(m[2], 10) * 12 + MONTHS.indexOf(m[1].toLowerCase()) : -1;
};

export function buildRoles(tabsIn: Tab[]): { roles: Role[]; latestTab: string } {
  const tabs = tabsIn.filter((t) => tabOrder(t.name) >= 0).sort((a, b) => tabOrder(a.name) - tabOrder(b.name));
  const all: Role[] = [];
  const baseOf = new Map<Role, string>();
  const isFinal = (s: string) => FINAL_STATUSES.includes(s);

  for (const tab of tabs) {
    const rows = parseTab(tab);
    const base = (r: Row) => `${normClient(r.client)}|${r.opened ?? ""}|${normTitle(r.title)}`;
    const basesInTab = new Set(rows.map(base));
    const claimed = new Set<Role>(); // roles already matched to a row of this tab
    // The sheet's Closed Date is =today() until someone sets it: the most common value among non-Filled rows is that placeholder.
    const counts = new Map<string, number>();
    for (const r of rows) if (r.status !== "Filled" && r.closed) counts.set(r.closed, (counts.get(r.closed) ?? 0) + 1);
    const placeholder = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const year = parseInt(tab.name.slice(-4), 10) || YEAR;

    for (const r of rows) {
      const b = base(r);
      // 1) Same client + opening date + title. Rows with the same title are separate roles (e.g. one Filled, one still Active).
      const same = all.filter((x) => baseOf.get(x) === b && !claimed.has(x));
      let role: Role | undefined = same.find((x) => !isFinal(x.status)) ?? same.find((x) => x.status === r.status);
      // 2) A renamed role keeps client + opening date, but its old title is gone from this tab.
      if (!role && r.opened) {
        const cands = all.filter(
          (x) => x.opened === r.opened && normClient(x.client) === normClient(r.client) && !basesInTab.has(baseOf.get(x) as string) && !claimed.has(x) && x.lastTab !== tab.name && !isFinal(x.status)
        );
        role = cands.find((x) => x.owner === r.owner && x.lob === r.lob) ?? (cands.length === 1 ? cands[0] : undefined);
        if (role) baseOf.set(role, b);
      }
      if (!role) {
        role = {
          key: `${b}#${all.length}`, title: r.title, client: r.client, owner: r.owner, lob: r.lob, opened: r.opened, positions: r.positions, status: r.status,
          internal: 0, submitted: 0, inProcess: 0, comment: "", firstTab: tab.name, lastTab: tab.name, startDate: null, daysToStart: null,
          carried: !r.opened || r.opened < `${YEAR}-01-01`, dropped: false,
        };
        all.push(role);
        baseOf.set(role, b);
      }
      claimed.add(role);
      role.title = r.title;
      role.client = r.client || role.client;
      role.owner = r.owner || role.owner;
      role.lob = r.lob || role.lob;
      role.positions = r.positions;
      role.status = r.status;
      role.internal = r.internal;
      role.submitted = r.submitted;
      role.inProcess = r.inProcess;
      role.comment = r.comment;
      role.lastTab = tab.name;
      if (r.status === "Filled") {
        const fromSheet = r.closed && r.closed !== placeholder ? r.closed : null;
        role.startDate = fromSheet ?? startFromComment(r.comment, year);
      } else if (r.status === "Cancelled" || r.status === "Lost") {
        // Only a date someone typed counts; the =today() placeholder means nobody recorded when it ended
        role.startDate = r.closed && r.closed !== placeholder ? r.closed : null;
      }
    }
  }

  const latestTab = tabs[tabs.length - 1]?.name ?? "";
  for (const r of all) {
    r.dropped = r.lastTab !== latestTab && !isFinal(r.status);
    r.daysToStart = r.status === "Filled" && r.startDate && r.opened ? Math.max(0, dayDiff(r.opened, r.startDate)) : null;
  }
  return { roles: all, latestTab };
}

// --- Numbers shown on the page ---------------------------------------------

export type Hire = { date: string; client: string; role: string }; // no names, no payment amounts

export type HiringData = {
  latestTab: string;
  loadedAt: string;
  today: string;
  totals: { roles: number; positions: number; filledRoles: number; hires: number; fillRate: number | null };
  byStatus: { status: string; roles: number; positions: number }[];
  open: { openRoles: number; openPositions: number; holdRoles: number; holdPositions: number; presalesRoles: number; submitted: number };
  byClient: { client: string; open: number; hold: number; presales: number }[];
  openRoles: Role[]; // Active, Pend Functional Spec and On Hold in the latest tab
  filled: Role[]; // Filled roles with a known start date, newest start first
  avgDaysToStart: number | null;
  monthly: { month: string; hires: number }[];
  clientHistory: { group: string; clients: { client: string; total: number; filled: number; open: number; cancelled: number; lost: number; dropped: number; roles: { title: string; status: string; positions: number; opened: string | null; closed: string | null; days: number | null; counting: boolean }[] }[] }[]; // positions opened since January, per line of business and client
  hires: Hire[] | null; // from the Bonuses sheet when it is shared with the service account, else null
};

export const lobGroup = (lob: string): string => (/^engineer/i.test(lob.trim()) ? "Engineering" : /^customer/i.test(lob.trim()) ? "Customer Success" : "Staff & other");

export function summarize(allRoles: Role[], latestTab: string, today: string, bonusHires: Hire[] | null = null): HiringData {
  // Outcomes and fill rate count only roles opened from January of this year. Roles carried over from the year
  // before still show up if they are open right now, and their hires still count as hires.
  const roles = allRoles.filter((r) => !r.carried);
  const live = allRoles.filter((r) => !r.dropped);
  const statusOf = (r: Role) => (r.dropped ? "Dropped" : r.status);
  const order = ["Active", "Pend Functional Spec", "On Hold", "Pending SOW", "MSA sent", "Sales/In progress", "Filled", "Cancelled", "Lost", "Dropped"];
  const seen = [...new Set(roles.map(statusOf))];
  const byStatus = [...order.filter((s) => seen.includes(s)), ...seen.filter((s) => !order.includes(s))].map((status) => {
    const rs = roles.filter((r) => statusOf(r) === status);
    return { status, roles: rs.length, positions: rs.reduce((n, r) => n + r.positions, 0) };
  });

  const filled = roles.filter((r) => r.status === "Filled");
  // Cancelled roles are left out of the fill rate on purpose: only filled and lost roles count
  const lost = roles.filter((r) => r.status === "Lost");
  const fillRate = filled.length + lost.length ? filled.length / (filled.length + lost.length) : null;

  const nowRoles = live.filter((r) => r.lastTab === latestTab);
  const openR = nowRoles.filter((r) => OPEN_STATUSES.includes(r.status));
  const holdR = nowRoles.filter((r) => r.status === "On Hold");
  const preR = nowRoles.filter((r) => PRESALES_STATUSES.includes(r.status));
  const sum = (rs: Role[]) => rs.reduce((n, r) => n + r.positions, 0);

  const clients = new Map<string, { client: string; open: number; hold: number; presales: number }>();
  for (const r of [...openR, ...holdR, ...preR]) {
    const k = normClient(r.client);
    const e = clients.get(k) ?? { client: r.client, open: 0, hold: 0, presales: 0 };
    if (OPEN_STATUSES.includes(r.status)) e.open += r.positions;
    else if (r.status === "On Hold") e.hold += r.positions;
    else e.presales += r.positions;
    clients.set(k, e);
  }

  // Hires count everyone hired from January this year, including roles opened the year before
  const hired = allRoles.filter((r) => r.status === "Filled" && (!r.startDate || r.startDate >= `${YEAR}-01-01`));
  // The LOB column is typed by hand ("Engineer", "Engineerring", "Engineering"), so group by what it starts with

  type Hist = { client: string; total: number; filled: number; open: number; cancelled: number; lost: number; dropped: number; roles: { title: string; status: string; positions: number; opened: string | null; closed: string | null; days: number | null; counting: boolean }[] };
  const hist = new Map<string, Hist[]>();
  for (const r of roles) {
    const g = lobGroup(r.lob);
    const list = hist.get(g) ?? [];
    let e = list.find((x) => sameClient(x.client, r.client));
    if (!e) { e = { client: r.client, total: 0, filled: 0, open: 0, cancelled: 0, lost: 0, dropped: 0, roles: [] }; list.push(e); }
    e.total += r.positions;
    // Closed date: the hire date of a Filled role, or the date a Cancelled or Lost role was closed when someone recorded it.
    const closed = (r.status === "Filled" || r.status === "Cancelled" || r.status === "Lost") && !r.dropped ? r.startDate : null;
    // A role with no closing date recorded keeps counting days up to today until someone edits the sheet
    const days = r.opened ? Math.max(0, dayDiff(r.opened, closed ?? today)) : null;
    e.roles.push({ title: r.title, status: r.dropped ? "Dropped" : r.status, positions: r.positions, opened: r.opened, closed, days, counting: !closed });
    if (r.dropped) e.dropped += r.positions;
    else if (r.status === "Cancelled") e.cancelled += r.positions;
    else if (r.status === "Lost") e.lost += r.positions;
    else if (r.status === "Filled") e.filled += r.positions;
    else e.open += r.positions;
    hist.set(g, list);
  }
  const clientHistory = ["Engineering", "Customer Success", "Staff & other"]
    .filter((g) => hist.has(g))
    .map((group) => ({ group, clients: (hist.get(group) as Hist[]).map((c) => ({ ...c, roles: [...c.roles].sort((a, b) => (a.opened ?? "").localeCompare(b.opened ?? "")) })).sort((x, y) => y.total - x.total || x.client.localeCompare(y.client)) }));

  const timed = hired.filter((r) => r.daysToStart !== null);
  const posW = timed.reduce((n, r) => n + r.positions, 0);
  const avg = posW ? timed.reduce((n, r) => n + (r.daysToStart as number) * r.positions, 0) / posW : null;

  const monthly = MONTHS.map((m, i) => ({
    month: m[0].toUpperCase() + m.slice(1),
    hires: bonusHires
      ? bonusHires.filter((h) => h.date.startsWith(`${YEAR}-${String(i + 1).padStart(2, "0")}`)).length
      : hired.filter((r) => r.startDate?.startsWith(`${YEAR}-${String(i + 1).padStart(2, "0")}`)).reduce((n, r) => n + r.positions, 0),
  }));
  const lastMonth = Math.max(...monthly.map((m, i) => (m.hires ? i : -1)), parseInt(today.slice(5, 7), 10) - 1);

  return {
    latestTab,
    loadedAt: new Date().toISOString(),
    today,
    totals: {
      roles: roles.length,
      positions: sum(roles),
      filledRoles: hired.length,
      hires: bonusHires ? bonusHires.length : sum(hired),
      fillRate,
    },
    byStatus,
    open: { openRoles: openR.length, openPositions: sum(openR), holdRoles: holdR.length, holdPositions: sum(holdR), presalesRoles: preR.length, submitted: [...openR, ...holdR].reduce((n, r) => n + r.submitted, 0) },
    byClient: [...clients.values()].sort((a, b) => b.open + b.hold + b.presales - (a.open + a.hold + a.presales) || a.client.localeCompare(b.client)),
    openRoles: [...openR, ...holdR].sort((a, b) => (OPEN_STATUSES.includes(a.status) ? 0 : 1) - (OPEN_STATUSES.includes(b.status) ? 0 : 1) || (a.opened ?? "9").localeCompare(b.opened ?? "9")),
    filled: hired.filter((r) => r.startDate).sort((a, b) => (b.startDate as string).localeCompare(a.startDate as string)),
    avgDaysToStart: avg,
    monthly: monthly.slice(0, lastMonth + 1),
    clientHistory,
    hires: bonusHires ? [...bonusHires].sort((a, b) => b.date.localeCompare(a.date)) : null,
  };
}

// --- Google Sheets access ----------------------------------------------------
// A service account (read-only) signs a JWT with Node's crypto; no extra packages.

type ServiceAccount = { client_email: string; private_key: string };

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new HiringSetupError("GOOGLE_SERVICE_ACCOUNT_JSON is missing in Vercel.");
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(text);
    if (!j.client_email || !j.private_key) throw new Error("no key");
    return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n") };
  } catch {
    throw new HiringSetupError("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the whole key file as one value.");
  }
}

export class HiringSetupError extends Error {}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

let tokenCache: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64url(createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
    cache: "no-store",
  });
  if (!res.ok) throw new HiringSetupError(`Google refused the service account (${res.status}). Check the key in Vercel.`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

async function sheetsGet(path: string): Promise<any> {
  const token = await accessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } });
  if (res.status === 403 || res.status === 404)
    throw new HiringSetupError("The service account can't open the sheet. Share it with the service account's email (Viewer).");
  if (!res.ok) throw new Error(`Google Sheets responded ${res.status}`);
  return res.json();
}

// Hires from the "Bonuses - Hires and Referrals" sheet (tabs "Q1 2026"…"Q4 2026"). Only columns B:E are read
// (hire date, name, client, role) and the name is dropped, so no payment amounts or names reach the page.
const BONUSES_SHEET_ID = process.env.BONUSES_SHEET_ID || "1dEAxRrRao7rdisJutps4PcDRdrcOtpP8aCqT9yEML3g";
async function loadBonusHires(): Promise<Hire[] | null> {
  try {
    const ranges = [1, 2, 3, 4].map((q) => `ranges=${encodeURIComponent(`'Q${q} ${YEAR}'!B1:E80`)}`).join("&");
    const data = await sheetsGet(`${BONUSES_SHEET_ID}/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE`);
    const out: Hire[] = [];
    for (const v of data.valueRanges ?? []) {
      const rows: string[][] = v.values ?? [];
      const h = rows.findIndex((r) => (r[0] ?? "").trim() === "Hire Date" && (r[1] ?? "").trim() === "Hire Name");
      if (h < 0) continue;
      for (const r of rows.slice(h + 1)) {
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((r[0] ?? "").trim());
        if (!m) break;
        out.push({ date: `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`, client: canonClient((r[2] ?? "").trim()), role: (r[3] ?? "").trim() });
      }
    }
    return out.length ? out : null;
  } catch {
    return null; // not shared with the service account (or a tab is missing): the page falls back to the openings sheet
  }
}

export async function loadHiring(today: string): Promise<HiringData> {
  const id = process.env.HIRING_SHEET_ID;
  if (!id) throw new HiringSetupError("HIRING_SHEET_ID is missing in Vercel.");
  const meta = await sheetsGet(`${id}?fields=sheets.properties.title`);
  const names: string[] = (meta.sheets ?? []).map((s: any) => s.properties.title).filter((n: string) => new RegExp(`^[A-Za-z]{3} ${YEAR}$`).test(n));
  if (!names.length) throw new HiringSetupError(`No tabs named like "Nov ${YEAR}" in the sheet.`);
  const ranges = names.map((n) => `ranges=${encodeURIComponent(`'${n}'!A1:P150`)}`).join("&");
  const data = await sheetsGet(`${id}/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE`);
  const tabs: Tab[] = (data.valueRanges ?? []).map((v: any, i: number) => ({ name: names[i], rows: v.values ?? [] }));
  const { roles, latestTab } = buildRoles(tabs);
  return summarize(roles, latestTab, today, await loadBonusHires());
}
