import { describe, expect, it } from "vitest";
import type { CoachDecision, CoachRequest } from "@/lib/coach-schema";
import {
  createCoachFallback,
  sanitizeCoachDecision,
} from "@/lib/coach";

const request: CoachRequest = {
  mode: "change_plan",
  message: "Sort my week",
  context: {
    today: "2026-07-29",
    readiness: {
      zone: "amber",
      score: 61,
      factors: ["Lower-body soreness is elevated."],
      athleteOverride: false,
    },
    sessions: [
      {
        id: "session-1",
        title: "Threshold",
        date: "2026-07-30",
        type: "run",
        status: "planned",
        variant: "full",
        durationMinutes: 60,
        intensity: "hard",
        targetStimulus: "Threshold development",
        lowerBodySignal: true,
      },
      {
        id: "session-complete",
        title: "Easy run",
        date: "2026-07-28",
        type: "run",
        status: "completed",
        variant: "full",
        durationMinutes: 40,
        intensity: "easy",
        targetStimulus: null,
        lowerBodySignal: true,
      },
    ],
    recentLogs: [],
    recentActivities: [],
    upcomingEvents: [],
  },
};

function decision(
  proposedChanges: CoachDecision["proposedChanges"],
): CoachDecision {
  return {
    summary: "Protect the quality session.",
    rationale: ["The supplied readiness signal is amber."],
    cautions: [],
    proposedChanges,
    changeStatus: proposedChanges.length > 0 ? "proposed" : "blocked",
    blockedReason: proposedChanges.length > 0 ? null : "No valid change supplied.",
    confidence: "medium",
    dataSummary: ["2 calendar sessions"],
  };
}

describe("controlled Coach decisions", () => {
  it("drops proposals for unknown and completed sessions", () => {
    const result = sanitizeCoachDecision(
      decision([
        {
          id: "unknown",
          action: "select_variant",
          sessionId: "missing",
          sessionTitle: "Invented",
          currentDate: null,
          newDate: null,
          variant: "minimum",
          rewriteKind: null,
          reason: "Not grounded",
        },
        {
          id: "complete",
          action: "select_variant",
          sessionId: "session-complete",
          sessionTitle: "Easy run",
          currentDate: "2026-07-28",
          newDate: null,
          variant: "adjusted",
          rewriteKind: null,
          reason: "Already completed",
        },
      ]),
      request,
    );

    expect(result.proposedChanges).toEqual([]);
    expect(result.changeStatus).toBe("blocked");
  });

  it("keeps only internally consistent, bounded proposals", () => {
    const result = sanitizeCoachDecision(
      decision([
        {
          id: "valid",
          action: "reschedule",
          sessionId: "session-1",
          sessionTitle: "Wrong title",
          currentDate: null,
          newDate: "2026-08-01",
          variant: null,
          rewriteKind: null,
          reason: "Create more lower-body separation.",
        },
        {
          id: "invalid-fields",
          action: "reschedule",
          sessionId: "session-1",
          sessionTitle: "Threshold",
          currentDate: "2026-07-30",
          newDate: "2026-08-02",
          variant: "minimum",
          rewriteKind: null,
          reason: "Two writes in one proposal.",
        },
      ]),
      request,
    );

    expect(result.proposedChanges).toHaveLength(1);
    expect(result.changeStatus).toBe("proposed");
    expect(result.proposedChanges[0]).toMatchObject({
      id: "valid",
      sessionTitle: "Threshold",
      currentDate: "2026-07-30",
    });
  });

  it("degrades without proposing writes", () => {
    const fallback = createCoachFallback(request, "not_configured");

    expect(fallback.proposedChanges).toEqual([]);
    expect(fallback.changeStatus).toBe("blocked");
    expect(fallback.confidence).toBe("low");
    expect(fallback.summary).toContain("not configured");
  });
});
