// Pilot start dates set by hand for clients, when the date the client's pilot began
// is not the same as the start dates of the people in Notion. The pilot ends 90
// days after the start. Client names are matched loosely ("Vertex" = "VertexOne").
export const PILOT_STARTS: Record<string, string> = {
  Vertex: "2026-11-16",
};
export const PILOT_DAYS = 90;
