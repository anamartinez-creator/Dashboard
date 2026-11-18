// Last client-facing meeting per client. This is a snapshot, not a live feed: it was
// collected from Fathom recordings and Google Calendar events (client check-ins with
// the client on the invite), and it is refreshed by hand. Client names are matched
// loosely ("Vertex" = "VertexOne"). Clients without an entry show "Not found".

// Notes are a short, client-level digest of the Fathom summary. Individual performance
// and other personal comments are left out on purpose; open the recording for those.
export type MeetingNotes = { summary: string; takeaways: string[]; nextSteps: string[] };
export type ClientMeeting = { client: string; date: string; source: string; title: string; url: string | null; notes?: MeetingNotes };

export const MEETINGS_AS_OF = "2026-11-18";
export const MEETINGS_SEARCHED_SINCE = "2026-09-01";

export const CLIENT_MEETINGS: ClientMeeting[] = [
  { client: "Sparkfire", date: "2026-11-13", source: "Fathom + Calendar", title: "Sparkfire | Puzzle Check In", url: "https://fathom.video/calls/899342744",
    notes: {
      summary: "Check-in on team morale, performance and 2027 planning.",
      takeaways: [
        "Sparkfire wants to retain the whole team for 2027: feature roadmap, 1-on-1s to align work with goals, and a planned end-of-year bonus (pending approval).",
        "Puzzle is launching a university internship program in January; Sparkfire can hire interns for junior roles such as QA.",
        "Holidays: Thanksgiving (Nov 26-27) and Christmas week (Dec 24 - Jan 1).",
      ],
      nextSteps: [
        "Jeremy: share the 2027 roadmap, discuss the bonus plan with Carlos, consider an intern.",
        "Ana: tell the team the holiday schedule; report any retention concerns to Jeremy.",
      ],
    } },
  { client: "Barosa", date: "2026-10-19", source: "Fathom + Calendar", title: "Barosa | Puzzle - Check In", url: "https://fathom.video/calls/864942133",
    notes: {
      summary: "Check-in on team dynamics and project progress.",
      takeaways: [
        "Puzzle is now Barosa's exclusive development partner after Sentry's full-stack contract ended.",
        "Design backlog is the main bottleneck; the team will explore AI prototyping from the Figma library (Figma MCP with Claude, others).",
        "Team health stabilized: scope changes are now agreed with the team, and PTO is encouraged with holiday coverage as the only constraint.",
        "Bug-fixing effort dropped from 20-25% to near zero with AI tool adoption; client interested in AI for support.",
      ],
      nextSteps: [
        "Ana: discuss AI prototyping tools to address the design bottleneck; remind the team to request PTO.",
        "Jae: evaluate the suggested AI tools (Orca, RAG server for support).",
      ],
    } },
  { client: "OTR Solutions", date: "2026-09-04", source: "Fathom + Calendar", title: "OTR | Puzzle | Joao check in", url: "https://fathom.video/calls/810211547",
    notes: {
      summary: "Internal-style check-in on delivery, communication and availability.",
      takeaways: [
        "A script added to a live email template without approval caused a ~4-day transactional email outage; the client lead fixed it.",
        "Communication and availability on urgent (P0/P1) requests need to improve.",
      ],
      nextSteps: [
        "Client lead: set explicit deadlines in the daily sync.",
        "Ana: reinforce expectations and require the Teams desktop app for availability.",
      ],
    } },
];
