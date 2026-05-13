import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // If token in query param, set cookie and redirect to clean URL
  const token = searchParams.get("token");
  if (token) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("token");
    const response = NextResponse.redirect(url);
    response.cookies.set("sb-access-token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 3600,
      path: "/",
    });
    return response;
  }

  // Auth check: require cookie on all non-public routes
  const publicPaths = ["/api/auth"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("sb-access-token");
  if (!accessToken) {
    // Redirect to cockpit with return URL so cockpit can re-issue token
    const cockpitUrl = new URL("https://ll-cockpit.connorpattern.workers.dev/design");
    cockpitUrl.searchParams.set("redirect", request.url);
    return NextResponse.redirect(cockpitUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
