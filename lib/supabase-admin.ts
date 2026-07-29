import { createClient } from "@supabase/supabase-js";

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

export function getSupabaseAdminDiagnostics() {
  const supabaseUrl = getEnvValue("SUPABASE_URL");
  const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  return {
    hasUrl: Boolean(supabaseUrl),
    hasServiceKey: Boolean(serviceRoleKey),
    envPresent: Boolean(supabaseUrl && serviceRoleKey),
    serviceKeyPrefix: serviceRoleKey.slice(0, 8),
    keyPrefix: serviceRoleKey.slice(0, 8),
    serviceKeyLooksAnon: serviceKeyLooksAnon(serviceRoleKey),
    syncId: getTrainVaultSyncId(),
  };
}

export function getSupabaseAdminClient() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
