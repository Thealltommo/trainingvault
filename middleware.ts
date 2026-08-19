import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "trainvault_auth";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLoginRoute = pathname === "/login";
  const isLoginApiRoute = pathname === "/api/login";
  const isMigrationReceiveRoute = pathname === "/api/migrate/receive";
  const isAuthed = request.cookies.get(AUTH_COOKIE)?.value === "1";

  if (isLoginApiRoute || isMigrationReceiveRoute) {
    return NextResponse.next();
  }

  if (isLoginRoute && isAuthed) {
    const next = request.nextUrl.searchParams.get("next");
    const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (!isLoginRoute && !isAuthed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
