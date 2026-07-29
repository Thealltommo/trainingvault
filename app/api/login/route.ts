import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "trainvault_auth";

function loginRedirect(request: NextRequest, error?: string) {
  const url = new URL("/login", request.url);

  if (error) {
    url.searchParams.set("error", error);
  }

  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const submittedPassword = String(formData.get("password") ?? "");
  const expectedPassword = process.env.TRAINVAULT_PASSWORD;

  if (!expectedPassword) {
    return loginRedirect(request, "missing-password");
  }

  if (submittedPassword !== expectedPassword) {
    return loginRedirect(request, "invalid");
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
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
