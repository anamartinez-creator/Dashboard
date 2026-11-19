import { loadTracker, NotionTransientError } from "@/lib/notion";
import Dashboard from "./Dashboard";

// Read Notion again at most every minute
export const revalidate = 60;

export default async function Page() {
  try {
    const data = await loadTracker();
    return <Dashboard {...data} />;
  } catch (err) {
    // Temporary Notion hiccup: throw so Next keeps serving the last good copy of the page
    if (err instanceof NotionTransientError && err.transient) throw err;
    return (
      <main className="wrap">
        <h1>Software Service Delivery Dashboard</h1>
        <div className="error">
          <strong>Could not read Notion.</strong>
          <p>{err instanceof Error ? err.message : String(err)}</p>
        </div>
      </main>
    );
  }
}
