import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAuthToken,
  safeRedirectPath,
  verifyAuthToken,
} from "../lib/auth";

describe("signed TrainVault sessions", () => {
  const originalPassword = process.env.TRAINVAULT_PASSWORD;
  const originalSessionSecret = process.env.TRAINVAULT_SESSION_SECRET;

  beforeEach(() => {
    process.env.TRAINVAULT_PASSWORD = "test-password";
    process.env.TRAINVAULT_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  });

  afterEach(() => {
    process.env.TRAINVAULT_PASSWORD = originalPassword;
    process.env.TRAINVAULT_SESSION_SECRET = originalSessionSecret;
  });

  it("accepts a valid signed token before expiry", async () => {
    const now = Date.UTC(2026, 6, 29);
    const token = await createAuthToken(now);

    await expect(verifyAuthToken(token, now + 1_000)).resolves.toBe(true);
  });

  it("rejects forged, malformed, and expired tokens", async () => {
    const now = Date.UTC(2026, 6, 29);
    const token = await createAuthToken(now);
    const [payload] = token.split(".");

    await expect(verifyAuthToken(`${payload}.forged`, now)).resolves.toBe(false);
    await expect(verifyAuthToken("1", now)).resolves.toBe(false);
    await expect(verifyAuthToken(token, now + 31 * 24 * 60 * 60 * 1_000)).resolves.toBe(false);
  });
});

describe("safe login redirects", () => {
  it("keeps local paths and rejects external or malformed paths", () => {
    expect(safeRedirectPath("/plan?view=week")).toBe("/plan?view=week");
    expect(safeRedirectPath("https://example.com")).toBe("/");
    expect(safeRedirectPath("//example.com")).toBe("/");
    expect(safeRedirectPath("/\\example.com")).toBe("/");
  });
});
