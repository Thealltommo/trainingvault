import "server-only";

import type { NextRequest } from "next/server";

const WINDOW_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "unknown";
}

function removeExpiredEntries(now: number) {
  if (attempts.size < 256) {
    return;
  }

  attempts.forEach((value, key) => {
    if (value.resetAt <= now) {
      attempts.delete(key);
    }
  });
}

export function getLoginRateLimit(request: NextRequest, now = Date.now()) {
  removeExpiredEntries(now);
  const key = getClientKey(request);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count < MAX_ATTEMPTS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
  };
}

export function recordFailedLogin(request: NextRequest, now = Date.now()) {
  const key = getClientKey(request);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  attempts.set(key, {
    ...current,
    count: current.count + 1,
  });
}

export function clearFailedLogins(request: NextRequest) {
  attempts.delete(getClientKey(request));
}
