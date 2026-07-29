import { describe, expect, it } from "vitest";
import {
  parseCloudDeviceSnapshot,
  snapshotFingerprint,
  type CloudDeviceSnapshot,
} from "@/lib/cloud-device-sync";

describe("cloud device sync snapshot", () => {
  it("accepts only TrainVault-owned storage keys", () => {
    const parsed = parseCloudDeviceSnapshot({
      version: 1,
      exportedAt: "2026-07-29T17:00:00.000Z",
      entries: {
        trainvault_active_programme: "{}",
        selectedTodayWorkoutId: "session-1",
        unrelated_key: "do-not-copy",
        trainvault_cloud_device_sync_meta_v1: "do-not-recursively-copy",
      },
    });

    expect(parsed?.entries).toEqual({
      trainvault_active_programme: "{}",
      selectedTodayWorkoutId: "session-1",
    });
  });

  it("rejects malformed snapshots instead of guessing", () => {
    expect(parseCloudDeviceSnapshot({ version: 2, entries: {} })).toBeNull();
    expect(
      parseCloudDeviceSnapshot({
        version: 1,
        exportedAt: "2026-07-29T17:00:00.000Z",
        entries: [],
      }),
    ).toBeNull();
  });

  it("produces a stable fingerprint independent of entry order", () => {
    const first: CloudDeviceSnapshot = {
      version: 1,
      exportedAt: "2026-07-29T17:00:00.000Z",
      entries: {
        trainvault_session_logs: "[]",
        trainvault_active_programme: "{}",
      },
    };
    const second: CloudDeviceSnapshot = {
      ...first,
      entries: {
        trainvault_active_programme: "{}",
        trainvault_session_logs: "[]",
      },
    };

    expect(snapshotFingerprint(first)).toBe(snapshotFingerprint(second));
  });
});
