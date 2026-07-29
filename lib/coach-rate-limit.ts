import "server-only";

import type { NextRequest } from "next/server";

const WINDOW_MS = 10 * 60 * 1_000;
const MAX_REQUESTS = 12;
const requests = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "private-athlete"
  );
}

export function consumeCoachRateLimit(
  request: NextRequest,
  now = Date.now(),
) {
  const key = clientKey(request);
  const current = requests.get(key);

  if (!current || current.resetAt <= now) {
    requests.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.resetAt - now) / 1_000),
      ),
    };
  }

  requests.set(key, { ...current, count: current.count + 1 });
  return { allowed: true, retryAfterSeconds: 0 };
}

