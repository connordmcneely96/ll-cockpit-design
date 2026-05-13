import { NextResponse, type NextRequest } from "next/server";
import { validateToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Public paths bypass auth entirely
  const publicPaths = ["/api/health", "/api/auth"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Initial entry from Cockpit: ?token= sets cookie, redirects to clean URL
  const queryToken = searchParams.get("token");
  if (queryToken) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("token");
    const response = NextResponse.redirect(url);
    response.cookies.set("sb-access-token", queryToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 3600,
      path: "/",
    });
    return response;
  }

  // Every subsequent request: validate cookie content, not just presence
  const cookieToken = request.cookies.get("sb-access-token")?.value;
  if (!cookieToken) return redirectToCockpit(request);

  const auth = await validateToken(cookieToken);
  if (!auth) {
    // Token invalid/expired/revoked — clear cookie, redirect to re-auth
    const response = redirectToCockpit(request);
    response.cookies.delete("sb-access-token");
    return response;
  }

  // Propagate validated claims via INTERNAL request headers for downstream handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", auth.userId);
  requestHeaders.set("x-tenant-id", auth.tenantId);
  requestHeaders.set("x-user-email", auth.email);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

function redirectToCockpit(request: NextRequest): NextResponse {
  const cockpitUrl = new URL("https://ll-cockpit.connorpattern.workers.dev/design");
  cockpitUrl.searchParams.set("redirect", request.url);
  return NextResponse.redirect(cockpitUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
