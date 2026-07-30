import "server-only";

import { getSupabaseAdminClient, getTrainVaultSyncId } from "@/lib/supabase-admin";
import {
  fingerprintTrainVaultSnapshot,
  parseTrainVaultCloudSnapshot,
  projectTrainVaultSnapshot,
  type TrainVaultCloudSnapshot,
} from "@/lib/v3-projection";

export type V3SyncResult = {
  updatedAt: string;
  fingerprint: string;
  entityCount: number;
};

function cleanResult(value: unknown, fallbackFingerprint: string, fallbackCount: number): V3SyncResult {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    updatedAt:
      typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    fingerprint:
      typeof row.fingerprint === "string" ? row.fingerprint : fallbackFingerprint,
    entityCount:
      typeof row.entity_count === "number" && Number.isFinite(row.entity_count)
        ? Math.max(0, Math.round(row.entity_count))
        : fallbackCount,
  };
}

export async function persistCanonicalSnapshot(value: unknown): Promise<V3SyncResult> {
  const snapshot = parseTrainVaultCloudSnapshot(value);
  if (!snapshot) {
    throw new Error("Invalid TrainVault cloud snapshot.");
  }

  const syncId = getTrainVaultSyncId();
  const entities = projectTrainVaultSnapshot(snapshot);
  const fingerprint = fingerprintTrainVaultSnapshot(snapshot);
  const client = getSupabaseAdminClient();

  const { data, error } = await client.rpc("trainvault_v3_sync_snapshot", {
    p_sync_id: syncId,
    p_snapshot: snapshot,
    p_fingerprint: fingerprint,
    p_exported_at: snapshot.exportedAt,
    p_entities: entities,
  });

  if (error) {
    throw new Error("Canonical TrainVault cloud sync failed.");
  }

  return cleanResult(data, fingerprint, entities.length);
}

export async function getCanonicalCloudSummary() {
  const syncId = getTrainVaultSyncId();
  const client = getSupabaseAdminClient();

  const [latestRunResult, snapshotCountResult, entitiesResult] = await Promise.all([
    client
      .from("trainvault_v3_sync_runs")
      .select("created_at, fingerprint, entity_count")
      .eq("sync_id", syncId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("trainvault_v3_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("sync_id", syncId),
    client
      .from("trainvault_v3_entities")
      .select("entity_type, effective_date, data")
      .eq("sync_id", syncId)
      .limit(5_000),
  ]);

  if (latestRunResult.error || snapshotCountResult.error || entitiesResult.error) {
    throw new Error("Canonical TrainVault cloud summary is unavailable.");
  }

  const counts: Record<string, number> = {};
  let latestRecoveryDate: string | null = null;
  let latestGarminActivityDate: string | null = null;
  let latestSessionDate: string | null = null;

  for (const row of entitiesResult.data ?? []) {
    const type = typeof row.entity_type === "string" ? row.entity_type : "unknown";
    counts[type] = (counts[type] ?? 0) + 1;
    const effectiveDate = typeof row.effective_date === "string" ? row.effective_date : null;
    if (!effectiveDate) continue;

    if (type === "recovery" && (!latestRecoveryDate || effectiveDate > latestRecoveryDate)) {
      latestRecoveryDate = effectiveDate;
    }
    if (type === "garmin_activity" && (!latestGarminActivityDate || effectiveDate > latestGarminActivityDate)) {
      latestGarminActivityDate = effectiveDate;
    }
    if (type === "session" && (!latestSessionDate || effectiveDate > latestSessionDate)) {
      latestSessionDate = effectiveDate;
    }
  }

  const latestRun = latestRunResult.data;
  const entityCount = Object.values(counts).reduce((total, count) => total + count, 0);

  return {
    version: 3,
    canonical: true,
    syncId,
    lastSyncedAt: latestRun?.created_at ?? null,
    fingerprint: latestRun?.fingerprint ?? null,
    snapshotCount: snapshotCountResult.count ?? 0,
    entityCount,
    counts,
    latestRecoveryDate,
    latestGarminActivityDate,
    latestSessionDate,
  };
}

export function ensureCanonicalSnapshot(value: unknown): TrainVaultCloudSnapshot {
  const parsed = parseTrainVaultCloudSnapshot(value);
  if (!parsed) throw new Error("Invalid TrainVault cloud snapshot.");
  return parsed;
}
