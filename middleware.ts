import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "trainvault_auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === "/login";
  const isLoginApiRoute = pathname === "/api/login";
  const isAuthed = request.cookies.get(AUTH_COOKIE)?.value === "1";

  if (isLoginApiRoute) {
    return NextResponse.next();
  }

  if (isLoginRoute && isAuthed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!isLoginRoute && !isAuthed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
