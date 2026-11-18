// Last client-facing meeting per client. This is a snapshot, not a live feed: it was
// collected from Fathom recordings and Google Calendar events (client check-ins with
// the client on the invite), and it is refreshed by hand. Client names are matched
// loosely ("Vertex" = "VertexOne"). Clients without an entry show "Not found".

// Comments are only shown for meetings from the last month (see Dashboard).
// One high-level comment per meeting, written from the Fathom summary. Individual
// performance and other personal comments are left out on purpose.
export type MeetingNotes = { comment: string };
export type ClientMeeting = { client: string; date: string; source: string; title: string; url: string | null; notes?: MeetingNotes };

export const MEETINGS_AS_OF = "2026-11-18";
export const MEETINGS_SEARCHED_SINCE = "2026-09-01";

export const CLIENT_MEETINGS: ClientMeeting[] = [
  { client: "VertexOne", date: "2026-11-18", source: "Fathom", title: "Puzzle | Vertex Hiring Sync", url: "https://fathom.video/calls/905421605",
    notes: { comment: "Aligned on hiring a Contract Admin (temp-to-perm) for a small team with 26 deals to close by Dec 18. Sourcing is on hold until Vertex's legal review on non-US handling of US client data; Puzzle can deliver candidates within a week of the JD." } },
  { client: "Sparkfire", date: "2026-11-13", source: "Fathom + Calendar", title: "Sparkfire | Puzzle Check In", url: "https://fathom.video/calls/899342744",
    notes: { comment: "Positive check-in focused on retaining the full team for 2027 (roadmap, 1-on-1s, planned year-end bonus). Puzzle's new internship program was introduced as a hiring option." } },
  { client: "Barosa", date: "2026-10-19", source: "Fathom + Calendar", title: "Barosa | Puzzle - Check In", url: "https://fathom.video/calls/864942133",
    notes: { comment: "Healthy and stable. Puzzle is now the exclusive development partner; the main bottleneck is the design backlog, which the team will tackle with AI prototyping tools." } },
  { client: "OTR Solutions", date: "2026-11-17", source: "Notion", title: "OTR Solutions: client comment in tracker", url: "https://app.notion.com/p/36570f1bf51680cc9e92c1cfa7918203",
    notes: { comment: "Client replied positively: they are happy to have Marcella, who started Nov 16 and picks up OTR's work from Joao. Her 90-day pilot runs to Feb 16, 2027." } },
];
