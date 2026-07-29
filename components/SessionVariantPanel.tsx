"use client";

import { Check, ShieldCheck } from "lucide-react";
import {
  getCalendarSessions,
  getManualSession,
  selectCalendarSessionVariant,
  type SessionVariantId,
} from "@/lib/planning-storage";
import {
  getActiveProgramme,
  getSessionLogs,
  getWorkoutOverrides,
} from "@/lib/storage";
import type { Workout } from "@/lib/types";

type SessionVariantPanelProps = {
  workout: Workout;
  sourceWorkout: Workout;
  recommendedVariant?: SessionVariantId;
  recommendationReason?: string;
};

const variants: Array<{
  id: SessionVariantId;
  label: string;
  description: string;
}> = [
  {
    id: "full",
    label: "Full",
    description: "Normal intended stimulus.",
  },
  {
    id: "adjusted",
    label: "Adjusted",
    description: "Preserves the intent with lower cost.",
  },
  {
    id: "minimum",
    label: "Minimum",
    description: "Smallest useful version for a constrained day.",
  },
];

function inferSelectedVariant(workout: Workout, sourceWorkout: Workout): SessionVariantId {
  const manual = getManualSession(sourceWorkout.id);

  if (manual) {
    return manual.selectedVariant;
  }

  if (
    workout.minimumMinutes &&
    workout.durationMinutes <= workout.minimumMinutes
  ) {
    return "minimum";
  }

  if (
    workout.durationMinutes !== sourceWorkout.durationMinutes ||
    workout.blocks !== sourceWorkout.blocks
  ) {
    return "adjusted";
  }

  return "full";
}

export default function SessionVariantPanel({
  workout,
  sourceWorkout,
  recommendedVariant = "full",
  recommendationReason = "No recovery constraint currently requires a reduction.",
}: SessionVariantPanelProps) {
  const selectedVariant = inferSelectedVariant(workout, sourceWorkout);

  function handleSelect(variant: SessionVariantId) {
    const reason =
      variant === recommendedVariant
        ? `Selected ${variant}: ${recommendationReason}`
        : `Athlete selected ${variant} instead of the ${recommendedVariant} recommendation.`;

    const session = getCalendarSessions(
      getActiveProgramme(),
      getManualSession(sourceWorkout.id)
        ? [getManualSession(sourceWorkout.id)!]
        : [],
      getSessionLogs(),
      getWorkoutOverrides(),
      {},
    ).find((candidate) => candidate.id === sourceWorkout.id);

    if (session) {
      selectCalendarSessionVariant(session, variant, reason);
    }
  }

  return (
    <section className="tv-card border-[rgba(215,255,47,0.34)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Session Variant</p>
          <h2 className="mt-1 text-2xl font-black uppercase">
            Full / adjusted / minimum
          </h2>
        </div>
        <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.1)] px-3 text-xs font-black uppercase text-[var(--accent)]">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Recommended: {recommendedVariant}
        </span>
      </div>

      <p className="mt-3 text-sm font-bold text-[var(--muted)]">
        Why: {recommendationReason}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {variants.map((variant) => {
          const selected = selectedVariant === variant.id;
          const recommended = recommendedVariant === variant.id;

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => handleSelect(variant.id)}
              aria-pressed={selected}
              className={`min-h-24 rounded-md border p-3 text-left transition-colors ${
                selected
                  ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                  : recommended
                    ? "border-[rgba(215,255,47,0.55)] bg-[rgba(215,255,47,0.08)] text-[var(--text)]"
                    : "border-[var(--border)] bg-black text-[var(--text)]"
              }`}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-black uppercase">
                {variant.label}
                {selected ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : null}
              </span>
              <span
                className={`mt-2 block text-xs font-bold ${
                  selected ? "text-black/75" : "text-[var(--muted)]"
                }`}
              >
                {variant.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
