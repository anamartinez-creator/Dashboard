import { NextRequest, NextResponse } from "next/server";

// The dashboard is open: anyone with the link can view it (search engines are told not to index it).
// To bring the login back, set REQUIRE_PASSWORD=true and DASHBOARD_PASSWORD in Vercel and redeploy.
// With it on, the browser asks for a user and password; any user name works.
export function middleware(req: NextRequest) {
  if (process.env.REQUIRE_PASSWORD !== "true") {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return new NextResponse("The DASHBOARD_PASSWORD variable is missing in Vercel.", { status: 500 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (given.length === password.length && timingSafeEqual(given, password)) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("You need the password to view this dashboard.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SDM Status", charset="UTF-8"' },
  });
}

function timingSafeEqual(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico|api/notion-webhook).*)" };
