import type {
  RunningStepTarget,
  StructuredRunningElement,
  StructuredRunningWorkout,
} from "@/lib/garmin/types";

export type StructuredRunForm = {
  id: string;
  name: string;
  date: string;
  mode: "continuous" | "intervals";
  warmupMinutes: number;
  cooldownMinutes: number;
  continuousMinutes: number;
  repetitions: number;
  workDistanceMeters: number;
  recoverySeconds: number;
  fastestPace: string;
  slowestPace: string;
  description?: string;
};

export function parsePaceSecondsPerKm(value: string) {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const total = minutes * 60 + seconds;
  return total >= 120 && total <= 1_800 ? total : null;
}

export function formatPace(secondsPerKm: number) {
  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${seconds}/km`;
}

function targetFromPace(
  fastestPace: string,
  slowestPace: string,
): RunningStepTarget {
  const fastestSecondsPerKm = parsePaceSecondsPerKm(fastestPace);
  const slowestSecondsPerKm = parsePaceSecondsPerKm(slowestPace);

  if (
    fastestSecondsPerKm === null &&
    slowestSecondsPerKm === null
  ) {
    return { type: "open" };
  }

  if (
    fastestSecondsPerKm === null ||
    slowestSecondsPerKm === null ||
    fastestSecondsPerKm > slowestSecondsPerKm
  ) {
    throw new Error(
      "Pace must be an ordered fastest/slowest pair in mm:ss per km.",
    );
  }

  return {
    type: "pace",
    fastestSecondsPerKm,
    slowestSecondsPerKm,
  };
}

export function buildStructuredRunningWorkout(
  form: StructuredRunForm,
): StructuredRunningWorkout {
  const name = form.name.trim();

  if (!name || !form.date) {
    throw new Error("Workout name and date are required.");
  }

  const target = targetFromPace(form.fastestPace, form.slowestPace);
  const steps: StructuredRunningElement[] = [];

  if (form.warmupMinutes > 0) {
    steps.push({
      kind: "step",
      phase: "warmup",
      duration: {
        type: "time",
        seconds: Math.round(form.warmupMinutes * 60),
      },
      target: { type: "open" },
      description: "Easy warm-up",
    });
  }

  if (form.mode === "continuous") {
    if (!Number.isFinite(form.continuousMinutes) || form.continuousMinutes <= 0) {
      throw new Error("Continuous running time must be greater than zero.");
    }

    steps.push({
      kind: "step",
      phase: "work",
      duration: {
        type: "time",
        seconds: Math.round(form.continuousMinutes * 60),
      },
      target,
      description: "Continuous run",
    });
  } else {
    if (
      !Number.isInteger(form.repetitions) ||
      form.repetitions < 2 ||
      form.repetitions > 99 ||
      !Number.isFinite(form.workDistanceMeters) ||
      form.workDistanceMeters <= 0 ||
      !Number.isFinite(form.recoverySeconds) ||
      form.recoverySeconds <= 0
    ) {
      throw new Error(
        "Intervals require 2–99 repetitions, a positive distance, and positive recovery.",
      );
    }

    steps.push({
      kind: "repeat",
      repetitions: form.repetitions,
      steps: [
        {
          kind: "step",
          phase: "work",
          duration: {
            type: "distance",
            meters: Math.round(form.workDistanceMeters),
          },
          target,
          description: "Work interval",
        },
        {
          kind: "step",
          phase: "recovery",
          duration: {
            type: "time",
            seconds: Math.round(form.recoverySeconds),
          },
          target: { type: "open" },
          description: "Easy recovery",
        },
      ],
    });
  }

  if (form.cooldownMinutes > 0) {
    steps.push({
      kind: "step",
      phase: "cooldown",
      duration: {
        type: "time",
        seconds: Math.round(form.cooldownMinutes * 60),
      },
      target: { type: "open" },
      description: "Easy cool-down",
    });
  }

  const averagePaceSecondsPerKm =
    target.type === "pace"
      ? (target.fastestSecondsPerKm + target.slowestSecondsPerKm) / 2
      : 360;
  const estimatedDurationSeconds =
    Math.round(form.warmupMinutes * 60) +
    Math.round(form.cooldownMinutes * 60) +
    (form.mode === "continuous"
      ? Math.round(form.continuousMinutes * 60)
      : Math.round(
          form.repetitions *
            ((form.workDistanceMeters / 1_000) *
              averagePaceSecondsPerKm +
              form.recoverySeconds),
        ));

  return {
    id: form.id,
    name,
    date: form.date,
    description: form.description?.trim() || undefined,
    estimatedDurationSeconds,
    steps,
  };
}

export function describeStructuredRunningWorkout(
  workout: StructuredRunningWorkout,
) {
  const lines: string[] = [];

  workout.steps.forEach((element) => {
    if (element.kind === "repeat") {
      lines.push(`${element.repetitions} rounds:`);
      element.steps.forEach((step) => {
        lines.push(`- ${describeRunningStep(step)}`);
      });
      return;
    }

    lines.push(describeRunningStep(element));
  });

  return lines;
}

export function describeRunningStep(
  step: Extract<StructuredRunningElement, { kind: "step" }>,
) {
  const duration =
    step.duration.type === "time"
      ? `${Math.round(step.duration.seconds / 60)} min`
      : step.duration.type === "distance"
        ? `${step.duration.meters} m`
        : "Lap button";
  const target =
    step.target.type === "pace"
      ? ` @ ${formatPace(step.target.fastestSecondsPerKm)}–${formatPace(step.target.slowestSecondsPerKm)}`
      : step.target.type === "heart_rate"
        ? ` @ ${step.target.minimumBpm}–${step.target.maximumBpm} bpm`
        : "";

  return `${step.phase}: ${duration}${target}`;
}

export function getStructuredRunningMetrics(
  workout: StructuredRunningWorkout,
) {
  let distanceMeters = 0;
  let hasStep = false;
  let hasCompleteDistanceEstimate = true;
  let allStepsUseHeartRate = true;
  let minimumHeartRate = Number.POSITIVE_INFINITY;
  let maximumHeartRate = Number.NEGATIVE_INFINITY;
  let plannedIntervalCount = 0;

  const includeStep = (
    step: Extract<StructuredRunningElement, { kind: "step" }>,
    multiplier: number,
  ) => {
    hasStep = true;

    if (step.target.type === "heart_rate") {
      minimumHeartRate = Math.min(
        minimumHeartRate,
        step.target.minimumBpm,
      );
      maximumHeartRate = Math.max(
        maximumHeartRate,
        step.target.maximumBpm,
      );
    } else {
      allStepsUseHeartRate = false;
    }

    if (step.duration.type === "distance") {
      distanceMeters += step.duration.meters * multiplier;
      return;
    }

    if (
      step.duration.type === "time" &&
      step.target.type === "pace"
    ) {
      const averagePace =
        (step.target.fastestSecondsPerKm +
          step.target.slowestSecondsPerKm) /
        2;
      distanceMeters +=
        (step.duration.seconds / averagePace) * 1_000 * multiplier;
      return;
    }

    hasCompleteDistanceEstimate = false;
  };

  workout.steps.forEach((element) => {
    if (element.kind === "step") {
      includeStep(element, 1);
      return;
    }

    plannedIntervalCount += element.repetitions;
    element.steps.forEach((step) =>
      includeStep(step, element.repetitions),
    );
  });

  const plannedDurationSeconds = workout.estimatedDurationSeconds ?? null;
  const plannedDistanceMeters =
    hasStep && hasCompleteDistanceEstimate
      ? Math.round(distanceMeters)
      : null;
  const plannedPaceSecondsPerKm =
    plannedDurationSeconds !== null &&
    plannedDistanceMeters !== null &&
    distanceMeters > 0
      ? plannedDurationSeconds / (distanceMeters / 1_000)
      : null;
  const plannedHeartRateRange: [number, number] | null =
    hasStep &&
    allStepsUseHeartRate &&
    Number.isFinite(minimumHeartRate) &&
    Number.isFinite(maximumHeartRate)
      ? [minimumHeartRate, maximumHeartRate]
      : null;

  return {
    plannedDistanceMeters,
    plannedDurationSeconds,
    plannedPaceSecondsPerKm,
    plannedHeartRateRange,
    plannedIntervalCount:
      plannedIntervalCount > 0 ? plannedIntervalCount : null,
  };
}
