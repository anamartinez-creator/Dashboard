import type { Metadata } from "next";
import UnitPlaceholder from "../UnitPlaceholder";

export const metadata: Metadata = { title: "Talent Acquisition" };

export default function Page() {
  return <UnitPlaceholder title="Talent Acquisition" blurb="This page is ready for the Talent Acquisition data." />;
}
