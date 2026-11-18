// Last client-facing meeting per client. This is a snapshot, not a live feed: it was
// collected from Fathom recordings and Google Calendar events (client check-ins with
// the client on the invite), and it is refreshed by hand. Client names are matched
// loosely ("Vertex" = "VertexOne"). Clients without an entry show "Not found".

// One high-level comment per meeting, written from the Fathom summary. Individual
// performance and other personal comments are left out on purpose.
export type MeetingNotes = { comment: string };
export type ClientMeeting = { client: string; date: string; source: string; title: string; url: string | null; notes?: MeetingNotes };

export const MEETINGS_AS_OF = "2026-11-18";
export const MEETINGS_SEARCHED_SINCE = "2026-09-01";

export const CLIENT_MEETINGS: ClientMeeting[] = [
  { client: "Sparkfire", date: "2026-11-13", source: "Fathom + Calendar", title: "Sparkfire | Puzzle Check In", url: "https://fathom.video/calls/899342744",
    notes: { comment: "Positive check-in focused on retaining the full team for 2027 (roadmap, 1-on-1s, planned year-end bonus). Puzzle's new internship program was introduced as a hiring option." } },
  { client: "Barosa", date: "2026-10-19", source: "Fathom + Calendar", title: "Barosa | Puzzle - Check In", url: "https://fathom.video/calls/864942133",
    notes: { comment: "Healthy and stable. Puzzle is now the exclusive development partner; the main bottleneck is the design backlog, which the team will tackle with AI prototyping tools." } },
  { client: "OTR Solutions", date: "2026-09-04", source: "Fathom + Calendar", title: "OTR | Puzzle | Joao check in", url: "https://fathom.video/calls/810211547",
    notes: { comment: "Delivery concern: an unapproved change to a live email template caused a multi-day outage. Agreed to set explicit deadlines and reinforce communication and availability expectations." } },
];
