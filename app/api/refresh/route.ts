import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

// Clears the cached Notion data so the next page load reads Notion again.
// The site-wide password in middleware.ts also protects this route.
export async function POST() {
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
