import type {
  GarminRunningWorkoutRequest,
  RunningStepTarget,
  StructuredRunningElement,
  StructuredRunningStep,
  StructuredRunningWorkout,
} from "./types";

const MAX_WORKOUT_SECONDS = 7 * 24 * 60 * 60;

function requireFinitePositive(
  value: number,
  field: string,
  maximum = Number.POSITIVE_INFINITY,
) {
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new Error(`${field} must be greater than zero and within Garmin limits.`);
  }
}

function validateTarget(target: RunningStepTarget) {
  if (target.type === "pace") {
    requireFinitePositive(target.fastestSecondsPerKm, "fastestSecondsPerKm", 3_600);
    requireFinitePositive(target.slowestSecondsPerKm, "slowestSecondsPerKm", 3_600);

    if (target.fastestSecondsPerKm > target.slowestSecondsPerKm) {
      throw new Error(
        "fastestSecondsPerKm must be less than or equal to slowestSecondsPerKm.",
      );
    }
  }

  if (target.type === "heart_rate") {
    if (
      !Number.isInteger(target.minimumBpm) ||
      !Number.isInteger(target.maximumBpm) ||
      target.minimumBpm < 30 ||
      target.maximumBpm > 250 ||
      target.minimumBpm > target.maximumBpm
    ) {
      throw new Error("Heart-rate targets must be an ordered 30–250 bpm range.");
    }
  }
}

function validateStep(step: StructuredRunningStep) {
  if (step.duration.type === "time") {
    requireFinitePositive(step.duration.seconds, "duration.seconds", 86_400);
  } else if (step.duration.type === "distance") {
    requireFinitePositive(step.duration.meters, "duration.meters", 1_000_000);
  }

  validateTarget(step.target);

  if (step.description && step.description.length > 512) {
    throw new Error("Step descriptions cannot exceed 512 characters.");
  }
}

function estimateStepSeconds(step: StructuredRunningStep): number | null {
  if (step.duration.type === "time") {
    return step.duration.seconds;
  }

  if (step.duration.type === "distance" && step.target.type === "pace") {
    const averagePaceSecondsPerKm =
      (step.target.fastestSecondsPerKm + step.target.slowestSecondsPerKm) / 2;
    return (step.duration.meters / 1_000) * averagePaceSecondsPerKm;
  }

  return null;
}

function estimateWorkoutSeconds(elements: StructuredRunningElement[]) {
  let total = 0;

  for (const element of elements) {
    if (element.kind === "step") {
      const seconds = estimateStepSeconds(element);

      if (seconds === null) {
        throw new Error(
          "estimatedDurationSeconds is required for open or untargeted distance steps.",
        );
      }

      total += seconds;
      continue;
    }

    const repeatedSeconds = element.steps.reduce((sum, step) => {
      const seconds = estimateStepSeconds(step);

      if (seconds === null) {
        throw new Error(
          "estimatedDurationSeconds is required when a repeat has an open or untargeted distance step.",
        );
      }

      return sum + seconds;
    }, 0);
    total += repeatedSeconds * element.repetitions;
  }

  return Math.max(1, Math.round(total));
}

function validateElement(element: StructuredRunningElement) {
  if (element.kind === "step") {
    validateStep(element);
    return;
  }

  if (
    !Number.isInteger(element.repetitions) ||
    element.repetitions < 2 ||
    element.repetitions > 99
  ) {
    throw new Error("Repeat counts must be an integer between 2 and 99.");
  }

  if (element.steps.length === 0 || element.steps.length > 20) {
    throw new Error("Repeat groups must contain between 1 and 20 steps.");
  }

  element.steps.forEach(validateStep);
}

/**
 * Convert an explicitly structured TrainVault run into the bridge contract.
 * Free-text workout blocks are deliberately not guessed into Garmin steps.
 */
export function toGarminRunningWorkoutRequest(
  workout: StructuredRunningWorkout,
): GarminRunningWorkoutRequest {
  const name = workout.name.trim();

  if (!name || name.length > 80) {
    throw new Error("Workout names must contain 1–80 characters.");
  }

  if (workout.description && workout.description.length > 1_024) {
    throw new Error("Workout descriptions cannot exceed 1024 characters.");
  }

  if (workout.steps.length === 0 || workout.steps.length > 100) {
    throw new Error("A structured workout must contain between 1 and 100 elements.");
  }

  workout.steps.forEach(validateElement);

  const estimatedDurationSeconds =
    workout.estimatedDurationSeconds ?? estimateWorkoutSeconds(workout.steps);
  requireFinitePositive(
    estimatedDurationSeconds,
    "estimatedDurationSeconds",
    MAX_WORKOUT_SECONDS,
  );

  return {
    name,
    ...(workout.description ? { description: workout.description } : {}),
    estimatedDurationSeconds: Math.round(estimatedDurationSeconds),
    steps: structuredClone(workout.steps),
  };
}
