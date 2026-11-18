import { loadTracker } from "@/lib/notion";
import Dashboard from "./Dashboard";

// Read Notion again at most every minute
export const revalidate = 60;

export default async function Page() {
  try {
    const data = await loadTracker();
    return <Dashboard {...data} />;
  } catch (err) {
    return (
      <main className="wrap">
        <h1>Health del delivery SDM</h1>
        <div className="error">
          <strong>No se pudo leer Notion.</strong>
          <p>{err instanceof Error ? err.message : String(err)}</p>
        </div>
      </main>
    );
  }
}
