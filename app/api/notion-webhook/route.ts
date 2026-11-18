import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Notion calls this URL whenever something changes in pages the integration can
// see. This route is open to the internet (it skips the site password), so every
// event must carry a valid signature made with NOTION_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const raw = await req.text();
  let body: any = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // One-time handshake: Notion sends the verification token when the webhook is
  // created. Copy it from the Vercel logs, paste it in Notion to verify, and
  // save it as NOTION_WEBHOOK_SECRET.
  if (body?.verification_token) {
    console.log("Notion webhook verification_token:", body.verification_token);
    return NextResponse.json({ ok: true });
  }

  const secret = process.env.NOTION_WEBHOOK_SECRET;
  const given = req.headers.get("x-notion-signature") ?? "";
  if (!secret) return NextResponse.json({ ok: false, error: "missing secret" }, { status: 500 });

  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
