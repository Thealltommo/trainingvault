"use client";

import type { CoachRewriteKind } from "@/lib/coach-schema";
import { buildPlanStudioStructuredWorkout, type PlanStudioSession } from "@/lib/plan-studio";
import type { CalendarSession } from "@/lib/planning-storage";
import { saveStructuredRunningWorkout } from "@/lib/structured-running-storage";
import { getWorkoutOverride, saveWorkoutOverride } from "@/lib/storage";

const REWRITE_TEMPLATES: Record<
  CoachRewriteKind,
  {
    title: string;
    durationMinutes: (current: number) => number;
    minimumMinutes: number;
    intensity: "easy" | "moderate" | "hard";
    prescription: string;
    targetStimulus: string;
    role: PlanStudioSession["role"];
  }
> = {
  intervals: {
    title: "5K rhythm intervals",
    durationMinutes: () => 52,
    minimumMinutes: 32,
    intensity: "hard",
    prescription:
      "12 min warm-up\n6 × 3 min at controlled 5K–10K effort / 2 min easy\n10 min cool-down",
    targetStimulus:
      "Raise aerobic power and 5K-specific speed while keeping every rep repeatable.",
    role: "quality",
  },
  threshold: {
    title: "Threshold builder",
    durationMinutes: () => 52,
    minimumMinutes: 32,
    intensity: "hard",
    prescription:
      "12 min warm-up\n3 × 8 min controlled threshold / 2 min easy\n10 min cool-down",
    targetStimulus:
      "Raise sustainable speed without turning the session into a race effort.",
    role: "quality",
  },
  long: {
    title: "Long aerobic run",
    durationMinutes: (current) => Math.max(60, current),
    minimumMinutes: 40,
    intensity: "easy",
    prescription:
      "Keep the first two thirds conversational\nFinish steady only if mechanics remain relaxed",
    targetStimulus:
      "Endurance and fatigue resistance without turning the long run into a race.",
    role: "long",
  },
  easy: {
    title: "Easy aerobic run",
    durationMinutes: (current) => Math.max(25, current),
    minimumMinutes: 25,
    intensity: "easy",
    prescription:
      "10 min relaxed\nEasy conversational running\nFinish with 4 × 15 sec relaxed strides if legs feel good",
    targetStimulus:
      "Aerobic volume with low mechanical and nervous-system cost.",
    role: "easy",
  },
};

export function coachRewriteLabel(kind: CoachRewriteKind) {
  return {
    intervals: "5K intervals",
    threshold: "threshold",
    long: "long aerobic run",
    easy: "easy aerobic run",
  }[kind];
}

export function applyCoachSessionRewrite(
  session: CalendarSession,
  kind: CoachRewriteKind,
  reason: string,
) {
  const template = REWRITE_TEMPLATES[kind];
  const durationMinutes = template.durationMinutes(session.workout.durationMinutes);
  const minimumMinutes = Math.min(template.minimumMinutes, durationMinutes);
  const items = template.prescription.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const current = getWorkoutOverride(session.id);

  saveWorkoutOverride({
    ...(current ?? { workoutId: session.id, updatedAt: "" }),
    workoutId: session.id,
    title: template.title,
    durationMinutes,
    minimumMinutes,
    intensity: template.intensity,
    prescribedLoadsOrPace: template.prescription,
    targetStimulus: template.targetStimulus,
    blocks: [
      {
        name: "Run prescription",
        type: "intervals",
        durationMinutes,
        items,
      },
    ],
    modificationReason: `Coach rewrite confirmed by athlete: ${reason}`,
    updatedAt: new Date().toISOString(),
  });

  const structured = buildPlanStudioStructuredWorkout(session.id, {
    id: `coach-${session.id}-${kind}`,
    week: 0,
    date: session.scheduledDate,
    title: template.title,
    type: session.type === "fell-trail" ? "fell-trail" : "run",
    durationMinutes,
    minimumMinutes,
    intensity: template.intensity,
    prescription: template.prescription,
    targetStimulus: template.targetStimulus,
    role: template.role,
  });

  if (structured) {
    saveStructuredRunningWorkout(structured);
  }
}
