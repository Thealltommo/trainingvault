import "server-only";

import type { NextRequest } from "next/server";

export const AUTH_COOKIE = "trainvault_auth";
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  exp: number;
  nonce: string;
  version: 1;
};

function getSessionSecret() {
  const secret = process.env.TRAINVAULT_SESSION_SECRET || process.env.TRAINVAULT_PASSWORD;

  if (!secret) {
    throw new Error("TrainVault auth is not configured");
  }

  return secret;
}

function encodeBase64Url(value: Uint8Array | string) {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return buffer.toString("base64url");
}

function decodeBase64Url(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return new Uint8Array(signature);
}

function constantTimeEqual(first: Uint8Array, second: Uint8Array) {
  if (first.length !== second.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.length; index += 1) {
    difference |= first[index] ^ second[index];
  }

  return difference === 0;
}

export async function createAuthToken(now = Date.now()) {
  const payload: SessionPayload = {
    exp: Math.floor(now / 1000) + AUTH_SESSION_MAX_AGE_SECONDS,
    nonce: crypto.randomUUID(),
    version: 1,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = encodeBase64Url(await hmac(encodedPayload));

  return `${encodedPayload}.${signature}`;
}

export async function verifyAuthToken(token: string | null | undefined, now = Date.now()) {
  if (!token) {
    return false;
  }

  const [encodedPayload, encodedSignature, extra] = token.split(".");

  if (!encodedPayload || !encodedSignature || extra) {
    return false;
  }

  try {
    const expectedSignature = await hmac(encodedPayload);
    const suppliedSignature = decodeBase64Url(encodedSignature);

    if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
      return false;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionPayload>;

    return (
      payload.version === 1 &&
      typeof payload.exp === "number" &&
      Number.isSafeInteger(payload.exp) &&
      payload.exp > Math.floor(now / 1000) &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 16
    );
  } catch {
    return false;
  }
}

export async function isAuthorizedRequest(request: NextRequest) {
  return verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value);
}

export async function passwordMatches(submittedPassword: string) {
  const expectedPassword = process.env.TRAINVAULT_PASSWORD;

  if (!expectedPassword) {
    return false;
  }

  const [submittedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(submittedPassword)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expectedPassword)),
  ]);

  return constantTimeEqual(new Uint8Array(submittedDigest), new Uint8Array(expectedDigest));
}

export function safeRedirectPath(value: FormDataEntryValue | string | null | undefined) {
  const path = typeof value === "string" ? value.trim() : "";

  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.length > 2_048
  ) {
    return "/";
  }

  return path;
}

