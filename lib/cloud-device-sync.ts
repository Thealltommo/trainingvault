"use client";

const META_KEY = "trainvault_cloud_device_sync_meta_v1";
const EXTRA_KEYS = new Set(["selectedTodayWorkoutId"]);
const MAX_ENTRY_BYTES = 1_500_000;

export type CloudDeviceSnapshot = {
  version: 1;
  exportedAt: string;
  entries: Record<string, string>;
};

export type CloudDeviceSyncMeta = {
  version: 1;
  lastCloudUpdatedAt: string | null;
  lastFingerprint: string | null;
};

export type CloudPullResult = {
  snapshot: CloudDeviceSnapshot | null;
  updatedAt: string | null;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function shouldSyncKey(key: string) {
  return key !== META_KEY && (key.startsWith("trainvault_") || EXTRA_KEYS.has(key));
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function captureCloudDeviceSnapshot(): CloudDeviceSnapshot {
  const entries: Record<string, string> = {};
  if (!canUseStorage()) {
    return { version: 1, exportedAt: new Date().toISOString(), entries };
  }

  let totalBytes = 0;
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && shouldSyncKey(key)) keys.push(key);
  }

  keys.sort();
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value === null) continue;
    totalBytes += byteLength(key) + byteLength(value);
    if (totalBytes > MAX_ENTRY_BYTES) {
      throw new Error("TrainVault cloud snapshot is too large to sync safely.");
    }
    entries[key] = value;
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

export function parseCloudDeviceSnapshot(value: unknown): CloudDeviceSnapshot | null {
  if (!isObject(value) || value.version !== 1 || typeof value.exportedAt !== "string") {
    return null;
  }
  if (!isObject(value.entries)) return null;

  const entries: Record<string, string> = {};
  let totalBytes = 0;
  for (const [key, raw] of Object.entries(value.entries)) {
    if (!shouldSyncKey(key) || typeof raw !== "string") continue;
    totalBytes += byteLength(key) + byteLength(raw);
    if (totalBytes > MAX_ENTRY_BYTES) return null;
    entries[key] = raw;
  }

  return { version: 1, exportedAt: value.exportedAt, entries };
}

export function hasLocalTrainVaultData() {
  return Object.keys(captureCloudDeviceSnapshot().entries).length > 0;
}

export function applyCloudDeviceSnapshot(snapshot: CloudDeviceSnapshot) {
  if (!canUseStorage()) return;

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && shouldSyncKey(key)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  Object.entries(snapshot.entries).forEach(([key, value]) => {
    window.localStorage.setItem(key, value);
  });
}

export function snapshotFingerprint(snapshot = captureCloudDeviceSnapshot()) {
  const source = Object.entries(snapshot.entries)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}\u0000${value}`)
    .join("\u0001");

  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function readCloudSyncMeta(): CloudDeviceSyncMeta {
  if (!canUseStorage()) {
    return { version: 1, lastCloudUpdatedAt: null, lastFingerprint: null };
  }
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) throw new Error("missing");
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || parsed.version !== 1) throw new Error("invalid");
    return {
      version: 1,
      lastCloudUpdatedAt:
        typeof parsed.lastCloudUpdatedAt === "string" ? parsed.lastCloudUpdatedAt : null,
      lastFingerprint:
        typeof parsed.lastFingerprint === "string" ? parsed.lastFingerprint : null,
    };
  } catch {
    return { version: 1, lastCloudUpdatedAt: null, lastFingerprint: null };
  }
}

export function writeCloudSyncMeta(meta: CloudDeviceSyncMeta) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function pullCloudDeviceSnapshot(signal?: AbortSignal): Promise<CloudPullResult> {
  const response = await fetch("/api/sync/pull", { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(response.status === 500 || response.status === 503 ? "Cloud sync is not configured." : "Cloud sync pull failed.");
  }
  const payload = (await response.json()) as { data?: unknown; updated_at?: unknown };
  return {
    snapshot: parseCloudDeviceSnapshot(payload.data),
    updatedAt: typeof payload.updated_at === "string" ? payload.updated_at : null,
  };
}

export async function pushCloudDeviceSnapshot(snapshot = captureCloudDeviceSnapshot()) {
  const response = await fetch("/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: snapshot }),
  });
  const payload = (await response.json()) as { updated_at?: unknown; error?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Cloud sync push failed.");
  }
  const updatedAt = typeof payload.updated_at === "string" ? payload.updated_at : new Date().toISOString();
  writeCloudSyncMeta({
    version: 1,
    lastCloudUpdatedAt: updatedAt,
    lastFingerprint: snapshotFingerprint(snapshot),
  });
  return updatedAt;
}
