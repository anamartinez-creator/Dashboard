import type { Metadata } from "next";
import { HiringSetupError, loadHiring } from "@/lib/hiring";
import { loadAshby } from "@/lib/ashby";
import { loadPendingStarts, todayIso } from "@/lib/notion";
import TalentAcquisition from "../TalentAcquisition";
import UnitPlaceholder from "../UnitPlaceholder";

export const metadata: Metadata = { title: "Talent Acquisition" };

// Read the sheets again at most every minute
export const revalidate = 60;

export default async function Page() {
  try {
    const today = todayIso();
    const [data, ashby, pending] = await Promise.all([loadHiring(today), loadAshby().catch(() => null), loadPendingStarts(today).catch(() => null)]);
    return <TalentAcquisition data={data} ashby={ashby} pending={pending} />;
  } catch (err) {
    if (err instanceof HiringSetupError)
      return <UnitPlaceholder title="Talent Acquisition" blurb={`Almost ready: ${err.message}`} />;
    return <UnitPlaceholder title="Talent Acquisition" blurb="Could not read the job openings sheet. Please refresh in a minute." />;
  }
}
