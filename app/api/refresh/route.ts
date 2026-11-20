import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

// Clears the cached data so the next page load reads the sources again
// (Notion for the dashboards, Google Sheets for Talent Acquisition).
// The site-wide password in middleware.ts also protects this route.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body?.scope === "/talent-acquisition") {
    revalidateTag("hiring");
    revalidatePath("/talent-acquisition");
  } else {
    revalidatePath("/");
  }
  return NextResponse.json({ ok: true });
}
