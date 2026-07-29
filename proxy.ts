import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";
  const isLoginApi = pathname === "/api/login";
  const isPublicHealthEndpoint = pathname === "/api/health";

  if (isLoginApi || isPublicHealthEndpoint) {
    return NextResponse.next();
  }

  const isAuthed = await verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value);

  if (isLoginPage && isAuthed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!isLoginPage && !isAuthed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
