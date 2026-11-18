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
  { client: "Stay.ai", date: "2026-11-04", source: "Notion", title: "Stay.ai: client comment in tracker", url: "https://app.notion.com/p/2d370f1bf516807ca528c43dc9bab930",
    notes: { comment: "Renan (tech lead) says the team is doing great and he likes having them around." } },
  { client: "Overland", date: "2026-11-09", source: "Notion", title: "Overland: client note in tracker", url: "https://app.notion.com/p/2d370f1bf51680969d8fc18aa0506e59",
    notes: { comment: "SOW V4 is signed through July 2027. The team is working on V4, with the shipping calendar as the first high-impact feature. Client sessions earlier this fall covered the Oct 28-30 on-site visit and the App Store release." } },
  { client: "Presso", date: "2026-11-03", source: "Notion", title: "Presso: client note in tracker", url: "https://app.notion.com/p/30270f1bf51680b0a4c7ce8a29007dcb",
    notes: { comment: "Client confirmed they will continue. They value proactive updates, which give them confidence that enough work is getting done." } },
  { client: "Hol+", date: "2026-09-24", source: "Notion", title: "Hol+: client note in tracker", url: "https://app.notion.com/p/36670f1bf51680f286cadff61bee5be7",
    notes: { comment: "Client is very happy: the site rebuild was owned end to end, only small tweaks were requested, and a before/after performance report was shared." } },
  { client: "CompSci", date: "2026-09-24", source: "Notion", title: "CompSci: note in tracker", url: "https://app.notion.com/p/2d370f1bf51680219917fd8ad7096a24",
    notes: { comment: "Engagement is going well. A move to a newer project team has been discussed but is not confirmed by the team lead." } },
  { client: "Proline Engineering", date: "2026-09-24", source: "Notion", title: "Proline Engineering: note in tracker", url: "https://app.notion.com/p/2d370f1bf51680a59478e880671edce8",
    notes: { comment: "The new QA hires have their equipment and are already helping with ticket triage and QA. The team lead now runs monthly 1:1s with his team." } },
];
