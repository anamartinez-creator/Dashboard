// Health rules for the dashboard. Pure functions: no Notion calls here.
//
// Traffic light (the worst reason wins):
//   Rojo:     High Risk (cliente o persona), SOW Pending, piloto vencido sin actualizar
//   Amarillo: Needs Attention (solo el cliente; las personas van en seguimiento), SOW To confirm / Sent,
//             piloto que termina en 14 días o menos, personas sin cadencia de 1:1
//   Verde:    todo lo demás
// The list is ordered by light (rojo first) and then by score: it starts at 100 and
// loses points per reason.

import type { Client, Engineer, Sow } from "./notion";

export type Light = "green" | "yellow" | "red";
export type Reason = { level: "red" | "yellow" | "info"; text: string };
export type ClientHealth = {
  key: string;
  name: string;
  url: string | null;
  light: Light;
  score: number;
  status: string;
  unit: string;
  headcount: number | null;
  engineers: Engineer[];
  sows: Sow[];
  reasons: Reason[];
};
export type PersonFlag = { engineer: Engineer; level: "red" | "yellow"; reasons: string[] };

export const PILOT_WARN_DAYS = 14;

// Notion spells the same client differently across databases ("Proline Eng" vs
// "Proline Engineering", "Vertex" vs "VertexOne"). Two names match when the
// shorter one, without accents, spaces or symbols, starts the longer one.
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
export const sameClient = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.startsWith(short);
};

const names = (list: Engineer[]) => list.map((e) => e.name).join(", ");

export function personFlag(e: Engineer): PersonFlag | null {
  const reasons: string[] = [];
  let level: "red" | "yellow" | null = null;
  const bump = (l: "red" | "yellow") => { if (l === "red" || level === null) level = l; };

  if (e.status === "High Risk") { reasons.push("High Risk"); bump("red"); }
  if (e.status === "Needs Attention") { reasons.push("Needs Attention"); bump("yellow"); }
  if (e.pilotTracked && e.pilotDaysLeft !== null) {
    if (e.pilotDaysLeft < 0 && e.status === "New Hire") { reasons.push(`Pilot ended ${-e.pilotDaysLeft} d ago and still marked New Hire`); bump("red"); }
    else if (e.pilotDaysLeft >= 0 && e.pilotDaysLeft <= PILOT_WARN_DAYS) { reasons.push(`Pilot ends in ${e.pilotDaysLeft} d`); bump("yellow"); }
  }
  if (!e.cadence) { reasons.push("No 1:1 cadence"); bump("yellow"); }
  return level ? { engineer: e, level, reasons } : null;
}

function scoreClient(name: string, url: string | null, status: string, unit: string, headcount: number | null, engineers: Engineer[], sows: Sow[]): ClientHealth {
  const reasons: Reason[] = [];
  let score = 100;

  if (status === "High Risk") { reasons.push({ level: "red", text: "Client is High Risk" }); score -= 40; }
  else if (status === "Needs Attention") { reasons.push({ level: "yellow", text: "Client is Needs Attention" }); score -= 20; }
  else if (status === "Pilot" || status === "New Client") reasons.push({ level: "info", text: `Client is ${status}` });

  const hr = engineers.filter((e) => e.status === "High Risk");
  if (hr.length) { reasons.push({ level: "red", text: `High Risk: ${names(hr)}` }); score -= Math.min(30, 15 * hr.length); }
  // People with Needs Attention are listed under "People who need follow-up", not on the client

  for (const s of sows) {
    if (s.status === "Signed") continue;
    const next = s.nextStep ? `: ${s.nextStep}` : "";
    if (s.status === "Pending") { reasons.push({ level: "red", text: `SOW Pending${next}` }); score -= 20; }
    else if (s.status === "To confirm") { reasons.push({ level: "yellow", text: `SOW to confirm${next}` }); score -= 12; }
    else { reasons.push({ level: "yellow", text: `SOW sent, not signed${next}` }); score -= 8; }
  }

  const expired = engineers.filter((e) => e.pilotTracked && e.status === "New Hire" && e.pilotDaysLeft !== null && e.pilotDaysLeft < 0);
  const soon = engineers.filter((e) => e.pilotTracked && e.pilotDaysLeft !== null && e.pilotDaysLeft >= 0 && e.pilotDaysLeft <= PILOT_WARN_DAYS);
  if (expired.length) { reasons.push({ level: "red", text: `Pilot expired: ${names(expired)}` }); score -= 20; }
  if (soon.length) { reasons.push({ level: "yellow", text: `Pilot ends in ${PILOT_WARN_DAYS} d or less: ${names(soon)}` }); score -= 10; }

  const noCadence = engineers.filter((e) => !e.cadence);
  if (noCadence.length) {
    reasons.push({ level: "yellow", text: `${noCadence.length} ${noCadence.length === 1 ? "person" : "people"} without a 1:1 cadence` });
    score -= Math.min(15, 3 * noCadence.length);
  }

  const light: Light = reasons.some((r) => r.level === "red") ? "red" : reasons.some((r) => r.level === "yellow") ? "yellow" : "green";
  return { key: norm(name) || name, name, url, light, score: Math.max(0, Math.min(100, score)), status, unit, headcount, engineers, sows, reasons };
}

export function computeClientHealth(clients: Client[], engineers: Engineer[], sows: Sow[]): ClientHealth[] {
  const rows = clients.filter((c) => c.client.trim());
  const out = rows.map((c) =>
    scoreClient(
      c.client, c.url, c.status, c.unit, c.headcount,
      engineers.filter((e) => e.clients.some((n) => sameClient(n, c.client))),
      sows.filter((s) => sameClient(s.client, c.client))
    )
  );

  // Clients that engineers point to but that are missing from Active Clients Status
  const orphan = new Map<string, Engineer[]>();
  for (const e of engineers)
    for (const n of e.clients)
      if (!rows.some((c) => sameClient(n, c.client))) orphan.set(n, [...(orphan.get(n) ?? []), e]);
  for (const [n, list] of orphan) {
    const h = scoreClient(n, null, "", "", null, list, sows.filter((s) => sameClient(s.client, n)));
    h.reasons.unshift({ level: "info", text: "Not in Active Clients Status" });
    out.push(h);
  }

  const rank: Record<Light, number> = { red: 0, yellow: 1, green: 2 };
  return out.sort((a, b) => rank[a.light] - rank[b.light] || a.score - b.score || a.name.localeCompare(b.name));
}
