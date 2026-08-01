import type {
  StructuredRunningStep,
  StructuredRunningWorkout,
} from "@/lib/garmin";

export type AnalysisPoint = {
  lat: number;
  lon: number;
  elevationMeters: number | null;
  distanceMeters: number | null;
  timeMs: number | null;
};

export type AnalysisSample = {
  elapsedSeconds: number;
  movingSeconds: number | null;
  distanceMeters: number | null;
  paceSecondsPerKm: number | null;
  heartRateBpm: number | null;
  cadenceSpm: number | null;
  elevationMeters: number | null;
  gradePercent: number | null;
  temperatureC: number | null;
};

export type AnalysisSplit = {
  splitIndex: number;
  splitType: string | null;
  durationSeconds: number | null;
  movingDurationSeconds: number | null;
  distanceMeters: number | null;
  averagePaceSecondsPerKm: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  calories: number | null;
};

export type ActivityAnalysisPayload = {
  activityId: string;
  points: AnalysisPoint[];
  samples: AnalysisSample[];
  splits: AnalysisSplit[];
  availableChannels: string[];
  sourceSampleCount: number;
};

export type ChartDatum = {
  distanceKm: number;
  elapsedMinutes: number;
  pace: number | null;
  heartRate: number | null;
  cadence: number | null;
  elevation: number | null;
  temperature: number | null;
};

export type KilometreSplit = {
  index: number;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  averageHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  elevationDeltaMeters: number | null;
  complete: boolean;
};

export type ExpandedStep = {
  step: StructuredRunningStep;
  label: string;
};

export type MovementState = "run" | "walk" | "idle";

export type MovementSummary = {
  runSeconds: number;
  walkSeconds: number;
  idleSeconds: number;
  segments: Array<{ state: MovementState; seconds: number }>;
};

export function average(values: Array<number | null | undefined>) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (finite.length === 0) return null;
  return finite.reduce((total, value) => total + value, 0) / finite.length;
}

export function minimum(values: Array<number | null | undefined>) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return finite.length ? Math.min(...finite) : null;
}

export function maximum(values: Array<number | null | undefined>) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return finite.length ? Math.max(...finite) : null;
}

export function standardDeviation(values: Array<number | null | undefined>) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (finite.length < 2) return null;
  const mean = finite.reduce((total, value) => total + value, 0) / finite.length;
  const variance = finite.reduce(
    (total, value) => total + (value - mean) ** 2,
    0,
  ) / finite.length;
  return Math.sqrt(variance);
}

export function sampleClock(sample: AnalysisSample) {
  return sample.movingSeconds ?? sample.elapsedSeconds;
}

export function monotonicSamples(samples: AnalysisSample[]) {
  return samples.filter(
    (sample, index, all) =>
      sample.distanceMeters != null &&
      Number.isFinite(sample.distanceMeters) &&
      (index === 0 ||
        all[index - 1].distanceMeters == null ||
        sample.distanceMeters >= (all[index - 1].distanceMeters ?? 0)),
  );
}

export function interpolateClock(
  samples: AnalysisSample[],
  distanceMeters: number,
) {
  if (samples.length === 0) return null;
  const firstDistance = samples[0].distanceMeters ?? 0;
  if (distanceMeters <= firstDistance) return sampleClock(samples[0]);

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const previousDistance = previous.distanceMeters;
    const currentDistance = current.distanceMeters;
    if (
      previousDistance == null ||
      currentDistance == null ||
      currentDistance < distanceMeters
    ) {
      continue;
    }
    const ratio = Math.min(
      1,
      Math.max(
        0,
        (distanceMeters - previousDistance) /
          Math.max(0.001, currentDistance - previousDistance),
      ),
    );
    return (
      sampleClock(previous) +
      (sampleClock(current) - sampleClock(previous)) * ratio
    );
  }

  return sampleClock(samples[samples.length - 1]);
}

function interpolateElevation(samples: AnalysisSample[], distanceMeters: number) {
  const values = samples.filter(
    (sample) => sample.distanceMeters != null && sample.elevationMeters != null,
  );
  if (values.length === 0) return null;
  if (distanceMeters <= (values[0].distanceMeters ?? 0)) {
    return values[0].elevationMeters;
  }

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    const previousDistance = previous.distanceMeters ?? 0;
    const currentDistance = current.distanceMeters ?? previousDistance;
    if (currentDistance < distanceMeters) continue;
    const ratio =
      (distanceMeters - previousDistance) /
      Math.max(0.001, currentDistance - previousDistance);
    return (
      (previous.elevationMeters ?? 0) +
      ((current.elevationMeters ?? 0) - (previous.elevationMeters ?? 0)) *
        ratio
    );
  }

  return values.at(-1)?.elevationMeters ?? null;
}

export function buildKilometreSplits(samples: AnalysisSample[]) {
  const ordered = monotonicSamples(samples);
  const totalDistance = ordered.at(-1)?.distanceMeters ?? 0;
  if (ordered.length < 2 || totalDistance < 100) return [];

  const result: KilometreSplit[] = [];
  let startDistance = ordered[0].distanceMeters ?? 0;
  let index = 1;

  while (startDistance < totalDistance - 1) {
    const endDistance = Math.min(totalDistance, startDistance + 1_000);
    const startClock = interpolateClock(ordered, startDistance);
    const endClock = interpolateClock(ordered, endDistance);
    if (startClock == null || endClock == null || endClock <= startClock) break;

    const segment = ordered.filter((sample) => {
      const distance = sample.distanceMeters ?? -1;
      return distance >= startDistance && distance <= endDistance;
    });
    const distance = endDistance - startDistance;
    const duration = endClock - startClock;
    const startElevation = interpolateElevation(ordered, startDistance);
    const endElevation = interpolateElevation(ordered, endDistance);

    result.push({
      index,
      label: distance >= 995 ? String(index) : `${(distance / 1_000).toFixed(2)}`,
      distanceMeters: distance,
      durationSeconds: duration,
      paceSecondsPerKm: duration / (distance / 1_000),
      averageHeartRateBpm: average(segment.map((sample) => sample.heartRateBpm)),
      averageCadenceSpm: average(segment.map((sample) => sample.cadenceSpm)),
      elevationDeltaMeters:
        startElevation == null || endElevation == null
          ? null
          : endElevation - startElevation,
      complete: distance >= 995,
    });

    startDistance = endDistance;
    index += 1;
  }

  return result;
}

export function bestEffort(samples: AnalysisSample[], targetMeters: number) {
  const ordered = monotonicSamples(samples);
  if (
    ordered.length < 2 ||
    (ordered.at(-1)?.distanceMeters ?? 0) < targetMeters
  ) {
    return null;
  }

  let best: number | null = null;
  for (const start of ordered) {
    const startDistance = start.distanceMeters ?? 0;
    const finishTime = interpolateClock(ordered, startDistance + targetMeters);
    if (finishTime == null) break;
    const duration = finishTime - sampleClock(start);
    if (duration > 0 && (best == null || duration < best)) best = duration;
  }
  return best;
}

function rollingMedian(values: Array<number | null>, index: number) {
  const window = values
    .slice(Math.max(0, index - 2), index + 3)
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((first, second) => first - second);
  return window.length ? window[Math.floor(window.length / 2)] : null;
}

export function buildChartData(samples: AnalysisSample[]) {
  const rawPaces = samples.map((sample) => {
    const pace = sample.paceSecondsPerKm;
    return pace != null && pace >= 120 && pace <= 1_800 ? pace : null;
  });

  return samples.map((sample, index): ChartDatum => ({
    distanceKm: (sample.distanceMeters ?? 0) / 1_000,
    elapsedMinutes: sample.elapsedSeconds / 60,
    pace: rollingMedian(rawPaces, index),
    heartRate: sample.heartRateBpm,
    cadence: sample.cadenceSpm,
    elevation: sample.elevationMeters,
    temperature: sample.temperatureC,
  }));
}

function classifyMovement(
  previous: AnalysisSample,
  current: AnalysisSample,
): MovementState {
  const distanceDelta = Math.max(
    0,
    (current.distanceMeters ?? 0) - (previous.distanceMeters ?? 0),
  );
  const movingDelta =
    previous.movingSeconds == null || current.movingSeconds == null
      ? null
      : Math.max(0, current.movingSeconds - previous.movingSeconds);

  if (distanceDelta < 0.4 && (movingDelta == null || movingDelta < 0.4)) {
    return "idle";
  }
  if (
    (current.cadenceSpm ?? 0) >= 120 ||
    (current.paceSecondsPerKm ?? 9_999) <= 600
  ) {
    return "run";
  }
  return "walk";
}

export function buildMovementSummary(samples: AnalysisSample[]) {
  const totals: Record<MovementState, number> = { run: 0, walk: 0, idle: 0 };
  const segments: Array<{ state: MovementState; seconds: number }> = [];

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const seconds = Math.min(
      30,
      Math.max(0, current.elapsedSeconds - previous.elapsedSeconds),
    );
    if (seconds <= 0) continue;
    const state = classifyMovement(previous, current);
    totals[state] += seconds;
    const last = segments.at(-1);
    if (last?.state === state) last.seconds += seconds;
    else segments.push({ state, seconds });
  }

  return {
    runSeconds: totals.run,
    walkSeconds: totals.walk,
    idleSeconds: totals.idle,
    segments,
  } satisfies MovementSummary;
}

export function expandStructuredSteps(
  workout: StructuredRunningWorkout | null,
) {
  if (!workout) return [];
  const expanded: ExpandedStep[] = [];
  let work = 0;
  let recovery = 0;

  const push = (step: StructuredRunningStep) => {
    let label = "Step";
    if (step.phase === "warmup") label = "Warm-up";
    if (step.phase === "cooldown") label = "Cool-down";
    if (step.phase === "work") label = `Rep ${++work}`;
    if (step.phase === "recovery") label = `Recovery ${++recovery}`;
    expanded.push({ step, label });
  };

  for (const element of workout.steps) {
    if (element.kind === "step") push(element);
    else {
      for (let repetition = 0; repetition < element.repetitions; repetition += 1) {
        for (const step of element.steps) push(step);
      }
    }
  }
  return expanded;
}

export function targetPace(step: StructuredRunningStep | undefined) {
  if (!step || step.target.type !== "pace") return null;
  return {
    fastest: step.target.fastestSecondsPerKm,
    slowest: step.target.slowestSecondsPerKm,
  };
}

export function targetRead(
  split: AnalysisSplit,
  step: StructuredRunningStep | undefined,
) {
  const target = targetPace(step);
  const pace = split.averagePaceSecondsPerKm;
  if (!target || pace == null) return null;
  if (pace < target.fastest) return `${Math.round(target.fastest - pace)}s fast`;
  if (pace > target.slowest) return `${Math.round(pace - target.slowest)}s slow`;
  return "On target";
}
