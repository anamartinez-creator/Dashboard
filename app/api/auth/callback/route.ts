import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_DOMAIN, SESSION_COOKIE, SESSION_DAYS, STATE_COOKIE, signSession } from "@/lib/session";

const deny = (msg: string, status = 403) =>
  new NextResponse(`<!doctype html><meta charset="utf-8"><title>Puzzle</title><body style="font-family:system-ui;max-width:420px;margin:15vh auto;color:#00406c"><h2>${msg}</h2><p>Only @${ALLOWED_DOMAIN} accounts can view this dashboard.</p><p><a href="/api/auth/login">Try another account</a></p></body>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

// Google sends the visitor back here with a code. The code is exchanged for the ID token straight from Google,
// then the account has to be a verified @puzzle.tech address.
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const secret = process.env.AUTH_SECRET;
  if (!clientId || !clientSecret || !secret) return new NextResponse("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or AUTH_SECRET is missing in Vercel.", { status: 500 });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const [savedState, savedNext] = (req.cookies.get(STATE_COOKIE)?.value ?? "").split("|");
  if (!code || !state || !savedState || state !== savedState) return deny("The sign-in expired. Please try again.", 400);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${req.nextUrl.origin}/api/auth/callback`, grant_type: "authorization_code" }),
  });
  if (!tokenRes.ok) return deny("Google did not accept the sign-in.", 400);
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return deny("Google did not return an account.", 400);

  let claims: { aud?: string; iss?: string; exp?: number; email?: string; email_verified?: boolean; hd?: string; name?: string };
  try {
    claims = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return deny("Could not read the Google account.", 400);
  }
  const email = (claims.email ?? "").toLowerCase();
  const ok =
    claims.aud === clientId &&
    (claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com") &&
    (claims.exp ?? 0) > Date.now() / 1000 &&
    claims.email_verified === true &&
    claims.hd === ALLOWED_DOMAIN &&
    email.endsWith(`@${ALLOWED_DOMAIN}`);
  if (!ok) return deny("That account is not allowed.");

  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const next = decodeURIComponent(savedNext ?? "/");
  const res = NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/", req.nextUrl.origin));
  res.cookies.set(SESSION_COOKIE, await signSession(secret, { email, name: claims.name, exp }), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
