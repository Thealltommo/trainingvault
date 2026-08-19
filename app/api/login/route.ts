import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "trainvault_auth";

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function loginRedirect(request: NextRequest, error?: string, next = "/") {
  const url = new URL("/login", request.url);

  if (error) {
    url.searchParams.set("error", error);
  }

  if (next !== "/") {
    url.searchParams.set("next", next);
  }

  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const submittedPassword = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const expectedPassword = process.env.TRAINVAULT_PASSWORD;

  if (!expectedPassword) {
    return loginRedirect(request, "missing-password", next);
  }

  if (submittedPassword !== expectedPassword) {
    return loginRedirect(request, "invalid", next);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set({
    name: AUTH_COOKIE,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export function GET(request: NextRequest) {
  return loginRedirect(request);
}
