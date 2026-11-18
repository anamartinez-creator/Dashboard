// Reads the Master SDM Tracker from Notion on the server.
// Only the fields the dashboard shows leave this file: Salary Rate, Equipment,
// Notes and similar fields are never sent to the browser.

import { personFlag, sameClient } from "./health";

const NOTION_VERSION = "2025-09-03";

// Data sources inside the Master SDM Tracker page
export const DATA_SOURCES = {
  engineers: "2d370f1b-f516-8190-a868-000b9cd384fe", // 5. Software Development
  sows: "e6914ed6-200f-401b-a1d1-8e8e7be4968f", // 2. SOW Tracker (Updates)
  clients: "2d370f1b-f516-80fe-834f-000bcc90c067", // 3. Active Clients Status
};

export type Engineer = {
  id: string;
  url: string;
  name: string;
  status: string;
  clients: string[];
  role: string;
  sdms: string[];
  cadence: string | null;
  location: string;
  startDate: string | null;
  pilotEnd: string | null;
  pilotDaysLeft: number | null;
  // true for new hires or people with an explicit Pilot End: only they are judged on pilot dates
  pilotTracked: boolean;
};

export type Sow = { id: string; url: string; client: string; status: string; nextStep: string };
export type Client = { id: string; url: string; client: string; status: string; unit: string; headcount: number | null };

type NotionPage = { id: string; url: string; properties: Record<string, any> };

async function queryAll(dataSourceId: string): Promise<NotionPage[]> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("The NOTION_TOKEN variable is missing in Vercel.");
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 || res.status === 403)
        throw new Error("Notion won't let the integration read the tracker. Connect it to the Master SDM Tracker page (••• → Connections).");
      throw new Error(`Notion responded ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    pages.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// Property helpers. Notion property names are matched exactly, including the
// trailing spaces some of them have ("Assigned to ", "Start Date ").
const prop = (p: NotionPage, name: string) => p.properties?.[name];
const text = (v: any): string => {
  if (!v) return "";
  if (v.type === "title") return v.title.map((t: any) => t.plain_text).join("").trim();
  if (v.type === "rich_text") return v.rich_text.map((t: any) => t.plain_text).join("").trim();
  if (v.type === "select") return v.select?.name ?? "";
  if (v.type === "status") return v.status?.name ?? "";
  return "";
};
const multi = (v: any): string[] => (v?.type === "multi_select" ? v.multi_select.map((o: any) => o.name) : []);
const date = (v: any): string | null => (v?.type === "date" ? v.date?.start?.slice(0, 10) ?? null : null);
const num = (v: any): number | null => (v?.type === "number" ? v.number : null);
// Client statuses carry emoji ("On track 🟢"); drop them so colors match.
const cleanStatus = (s: string) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();

// Today's date in Honduras, as YYYY-MM-DD
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tegucigalpa" }).format(new Date());
}
const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);

const STATUS_ORDER: Record<string, number> = { "High Risk": 0, "Needs Attention": 1, Hiring: 2, "New Hire": 3, Pilot: 4, "New Client": 5 };
const order = (s: string) => STATUS_ORDER[s] ?? 9;

export function mapEngineers(pages: NotionPage[], today = todayIso()): Engineer[] {
  return pages
    .map((p) => {
      const startDate = date(prop(p, "Start Date "));
      const explicitPilotEnd = date(prop(p, "Pilot End"));
      const pilotEnd = explicitPilotEnd ?? (startDate ? addDays(startDate, 90) : null);
      const status = text(prop(p, "Status"));
      return {
        id: p.id,
        url: p.url,
        name: text(prop(p, "Engineer")) || "No name",
        status,
        clients: multi(prop(p, "Client")),
        role: text(prop(p, "Role")),
        sdms: multi(prop(p, "Assigned to ")),
        cadence: text(prop(p, "1:1 Cadence")) || null,
        location: text(prop(p, "Location")),
        startDate,
        pilotEnd,
        pilotDaysLeft: pilotEnd ? daysBetween(today, pilotEnd) : null,
        pilotTracked: status === "New Hire" || explicitPilotEnd !== null,
      };
    })
    .sort((a, b) => order(a.status) - order(b.status) || (a.clients[0] ?? "").localeCompare(b.clients[0] ?? "") || a.name.localeCompare(b.name));
}

export function mapSows(pages: NotionPage[]): Sow[] {
  const rank: Record<string, number> = { Pending: 0, "To confirm": 1, Sent: 2, Signed: 3 };
  return pages
    .map((p) => ({
      id: p.id,
      url: p.url,
      client: text(prop(p, "Client / SOW")),
      status: text(prop(p, "Status")),
      nextStep: text(prop(p, "To do")),
    }))
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.client.localeCompare(b.client));
}

export function mapClients(pages: NotionPage[]): Client[] {
  return pages
    .map((p) => ({
      id: p.id,
      url: p.url,
      client: text(prop(p, "Client")),
      status: cleanStatus(text(prop(p, "Status"))),
      unit: text(prop(p, "Business Unit")),
      headcount: num(prop(p, "Headcount")),
    }))
    .sort((a, b) => order(a.status) - order(b.status) || a.client.localeCompare(b.client));
}

// --- Latest 1:1 note -------------------------------------------------------
// Each person's page has a "1:1 Notes" table (Date / Health / Comments / Action
// Items). For people who need follow-up we show the Comments of the newest row.
// Lines about wellbeing, health, family or personal news are dropped on the server.

export type LatestNote = { date: string | null; health: string; comment: string };

const PERSONAL_LABEL = /wellbeing|well-being|health|announcement|family|personal|medical/i;
export function stripPersonal(comment: string): string {
  return comment
    .split("\n")
    .filter((line) => {
      const m = line.match(/^\s*([^:]{1,40}):/);
      return !(m && PERSONAL_LABEL.test(m[1]));
    })
    .join("\n")
    .trim();
}

async function notionGet(path: string): Promise<any | null> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.notion.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
      next: { revalidate: 300 },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const plain = (cell: any[] | undefined): string => (cell ?? []).map((t: any) => t.plain_text).join("");
const cellDate = (cell: any[] | undefined): string | null => {
  const m = (cell ?? []).find((t: any) => t.type === "mention" && t.mention?.type === "date");
  return m?.mention?.date?.start?.slice(0, 10) ?? plain(cell).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
};

async function fetchLatestNote(pageId: string): Promise<LatestNote | null> {
  const blocks = await notionGet(`blocks/${pageId}/children?page_size=100`);
  const table = blocks?.results?.find((b: any) => b.type === "table");
  if (!table) return null;
  const rows = await notionGet(`blocks/${table.id}/children?page_size=100`);
  const list: any[][][] = (rows?.results ?? []).filter((r: any) => r.type === "table_row").map((r: any) => r.table_row.cells);
  if (list.length < 2) return null;
  const header = list[0].map((c) => plain(c).toLowerCase());
  const iDate = header.findIndex((h) => h.includes("date"));
  const iHealth = header.findIndex((h) => h.includes("health"));
  const iComment = header.findIndex((h) => h.includes("comment"));
  if (iDate < 0 || iComment < 0) return null;
  const body = list
    .slice(1)
    .map((cells) => ({ date: cellDate(cells[iDate]), health: iHealth >= 0 ? plain(cells[iHealth]) : "", comment: plain(cells[iComment]) }))
    .filter((r) => r.comment.trim())
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const r = body[0];
  return r ? { date: r.date, health: cleanStatus(r.health), comment: stripPersonal(r.comment) } : null;
}

// This dashboard covers one SDM's side only (Ana Martinez by default; override
// with the SDM_OWNER env var) and leaves out Customer Success clients.
// Everything else is dropped here, so it never reaches the browser.
const OWNER = process.env.SDM_OWNER || "Ana Martinez";
const EXCLUDED_UNITS = ["Customer Success"];

export async function loadTracker() {
  const [e, s, c] = await Promise.all([
    queryAll(DATA_SOURCES.engineers),
    queryAll(DATA_SOURCES.sows),
    queryAll(DATA_SOURCES.clients),
  ]);
  const engineers = mapEngineers(e).filter((x) => x.sdms.includes(OWNER));
  const clients = mapClients(c).filter(
    (x) => x.client && !EXCLUDED_UNITS.includes(x.unit) && engineers.some((p) => p.clients.some((n) => sameClient(n, x.client)))
  );
  const sows = mapSows(s).filter((x) => clients.some((cl) => sameClient(x.client, cl.client)));

  // Latest 1:1 note, only for people who need follow-up (4 at a time to respect Notion's rate limit)
  const notes: Record<string, LatestNote> = {};
  const flagged = engineers.filter((x) => personFlag(x));
  for (let i = 0; i < flagged.length; i += 4) {
    await Promise.all(
      flagged.slice(i, i + 4).map(async (x) => {
        const n = await fetchLatestNote(x.id);
        if (n) notes[x.id] = n;
      })
    );
  }

  return { owner: OWNER, engineers, sows, clients, notes, loadedAt: new Date().toISOString(), today: todayIso() };
}
