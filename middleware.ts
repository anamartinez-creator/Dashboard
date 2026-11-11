import { NextRequest, NextResponse } from "next/server";

// Password protection for the whole site. The browser asks for a user and
// password; any user name works, the password is DASHBOARD_PASSWORD.
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return new NextResponse("Falta la variable DASHBOARD_PASSWORD en Vercel.", { status: 500 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (given.length === password.length && timingSafeEqual(given, password)) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("Necesitas la contraseña para ver este dashboard.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SDM Status", charset="UTF-8"' },
  });
}

function timingSafeEqual(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
