import type { Metadata } from "next";
import UnitPlaceholder from "../UnitPlaceholder";

export const metadata: Metadata = { title: "Customer Success" };

export default function Page() {
  return <UnitPlaceholder title="Customer Success" blurb="This page is ready for the Customer Success data." />;
}
