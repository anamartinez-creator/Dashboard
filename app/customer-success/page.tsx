import type { Metadata } from "next";
import { loadCustomerSuccess, shouldRethrow } from "@/lib/notion";
import Dashboard from "../Dashboard";

export const metadata: Metadata = { title: "Customer Success" };

// Read Notion again at most every minute
export const revalidate = 60;

export default async function Page() {
  try {
    const data = await loadCustomerSuccess();
    return <Dashboard {...data} title="Customer Success" />;
  } catch (err) {
    // Temporary Notion hiccup: throw so Next keeps serving the last good copy of the page
    if (shouldRethrow(err)) throw err;
    return (
      <main className="wrap">
        <h1>Customer Success</h1>
        <div className="error">
          <strong>Could not read Notion.</strong>
          <p>{err instanceof Error ? err.message : String(err)}</p>
        </div>
      </main>
    );
  }
}
