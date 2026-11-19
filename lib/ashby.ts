// Candidates in process, read from Ashby (read-only). Needs ASHBY_API_KEY in Vercel.
// Counts only three stages of each open job: SDM interview, Submitted to the client, Client interview.

export type AshbyRole = { id: string; title: string; opened: string | null; location: string | null; sdm: number; submitted: number; client: number; total: number };
export type AshbyData = { roles: AshbyRole[]; totals: { sdm: number; submitted: number; client: number; total: number } };

const BASE = "https://api.ashbyhq.com";

async function call<T>(key: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    body: JSON.stringify(body),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Ashby ${method} failed (${res.status})`);
  const json = (await res.json()) as { success?: boolean } & T;
  if (json.success === false) throw new Error(`Ashby ${method} was refused`);
  return json;
}

type Page<R> = { results: R[]; moreDataAvailable?: boolean; nextCursor?: string };

async function all<R>(key: string, method: string, body: Record<string, unknown>): Promise<R[]> {
  const out: R[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await call<Page<R>>(key, method, { ...body, limit: 100, ...(cursor ? { cursor } : {}) });
    out.push(...(page.results ?? []));
    if (!page.moreDataAvailable || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

const stageKind = (title: string): "sdm" | "submitted" | "client" | null => {
  const t = title.toLowerCase();
  if (t.includes("service delivery manager interview")) return "sdm";
  if (t.includes("submitted to the client")) return "submitted";
  if (t.includes("client") && t.includes("interview")) return "client";
  return null;
};

/** Returns null when ASHBY_API_KEY is not set, so the page can fall back to the sheet. */
export async function loadAshby(): Promise<AshbyData | null> {
  const key = process.env.ASHBY_API_KEY;
  if (!key) return null;
  const jobs = await all<{ id: string; title: string; openedAt?: string | null; location?: { name?: string } | null }>(key, "job.list", { status: ["Open"] });
  const roles = await Promise.all(
    jobs.map(async (j) => {
      const apps = await all<{ currentInterviewStage?: { title?: string } | null }>(key, "application.list", { jobId: j.id, status: "Active" });
      const r: AshbyRole = { id: j.id, title: j.title, opened: j.openedAt ? j.openedAt.slice(0, 10) : null, location: j.location?.name ?? null, sdm: 0, submitted: 0, client: 0, total: 0 };
      for (const a of apps) {
        const k = stageKind(a.currentInterviewStage?.title ?? "");
        if (k) { r[k] += 1; r.total += 1; }
      }
      return r;
    }),
  );
  roles.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  const sum = (f: (r: AshbyRole) => number) => roles.reduce((n, r) => n + f(r), 0);
  return { roles, totals: { sdm: sum((r) => r.sdm), submitted: sum((r) => r.submitted), client: sum((r) => r.client), total: sum((r) => r.total) } };
}
