import { describe, expect, it } from "vitest";
import {
  fingerprintTrainVaultSnapshot,
  parseTrainVaultCloudSnapshot,
  projectTrainVaultSnapshot,
} from "@/lib/v3-projection";

describe("V3 snapshot projection", () => {
  it("projects planning, recovery and Garmin evidence into stable entities", () => {
    const snapshot = parseTrainVaultCloudSnapshot({
      version: 1,
      exportedAt: "2026-07-30T10:00:00.000Z",
      entries: {
        trainvault_manual_sessions_v1: JSON.stringify([
          {
            id: "manual-1",
            scheduledDate: "2026-07-31",
            originalWorkout: { title: "Easy run" },
          },
        ]),
        trainvault_session_logs: JSON.stringify([
          {
            id: "log-1",
            workoutId: "manual-1",
            completedAt: "2026-07-30T09:00:00.000Z",
            rpe: 6,
          },
        ]),
        trainvault_recovery_records_v1: JSON.stringify([
          {
            date: "2026-07-30",
            sleepHours: 8.3,
            restingHeartRate: 52,
          },
        ]),
        trainvault_garmin_v1: JSON.stringify({
          activities: [
            {
              importedAt: "2026-07-30T09:30:00.000Z",
              activity: {
                activityId: "garmin-123",
                activityType: "running",
                localStartTime: "2026-07-29T18:10:00.000Z",
              },
              match: { kind: "none", confidence: "low", candidate: null, alternatives: [] },
            },
          ],
          workoutSync: {},
        }),
      },
    });

    expect(snapshot).not.toBeNull();
    const projected = projectTrainVaultSnapshot(snapshot!);

    expect(projected.map((item) => item.entity_type)).toEqual([
      "garmin_activity",
      "recovery",
      "session",
      "session_log",
    ]);
    expect(projected.find((item) => item.entity_type === "garmin_activity")?.effective_date).toBe(
      "2026-07-29",
    );
    expect(fingerprintTrainVaultSnapshot(snapshot!)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects non-TrainVault snapshot shapes", () => {
    expect(parseTrainVaultCloudSnapshot({ version: 2, entries: {} })).toBeNull();
  });
});
