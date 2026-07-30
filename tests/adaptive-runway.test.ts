import { describe, expect, it } from "vitest";
import { deriveAdaptiveRunway } from "@/lib/adaptive-runway";
import type { CalendarSession } from "@/lib/planning-storage";

function session(input: {
  id: string;
  date: string;
  title: string;
  type: CalendarSession["type"];
  intensity: "easy" | "moderate" | "hard";
  duration?: number;
}): CalendarSession {
  const workout = {
    id: input.id,
    title: input.title,
    category: input.type === "run" || input.type === "fell-trail" ? "track" : "hybrid",
    durationMinutes: input.duration ?? 60,
    intensity: input.intensity,
    date: input.date,
    focus: [],
    equipment: [],
    blocks: [],
  } as CalendarSession["workout"];

  return {
    id: input.id,
    source: "manual",
    type: input.type,
    scheduledDate: input.date,
    status: "planned",
    workout,
    originalWorkout: workout,
    selectedVariant: "full",
  };
}

describe("deriveAdaptiveRunway", () => {
  it("selects the adjusted variant when readiness is adjusted", () => {
    const result = deriveAdaptiveRunway({
      today: "2026-07-30",
      readiness: "adjusted",
      sessions: [
        session({
          id: "quality-run",
          date: "2026-07-30",
          title: "Threshold",
          type: "run",
          intensity: "hard",
        }),
      ],
    });

    expect(result.proposals).toContainEqual(
      expect.objectContaining({
        sessionId: "quality-run",
        kind: "select_variant",
        variant: "adjusted",
      }),
    );
  });

  it("flags consecutive hard lower-body work and suggests an open date", () => {
    const result = deriveAdaptiveRunway({
      today: "2026-07-30",
      readiness: "full",
      sessions: [
        session({
          id: "hawkeye",
          date: "2026-07-30",
          title: "Hawkeye",
          type: "crossfit",
          intensity: "hard",
        }),
        session({
          id: "intervals",
          date: "2026-07-31",
          title: "5K intervals",
          type: "run",
          intensity: "hard",
        }),
      ],
    });

    expect(result.warnings.some((warning) => warning.includes("Hard lower-body density"))).toBe(true);
    expect(result.proposals).toContainEqual(
      expect.objectContaining({
        sessionId: "intervals",
        kind: "reschedule",
        newDate: "2026-08-01",
      }),
    );
  });

  it("protects long mountain work as an endurance anchor", () => {
    const result = deriveAdaptiveRunway({
      today: "2026-07-30",
      readiness: "full",
      sessions: [
        session({
          id: "mountain",
          date: "2026-08-01",
          title: "Helvellyn",
          type: "fell-trail",
          intensity: "moderate",
          duration: 180,
        }),
      ],
    });

    expect(result.protectedSessionIds).toContain("mountain");
    expect(result.proposals).toContainEqual(
      expect.objectContaining({ sessionId: "mountain", kind: "protect" }),
    );
  });
});
