import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_SESSION_MAX_AGE_SECONDS,
  createAuthToken,
  passwordMatches,
  safeRedirectPath,
} from "@/lib/auth";
import {
  clearFailedLogins,
  getLoginRateLimit,
  recordFailedLogin,
} from "@/lib/login-rate-limit";

function loginRedirect(request: NextRequest, error?: string) {
  const url = new URL("/login", request.url);

  if (error) {
    url.searchParams.set("error", error);
  }

  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const rateLimit = getLoginRateLimit(request);

  if (!rateLimit.allowed) {
    const response = loginRedirect(request, "rate-limited");
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return response;
  }

  const formData = await request.formData();
  const submittedPassword = String(formData.get("password") ?? "");
  const destination = safeRedirectPath(formData.get("next"));

  if (!process.env.TRAINVAULT_PASSWORD) {
    return loginRedirect(request, "missing-password");
  }

  if (!(await passwordMatches(submittedPassword))) {
    recordFailedLogin(request);
    return loginRedirect(request, "invalid");
  }

  clearFailedLogins(request);
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.cookies.set({
    name: AUTH_COOKIE,
    value: await createAuthToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export function GET(request: NextRequest) {
  return loginRedirect(request);
}
