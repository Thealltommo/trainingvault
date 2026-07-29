import { describe, expect, it } from "vitest";
import {
  normalizeDailyRecovery,
  recoverySignalCount,
  toDailyRecoveryInput,
} from "../lib/recovery-storage";

describe("local recovery normalization", () => {
  it("keeps absent signals null and rejects records without a usable date", () => {
    expect(normalizeDailyRecovery({ sleepHours: 8 })).toBeNull();

    const record = normalizeDailyRecovery({
      date: "2026-08-05",
      source: "manual",
      sleepHours: null,
      soreness: "",
      updatedAt: "2026-08-05T06:00:00.000Z",
    });

    expect(record).not.toBeNull();
    expect(record?.sleepHours).toBeNull();
    expect(record?.soreness).toBeNull();
    expect(recoverySignalCount(record)).toBe(0);
  });

  it("bounds untrusted local values before they reach readiness rules", () => {
    const record = normalizeDailyRecovery({
      date: "2026-08-05",
      source: "garmin",
      sleepHours: 30,
      garminReadiness: 140,
      soreness: -5,
      subjectiveReadiness: 9,
      manualOverride: "minimum",
      manualOverrideReason: " Heavy legs ",
      updatedAt: "2026-08-05T06:00:00.000Z",
    });

    expect(record).toMatchObject({
      sleepHours: 24,
      garminReadiness: 100,
      soreness: 0,
      subjectiveReadiness: 9,
      manualOverride: "minimum",
      manualOverrideReason: "Heavy legs",
    });
  });

  it("prefers a stored provider load while accepting derived log load as a fallback", () => {
    const record = normalizeDailyRecovery({
      date: "2026-08-05",
      source: "mixed",
      recentLoad7d: 420,
      updatedAt: "2026-08-05T06:00:00.000Z",
    });

    const input = toDailyRecoveryInput(record, {
      date: "2026-08-05",
      recentLoad7d: 300,
      baselineLoad7d: 350,
      lowerBodyLoad48h: 55,
    });

    expect(input.recentLoad7d).toBe(420);
    expect(input.baselineLoad7d).toBe(350);
    expect(input.lowerBodyLoad48h).toBe(55);
  });
});
