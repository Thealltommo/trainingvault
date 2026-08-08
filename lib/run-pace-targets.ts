import type {
  RunningStepTarget,
  StructuredRunningElement,
  StructuredRunningWorkout,
} from "@/lib/garmin/types";

export type RunPaceBand = {
  fastestSecondsPerKm: number;
  slowestSecondsPerKm: number;
  label: string;
  rationale: string;
};

// TrainVault is currently a private single-athlete app. This is the athlete's
// current calibrated 5K baseline from Plan Studio. Future profile work can move
// this into durable athlete settings without changing the target engine.
export const DEFAULT_CURRENT_FIVE_K = "22:19";

export function parseFiveKSeconds(value: string) {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total >= 12 * 60 && total <= 60 * 60 ? total : null;
}

export function formatPaceBandValue(secondsPerKm: number) {
  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${seconds}/km`;
}

function band(
  fiveKPace: number,
  fastestFactor: number,
  slowestFactor: number,
  rationale: string,
): RunPaceBand {
  const fastestSecondsPerKm = Math.round(fiveKPace * fastestFactor);
  const slowestSecondsPerKm = Math.round(fiveKPace * slowestFactor);
  return {
    fastestSecondsPerKm,
    slowestSecondsPerKm,
    label: `${formatPaceBandValue(fastestSecondsPerKm)}–${formatPaceBandValue(slowestSecondsPerKm)}`,
    rationale,
  };
}

export function deriveRunPaceBand(
  workoutName: string,
  currentFiveK = DEFAULT_CURRENT_FIVE_K,
): RunPaceBand | null {
  const fiveKSeconds = parseFiveKSeconds(currentFiveK);
  if (fiveKSeconds == null) return null;
  const fiveKPace = fiveKSeconds / 5;
  const signal = workoutName.toLowerCase();

  if (/hill|uphill|fell|trail|mountain/.test(signal)) {
    return null;
  }

  if (/threshold|tempo|cruise/.test(signal)) {
    return band(
      fiveKPace,
      1.05,
      1.09,
      "Threshold is anchored to current 5K fitness, not aspirational race pace.",
    );
  }

  if (/rhythm|interval|vo2|speed/.test(signal)) {
    return band(
      fiveKPace,
      0.99,
      1.04,
      "Short quality work stays around current 5K-to-10K effort and must remain repeatable.",
    );
  }

  if (/long/.test(signal)) {
    return band(
      fiveKPace,
      1.22,
      1.38,
      "Long runs stay clearly aerobic with room for terrain, fatigue and cardiac drift.",
    );
  }

  if (/easy|recovery|aerobic/.test(signal)) {
    return band(
      fiveKPace,
      1.27,
      1.45,
      "Easy running is deliberately broad so pace never overrides recovery intent.",
    );
  }

  if (/hybrid-safe|controlled hard/.test(signal)) {
    return band(
      fiveKPace,
      1.02,
      1.07,
      "Hybrid quality work is controlled below all-out 5K effort.",
    );
  }

  return null;
}

function withPaceTarget(
  step: Extract<StructuredRunningElement, { kind: "step" }>,
  pace: RunPaceBand,
) {
  if (step.phase !== "work" || step.target.type !== "open") return step;

  const target: RunningStepTarget = {
    type: "pace",
    fastestSecondsPerKm: pace.fastestSecondsPerKm,
    slowestSecondsPerKm: pace.slowestSecondsPerKm,
  };
  const description = step.description?.trim() || "Work interval";

  return {
    ...step,
    target,
    description: `${description} · target ${pace.label}`,
  };
}

export function applyDerivedPaceTargets(
  workout: StructuredRunningWorkout,
  currentFiveK = DEFAULT_CURRENT_FIVE_K,
): StructuredRunningWorkout {
  const pace = deriveRunPaceBand(workout.name, currentFiveK);
  if (!pace) return workout;

  let changed = false;
  const steps = workout.steps.map((element) => {
    if (element.kind === "repeat") {
      const nextSteps = element.steps.map((step) => {
        const next = withPaceTarget(step, pace);
        if (next !== step) changed = true;
        return next;
      });
      return nextSteps.some((step, index) => step !== element.steps[index])
        ? { ...element, steps: nextSteps }
        : element;
    }

    const next = withPaceTarget(element, pace);
    if (next !== element) changed = true;
    return next;
  });

  if (!changed) return workout;

  return {
    ...workout,
    steps,
    description: workout.description
      ? `${workout.description} Pace target: ${pace.label}.`
      : `Pace target: ${pace.label}.`,
  };
}
