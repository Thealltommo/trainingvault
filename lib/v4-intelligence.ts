import type {
  GarminActivity,
  StructuredRunningWorkout,
} from "@/lib/garmin";
import {
  average,
  expandStructuredSteps,
  monotonicSamples,
  sampleClock,
  standardDeviation,
  targetPace,
  type AnalysisSample,
  type AnalysisSplit,
} from "@/lib/run-activity-analysis";

export type RunRole =
  | "easy"
  | "long"
  | "threshold"
  | "intervals"
  | "hills"
  | "race"
  | "trail"
  | "free";

export type BestEffort = {
  key: "400m" | "1k" | "1mi" | "2mi" | "5k" | "10k";
  label: string;
  distanceMeters: number;
  durationSeconds: number | null;
};

export type RacePrediction = {
  distance: "5K" | "10K" | "Half";
  targetMeters: number;
  midpointSeconds: number;
  lowerSeconds: number;
  upperSeconds: number;
  confidence: "low" | "medium" | "high";
  source: string;
};

export type IntervalIntelligence = {
  workCount: number;
  targetCount: number;
  onTargetCount: number;
  averageWorkPaceSecondsPerKm: number | null;
  fastestWorkPaceSecondsPerKm: number | null;
  slowestWorkPaceSecondsPerKm: number | null;
  paceVariationPercent: number | null;
  paceFadeSecondsPerKm: number | null;
  firstWorkHeartRateBpm: number | null;
  finalWorkHeartRateBpm: number | null;
  peakHeartRateBpm: number | null;
  averageRecoveryHeartRateBpm: number | null;
  verdict: string;
};

export type ComparableRun = {
  activityId: string;
  title: string;
  startTime: string | null;
  distanceMeters: number;
  durationSeconds: number;
  averagePaceSecondsPerKm: number;
  averageHeartRateBpm: number | null;
};

const EFFORTS: Array<Pick<BestEffort, "key" | "label" | "distanceMeters">> = [
  { key: "400m", label: "400 m", distanceMeters: 400 },
  { key: "1k", label: "1 km", distanceMeters: 1_000 },
  { key: "1mi", label: "1 mile", distanceMeters: 1_609.344 },
  { key: "2mi", label: "2 mile", distanceMeters: 3_218.688 },
  { key: "5k", label: "5 km", distanceMeters: 5_000 },
  { key: "10k", label: "10 km", distanceMeters: 10_000 },
];

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function normalizedTitle(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function classifyRunRole(
  title: string | null | undefined,
  structuredWorkout?: StructuredRunningWorkout | null,
): RunRole {
  const signal = `${title ?? ""} ${structuredWorkout?.name ?? ""} ${structuredWorkout?.description ?? ""}`.toLowerCase();

  if (/race|parkrun|time trial|5k test|10k test/.test(signal)) return "race";
  if (/trail|fell|mountain|ridge|technical/.test(signal)) return "trail";
  if (/hill|uphill|climb/.test(signal)) return "hills";
  if (/interval|repeat|rhythm|vo2|max aerobic|speed/.test(signal)) return "intervals";
  if (/threshold|tempo|cruise/.test(signal)) return "threshold";
  if (/long|endurance|aerobic durability/.test(signal)) return "long";
  if (/easy|recovery|conversational|steady aerobic/.test(signal)) return "easy";
  return "free";
}

export function boundedBestEffort(
  samples: AnalysisSample[],
  targetMeters: number,
) {
  const ordered = monotonicSamples(samples);
  const finalDistance = ordered.at(-1)?.distanceMeters ?? 0;

  if (ordered.length < 2 || finalDistance < targetMeters) return null;

  let best: number | null = null;

  for (const start of ordered) {
    const startDistance = start.distanceMeters ?? 0;
    const finishDistance = startDistance + targetMeters;
    if (finishDistance > finalDistance + 0.5) break;

    let finishTime: number | null = null;
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const previousDistance = previous.distanceMeters;
      const currentDistance = current.distanceMeters;
      if (!finite(previousDistance) || !finite(currentDistance)) continue;
      if (currentDistance < finishDistance) continue;

      const ratio = Math.min(
        1,
        Math.max(
          0,
          (finishDistance - previousDistance) /
            Math.max(0.001, currentDistance - previousDistance),
        ),
      );
      finishTime =
        sampleClock(previous) +
        (sampleClock(current) - sampleClock(previous)) * ratio;
      break;
    }

    if (finishTime == null) continue;
    const duration = finishTime - sampleClock(start);
    if (duration > 1 && (best == null || duration < best)) best = duration;
  }

  return best;
}

export function buildBestEfforts(samples: AnalysisSample[]): BestEffort[] {
  return EFFORTS.map((effort) => ({
    ...effort,
    durationSeconds: boundedBestEffort(samples, effort.distanceMeters),
  }));
}

function riegel(
  sourceSeconds: number,
  sourceMeters: number,
  targetMeters: number,
) {
  return sourceSeconds * (targetMeters / sourceMeters) ** 1.06;
}

export function buildRacePredictions(
  efforts: BestEffort[],
  currentActivity?: GarminActivity | null,
): RacePrediction[] {
  const validEfforts = efforts.filter(
    (effort): effort is BestEffort & { durationSeconds: number } =>
      finite(effort.durationSeconds),
  );
  const preferred =
    validEfforts.find((effort) => effort.key === "10k") ??
    validEfforts.find((effort) => effort.key === "5k") ??
    validEfforts.find((effort) => effort.key === "2mi") ??
    validEfforts.find((effort) => effort.key === "1mi");

  const fallback =
    !preferred &&
    finite(currentActivity?.distanceMeters) &&
    finite(currentActivity?.movingDurationSeconds ?? currentActivity?.durationSeconds) &&
    (currentActivity?.distanceMeters ?? 0) >= 3_000
      ? {
          label: "completed activity",
          distanceMeters: currentActivity!.distanceMeters!,
          durationSeconds:
            currentActivity!.movingDurationSeconds ??
            currentActivity!.durationSeconds!,
        }
      : null;

  const source = preferred ?? fallback;
  if (!source) return [];

  const targets = [
    ["5K", 5_000],
    ["10K", 10_000],
    ["Half", 21_097.5],
  ] as const;
  const confidence: RacePrediction["confidence"] =
    preferred?.key === "10k" || preferred?.key === "5k"
      ? "medium"
      : "low";
  const margin = confidence === "medium" ? 0.035 : 0.065;

  return targets.map(([distance, targetMeters]) => {
    const midpointSeconds = riegel(
      source.durationSeconds,
      source.distanceMeters,
      targetMeters,
    );
    return {
      distance,
      targetMeters,
      midpointSeconds,
      lowerSeconds: midpointSeconds * (1 - margin),
      upperSeconds: midpointSeconds * (1 + margin),
      confidence,
      source: preferred ? `best ${preferred.label}` : source.label,
    };
  });
}

function phaseForSplit(
  split: AnalysisSplit,
  index: number,
  workout: StructuredRunningWorkout | null,
) {
  const expanded = expandStructuredSteps(workout);
  if (expanded.length === 0 || expanded.length !== (workout ? expanded.length : 0)) {
    // Continue into Garmin split-name inference below.
  }
  const matched = expanded[index]?.step;
  if (matched) return matched.phase;

  const signal = (split.splitType ?? "").toLowerCase();
  if (signal.includes("warm")) return "warmup" as const;
  if (signal.includes("recover") || signal.includes("rest")) {
    return "recovery" as const;
  }
  if (signal.includes("cool")) return "cooldown" as const;
  return "work" as const;
}

export function buildIntervalIntelligence(
  splits: AnalysisSplit[],
  workout: StructuredRunningWorkout | null,
): IntervalIntelligence | null {
  if (splits.length === 0) return null;

  const expanded = expandStructuredSteps(workout);
  const aligned = expanded.length === splits.length ? expanded : [];
  const work = splits.flatMap((split, index) => {
    const phase = aligned[index]?.step.phase ?? phaseForSplit(split, index, workout);
    if (phase !== "work" || !finite(split.averagePaceSecondsPerKm)) return [];
    const target = targetPace(aligned[index]?.step);
    const onTarget =
      target == null
        ? null
        : split.averagePaceSecondsPerKm >= target.fastest &&
          split.averagePaceSecondsPerKm <= target.slowest;
    return [
      {
        pace: split.averagePaceSecondsPerKm,
        averageHeartRate: split.averageHeartRateBpm,
        maxHeartRate: split.maxHeartRateBpm,
        target,
        onTarget,
      },
    ];
  });
  const recoveries = splits.flatMap((split, index) => {
    const phase = aligned[index]?.step.phase ?? phaseForSplit(split, index, workout);
    return phase === "recovery" && finite(split.averageHeartRateBpm)
      ? [split.averageHeartRateBpm]
      : [];
  });

  if (work.length === 0) return null;

  const paces = work.map((item) => item.pace);
  const meanPace = average(paces);
  const paceSd = standardDeviation(paces);
  const paceVariationPercent =
    finite(meanPace) && finite(paceSd) && meanPace > 0
      ? (paceSd / meanPace) * 100
      : null;
  const paceFadeSecondsPerKm = work.at(-1)!.pace - work[0].pace;
  const targetCount = work.filter((item) => item.target != null).length;
  const onTargetCount = work.filter((item) => item.onTarget === true).length;

  let verdict = "Work repetitions recorded.";
  if (finite(paceVariationPercent)) {
    if (paceVariationPercent <= 2.5 && paceFadeSecondsPerKm <= 5) {
      verdict = "Excellent repeatability: the work stayed tightly controlled.";
    } else if (paceVariationPercent <= 5 && paceFadeSecondsPerKm <= 12) {
      verdict = "Controlled quality: small variation without meaningful late fade.";
    } else if (paceFadeSecondsPerKm > 20) {
      verdict = "The final repetitions faded; the opening pace may have been too ambitious.";
    } else {
      verdict = "The quality dose landed, but pacing was more variable than ideal.";
    }
  }

  return {
    workCount: work.length,
    targetCount,
    onTargetCount,
    averageWorkPaceSecondsPerKm: meanPace,
    fastestWorkPaceSecondsPerKm: Math.min(...paces),
    slowestWorkPaceSecondsPerKm: Math.max(...paces),
    paceVariationPercent,
    paceFadeSecondsPerKm,
    firstWorkHeartRateBpm: work[0].averageHeartRate,
    finalWorkHeartRateBpm: work.at(-1)!.averageHeartRate,
    peakHeartRateBpm: average(work.map((item) => item.maxHeartRate)) == null
      ? null
      : Math.max(
          ...work
            .map((item) => item.maxHeartRate)
            .filter((value): value is number => finite(value)),
        ),
    averageRecoveryHeartRateBpm: average(recoveries),
    verdict,
  };
}

export function findComparableRuns(
  current: GarminActivity,
  activities: GarminActivity[],
): ComparableRun[] {
  if (
    !current.activityId ||
    !finite(current.distanceMeters) ||
    current.distanceMeters < 1_000
  ) {
    return [];
  }

  const currentTitle = normalizedTitle(current.title);
  const currentDistance = current.distanceMeters;

  return activities
    .flatMap<ComparableRun>((activity) => {
      if (
        !activity.activityId ||
        activity.activityId === current.activityId ||
        !finite(activity.distanceMeters) ||
        !finite(activity.durationSeconds) ||
        !finite(activity.averagePaceSecondsPerKm)
      ) {
        return [];
      }
      const type = (activity.activityType ?? "").toLowerCase();
      if (!type.includes("run") && !type.includes("jog")) return [];

      const ratio = activity.distanceMeters / currentDistance;
      const sameTitle =
        currentTitle.length >= 6 &&
        normalizedTitle(activity.title).includes(currentTitle);
      if (!sameTitle && (ratio < 0.84 || ratio > 1.16)) return [];

      return [
        {
          activityId: activity.activityId,
          title: activity.title ?? "Run",
          startTime: activity.localStartTime ?? activity.startTime,
          distanceMeters: activity.distanceMeters,
          durationSeconds: activity.durationSeconds,
          averagePaceSecondsPerKm: activity.averagePaceSecondsPerKm,
          averageHeartRateBpm: activity.averageHeartRateBpm,
        },
      ];
    })
    .sort((first, second) =>
      (second.startTime ?? "").localeCompare(first.startTime ?? ""),
    )
    .slice(0, 6);
}

export function estimateStructuredDistance(
  workout: StructuredRunningWorkout | null | undefined,
) {
  if (!workout) return null;
  let total = 0;
  let known = false;

  const addStep = (step: (typeof workout.steps)[number] extends infer _ ? never : never) => step;
  void addStep;

  const distanceForStep = (
    step: Extract<(typeof workout.steps)[number], { kind: "step" }>,
  ) => {
    if (step.duration.type === "distance") return step.duration.meters;
    if (step.duration.type !== "time" || step.target.type !== "pace") return null;
    const meanPace =
      (step.target.fastestSecondsPerKm + step.target.slowestSecondsPerKm) / 2;
    return (step.duration.seconds / meanPace) * 1_000;
  };

  for (const element of workout.steps) {
    if (element.kind === "step") {
      const distance = distanceForStep(element);
      if (finite(distance)) {
        total += distance;
        known = true;
      }
      continue;
    }

    for (let repetition = 0; repetition < element.repetitions; repetition += 1) {
      for (const step of element.steps) {
        const distance = distanceForStep(step);
        if (finite(distance)) {
          total += distance;
          known = true;
        }
      }
    }
  }

  return known ? total : null;
}

export function activityCoachRead(input: {
  role: RunRole;
  interval: IntervalIntelligence | null;
  aerobicTrainingEffect: number | null | undefined;
  anaerobicTrainingEffect: number | null | undefined;
  heartRateDriftPercent?: number | null;
  linkedToPlan: boolean;
}) {
  const aerobic = input.aerobicTrainingEffect ?? 0;
  const anaerobic = input.anaerobicTrainingEffect ?? 0;

  if (input.interval) {
    const targetRead =
      input.interval.targetCount > 0
        ? `${input.interval.onTargetCount}/${input.interval.targetCount} targeted reps landed inside the prescribed pace band.`
        : "Garmin returned the work repetitions, but this activity has no pace-band target to score.";
    return {
      title:
        input.interval.paceVariationPercent != null &&
        input.interval.paceVariationPercent <= 3
          ? "Repeatable speed, not a lucky rep"
          : "Quality session captured",
      body: `${input.interval.verdict} ${targetRead}`,
      next:
        aerobic >= 4.5 || anaerobic >= 3.5
          ? "Protect the next hard session until recovery confirms this load has been absorbed."
          : "Keep the next easy day genuinely easy so this quality can convert into adaptation.",
    };
  }

  if (input.role === "long") {
    const drift = input.heartRateDriftPercent;
    return {
      title:
        drift != null && drift <= 5
          ? "Durability held together"
          : "Long-run evidence banked",
      body:
        drift == null
          ? "Distance and duration are captured; a complete HR trace will make the durability read stronger."
          : drift <= 5
            ? `Second-half heart rate changed by ${drift.toFixed(1)}%, supporting a controlled endurance effort.`
            : `Second-half heart rate drifted by ${drift.toFixed(1)}%; terrain, heat, fuelling and opening pace are the first things to inspect.`,
      next:
        aerobic >= 4.2
          ? "Do not stack another demanding lower-body session immediately after this run."
          : "Normal training can continue if morning recovery remains supportive.",
    };
  }

  if (input.role === "easy") {
    return {
      title: aerobic <= 3.2 ? "Aerobic work stayed useful" : "Easy day became expensive",
      body:
        aerobic <= 3.2
          ? "The session added aerobic volume without producing an unusually high Garmin training effect."
          : "Garmin recorded a larger-than-expected aerobic cost for an easy-labelled run; inspect HR, terrain and pace before the next quality day.",
      next:
        aerobic <= 3.2
          ? "No automatic change is required."
          : "Keep the next session adjustable until recovery confirms the cost was absorbed.",
    };
  }

  return {
    title: "The activity now has context",
    body: input.linkedToPlan
      ? "Garmin evidence and the planned session are joined, so TrainVault can judge execution rather than merely repeat the overall average."
      : "The data is complete enough for activity analysis; linking it to the intended plan will unlock target-versus-actual coaching.",
    next:
      aerobic >= 4.5 || anaerobic >= 3.5
        ? "Treat this as a high-cost stimulus."
        : "Use the splits and charts to decide whether the intended stimulus was achieved.",
  };
}
