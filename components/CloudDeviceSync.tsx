"use client";

import { useEffect } from "react";
import {
  applyCloudDeviceSnapshot,
  captureCloudDeviceSnapshot,
  hasLocalTrainVaultData,
  pullCloudDeviceSnapshot,
  pushCloudDeviceSnapshot,
  readCloudSyncMeta,
  snapshotFingerprint,
  writeCloudSyncMeta,
} from "@/lib/cloud-device-sync";

const AUTO_SYNC_INTERVAL_MS = 45_000;

function isNewer(candidate: string | null, baseline: string | null) {
  if (!candidate) return false;
  if (!baseline) return true;
  const candidateTime = Date.parse(candidate);
  const baselineTime = Date.parse(baseline);
  return Number.isFinite(candidateTime) && Number.isFinite(baselineTime)
    ? candidateTime > baselineTime
    : candidate !== baseline;
}

export default function CloudDeviceSync() {
  useEffect(() => {
    let cancelled = false;
    let syncing = false;
    const controller = new AbortController();

    async function reconcile() {
      if (cancelled || syncing) return;
      syncing = true;

      try {
        const local = captureCloudDeviceSnapshot();
        const localFingerprint = snapshotFingerprint(local);
        const meta = readCloudSyncMeta();
        const cloud = await pullCloudDeviceSnapshot(controller.signal);
        if (cancelled) return;

        if (!hasLocalTrainVaultData() && cloud.snapshot) {
          applyCloudDeviceSnapshot(cloud.snapshot);
          writeCloudSyncMeta({
            version: 1,
            lastCloudUpdatedAt: cloud.updatedAt,
            lastFingerprint: snapshotFingerprint(cloud.snapshot),
          });
          window.location.reload();
          return;
        }

        // Devices that have never established a sync baseline are deliberately
        // left untouched. Settings provides the explicit first push/restore.
        if (!meta.lastFingerprint) return;

        const localDirty = localFingerprint !== meta.lastFingerprint;
        const cloudNewer = isNewer(cloud.updatedAt, meta.lastCloudUpdatedAt);

        if (!localDirty && cloudNewer && cloud.snapshot) {
          applyCloudDeviceSnapshot(cloud.snapshot);
          writeCloudSyncMeta({
            version: 1,
            lastCloudUpdatedAt: cloud.updatedAt,
            lastFingerprint: snapshotFingerprint(cloud.snapshot),
          });
          window.location.reload();
          return;
        }

        // If both sides changed, never guess which device wins. Leave the
        // state untouched until the athlete resolves it explicitly in Settings.
        if (localDirty && cloudNewer) return;

        if (localDirty) {
          await pushCloudDeviceSnapshot(local);
        }
      } catch {
        // Cloud sync remains optional. Offline, missing env, or a sleeping
        // provider must never block local training access.
      } finally {
        syncing = false;
      }
    }

    void reconcile();
    const interval = window.setInterval(() => void reconcile(), AUTO_SYNC_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
