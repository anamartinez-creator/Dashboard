import type { Metadata } from "next";
import { HiringSetupError, loadHiring } from "@/lib/hiring";
import { loadAshby } from "@/lib/ashby";
import { todayIso } from "@/lib/notion";
import TalentAcquisition from "../TalentAcquisition";
import UnitPlaceholder from "../UnitPlaceholder";

export const metadata: Metadata = { title: "Talent Acquisition" };

// Read the sheet again at most every 5 minutes
export const revalidate = 300;

export default async function Page() {
  try {
    const data = await loadHiring(todayIso());
    // Ashby is optional: if it is missing or down, the page keeps the sheet's pipeline numbers
    const ashby = await loadAshby().catch(() => null);
    return <TalentAcquisition data={data} ashby={ashby} />;
  } catch (err) {
    if (err instanceof HiringSetupError)
      return <UnitPlaceholder title="Talent Acquisition" blurb={`Almost ready: ${err.message}`} />;
    return <UnitPlaceholder title="Talent Acquisition" blurb="Could not read the job openings sheet. Please refresh in a minute." />;
  }
}
