import { createClient } from "@supabase/supabase-js";
import "server-only";

function getEnvValue(name: string) {
  return process.env[name] ?? "";
}

function getRequiredEnv(name: string) {
  const value = getEnvValue(name);

  if (!value) {
    throw new Error(`Supabase sync env var missing: ${name}`);
  }

  return value;
}

export function getTrainVaultSyncId() {
  return process.env.TRAINVAULT_SYNC_ID || "ray";
}

function decodeJwtPayload(key: string): Record<string, unknown> | null {
  const [, payload] = key.split(".");

  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function serviceKeyLooksAnon(serviceRoleKey: string) {
  const lowerKey = serviceRoleKey.toLowerCase();

  if (
    lowerKey.startsWith("sb_publishable_") ||
    lowerKey.startsWith("supabase_publishable_") ||
    lowerKey.startsWith("publishable_")
  ) {
    return true;
  }

  const jwtPayload = decodeJwtPayload(serviceRoleKey);
  const role = typeof jwtPayload?.role === "string" ? jwtPayload.role.toLowerCase() : "";

  return role === "anon" || role === "authenticated";
}

export function getSupabaseAdminClient() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (serviceKeyLooksAnon(serviceRoleKey)) {
    throw new Error("Supabase sync env var missing: valid server secret key");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
