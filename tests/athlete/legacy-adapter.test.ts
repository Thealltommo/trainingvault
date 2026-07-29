import { describe, expect, it } from "vitest";
import {
  adaptLegacyProgramme,
  selectSessionVariant,
} from "../../lib/athlete";
import {
  legacyLog,
  legacyOverride,
  legacyProgramme,
} from "./fixtures";

describe("legacy athlete adapter", () => {
  it("preserves source identity and separates original, current, and completed prescriptions", () => {
    const session = adaptLegacyProgramme(legacyProgramme, {
      overrides: { "threshold-run": legacyOverride },
      logs: [legacyLog],
    })[0];

    expect(session.source.legacyProgrammeId).toBe("legacy-plan");
    expect(session.source.legacyWorkoutId).toBe("threshold-run");
    expect(session.status).toBe("completed");
    expect(session.isModified).toBe(true);
    expect(session.originalPrescription.durationMinutes).toBe(60);
    expect(session.currentPrescription.durationMinutes).toBe(45);
    expect(session.completedPrescription?.actualDurationMinutes).toBe(43);
    expect(session.completedPrescription?.actualDistanceMeters).toBe(4_000);
    expect(session.modificationReason).toBe("Heavy legs after Hawkeye");
  });

  it("creates deterministic session and stable block IDs across repeated adaptation and block edits", () => {
    const first = adaptLegacyProgramme(legacyProgramme)[0];
    const second = adaptLegacyProgramme(legacyProgramme, {
      overrides: { "threshold-run": legacyOverride },
    })[0];
    const third = adaptLegacyProgramme(legacyProgramme)[0];

    expect(first.id).toBe(second.id);
    expect(first.id).toBe(third.id);
    expect(
      first.originalPrescription.blocks.map((block) => block.id),
    ).toEqual(second.originalPrescription.blocks.map((block) => block.id));
    expect(
      second.currentPrescription.blocks.map((block) => block.id),
    ).toEqual(second.originalPrescription.blocks.map((block) => block.id));
  });

  it("retains semantic block IDs when legacy blocks are reordered", () => {
    const originalBlocks = legacyProgramme.weeks[0].days[0].workout.blocks;
    const session = adaptLegacyProgramme(legacyProgramme, {
      overrides: {
        "threshold-run": {
          workoutId: "threshold-run",
          blocks: [originalBlocks[2], originalBlocks[0], originalBlocks[1]],
          updatedAt: "2026-08-02T12:00:00.000Z",
        },
      },
    })[0];

    session.currentPrescription.blocks.forEach((current) => {
      const original = session.originalPrescription.blocks.find(
        (candidate) => candidate.name === current.name,
      );
      expect(current.id).toBe(original?.id);
    });
  });

  it("always exposes full, adjusted, and minimum variants conservatively", () => {
    const session = adaptLegacyProgramme(legacyProgramme)[0];

    expect(Object.keys(session.variants).sort()).toEqual([
      "adjusted",
      "full",
      "minimum",
    ]);
    expect(session.variants.full.prescription.durationMinutes).toBe(60);
    expect(session.variants.adjusted.prescription.durationMinutes).toBeLessThan(60);
    expect(session.variants.minimum.prescription.durationMinutes).toBe(30);
    expect(
      session.variants.minimum.prescription.blocks.length <=
        session.variants.full.prescription.blocks.length,
    ).toBe(true);

    const selected = selectSessionVariant(
      session,
      "adjusted",
      "Poor sleep",
    );
    expect(selected.status).toBe("modified");
    expect(selected.selectedVariant).toBe("adjusted");
    expect(selected.modificationReason).toBe("Poor sleep");
    expect(selected.plannedLoad.plannedCost).toBeLessThan(
      session.plannedLoad.plannedCost,
    );
  });

  it("caps malformed legacy scale-down changes at the full prescription", () => {
    const programme = structuredClone(legacyProgramme);
    const workout = programme.weeks[0].days[0].workout;
    workout.intensity = "easy";
    workout.scaleOptions = [
      {
        id: "unsafe-scale-down",
        label: "Unsafe legacy scale",
        type: "scale_down",
        description: "Legacy data should not be trusted to increase load.",
        changes: {
          durationMinutes: 90,
          intensity: "hard",
          focus: undefined,
        },
      },
    ];

    const adjusted =
      adaptLegacyProgramme(programme)[0].variants.adjusted.prescription;
    expect(adjusted.durationMinutes).toBe(60);
    expect(adjusted.intensity).toBe("easy");
    expect(adjusted.focus).toEqual(workout.focus);
  });
});
