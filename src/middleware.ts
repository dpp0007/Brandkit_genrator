import { NextRequest, NextResponse } from "next/server";

// Cookies are SameSite=Lax already; this also rejects any state-changing API call whose Origin is another site.
export function middleware(req: NextRequest) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      let host = "";
      try { host = new URL(origin).host; } catch {}
      const allowed = [req.headers.get("host"), req.headers.get("x-forwarded-host")].filter(Boolean);
      if (!host || !allowed.includes(host)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-site request blocked." } }, { status: 403 });
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ["/api/:path*"] };
