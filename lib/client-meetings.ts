// Last client-facing meeting per client. This is a snapshot, not a live feed: it was
// collected from Fathom recordings and Google Calendar events (client check-ins with
// the client on the invite), and it is refreshed by hand. Client names are matched
// loosely ("Vertex" = "VertexOne"). Clients without an entry show "Not found".

export type ClientMeeting = { client: string; date: string; source: string; title: string; url: string | null };

export const MEETINGS_AS_OF = "2026-11-18";
export const MEETINGS_SEARCHED_SINCE = "2026-09-01";

export const CLIENT_MEETINGS: ClientMeeting[] = [
  { client: "Sparkfire", date: "2026-11-13", source: "Fathom + Calendar", title: "Sparkfire | Puzzle Check In", url: "https://fathom.video/calls/899342744" },
  { client: "Barosa", date: "2026-10-19", source: "Fathom + Calendar", title: "Barosa | Puzzle - Check In", url: "https://fathom.video/calls/864942133" },
  { client: "OTR Solutions", date: "2026-09-04", source: "Fathom + Calendar", title: "OTR | Puzzle | Joao check in", url: "https://fathom.video/calls/810211547" },
];
