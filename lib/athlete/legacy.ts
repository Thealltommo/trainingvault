import type {
  BlockResult,
  Programme,
  ProgrammeDay,
  ProgrammeWeek,
  SessionLog,
  Workout,
  WorkoutBlock,
  WorkoutOverride,
} from "../types";
import { makeStableId, slug } from "./ids";
import { classifySessionLoad } from "./load";
import type {
  AthleteSession,
  AthleteSessionBlock,
  AthleteSessionCategory,
  CompletedBlockResult,
  CompletedPrescription,
  SessionPrescription,
  SessionStatus,
} from "./types";
import { buildSessionVariants, type VariantBuildOptions } from "./variants";

export type LegacyProgrammeAdapterOptions = {
  athleteId?: string;
  overrides?: Record<string, WorkoutOverride>;
  logs?: SessionLog[];
  statusOverrides?: Record<string, Extract<SessionStatus, "planned" | "skipped">>;
  garminWorkoutIds?: Record<string, string>;
};

type LegacyWorkoutContext = {
  programme: Programme;
  week: ProgrammeWeek;
  day: ProgrammeDay;
};

function cloneLegacyBlocks(blocks: WorkoutBlock[]) {
  return blocks.map((block) => ({ ...block, items: [...block.items] }));
}

export function applyLegacyWorkoutOverride(
  workout: Workout,
  override?: WorkoutOverride | null,
): Workout {
  if (!override) {
    return {
      ...workout,
      focus: [...workout.focus],
      equipment: [...workout.equipment],
      blocks: cloneLegacyBlocks(workout.blocks),
      substitutions: workout.substitutions ? [...workout.substitutions] : undefined,
      alternatives: workout.alternatives ? [...workout.alternatives] : undefined,
      scaleOptions: workout.scaleOptions ? [...workout.scaleOptions] : undefined,
    };
  }

  return {
    ...workout,
    title: override.title ?? workout.title,
    date: override.date ?? workout.date,
    durationMinutes: override.durationMinutes ?? workout.durationMinutes,
    minimumMinutes: override.minimumMinutes ?? workout.minimumMinutes,
    intensity: override.intensity ?? workout.intensity,
    focus: override.focus ? [...override.focus] : [...workout.focus],
    equipment: override.equipment ? [...override.equipment] : [...workout.equipment],
    blocks: override.blocks
      ? cloneLegacyBlocks(override.blocks)
      : cloneLegacyBlocks(workout.blocks),
    prescribedLoadsOrPace:
      override.prescribedLoadsOrPace !== undefined
        ? override.prescribedLoadsOrPace
        : workout.prescribedLoadsOrPace,
    targetStimulus:
      override.targetStimulus !== undefined
        ? override.targetStimulus
        : workout.targetStimulus,
    scalingNotes:
      override.scalingNotes !== undefined
        ? override.scalingNotes
        : workout.scalingNotes,
  };
}

export function normalizeLegacyCategory(workout: Workout): AthleteSessionCategory {
  const signal = [
    workout.category,
    workout.sessionType,
    workout.title,
    ...workout.focus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (signal.includes("hyrox")) return "hyrox";
  if (signal.includes("fell") || signal.includes("trail")) return "trail";
  if (signal.includes("hike") || signal.includes("walk")) return "hike";
  if (signal.includes("race") || signal.includes("spartan")) return "race";
  if (signal.includes("mobility")) return "mobility";
  if (signal.includes("rest")) return "rest";
  if (signal.includes("hawkeye") || signal.includes("crossfit")) return "crossfit";
  if (workout.category === "track" || signal.includes("run")) return "run";
  if (workout.category === "gymnastics") return "gymnastics";
  if (workout.category === "strength") return "strength";
  if (workout.category === "hybrid") return "hybrid";
  if (workout.category === "recovery") return "recovery";
  if (workout.category === "conditioning") return "conditioning";
  return "custom";
}

function parsePaceSeconds(value: string | undefined) {
  if (!value) {
    return {};
  }

  const range = value.match(
    /(\d{1,2}):([0-5]\d)\s*(?:-|–|—|to)\s*(\d{1,2}):([0-5]\d)\s*\/?\s*km/i,
  );

  if (range) {
    return {
      paceRangeSecondsPerKm: [
        Number(range[1]) * 60 + Number(range[2]),
        Number(range[3]) * 60 + Number(range[4]),
      ] as [number, number],
    };
  }

  const single = value.match(/(\d{1,2}):([0-5]\d)\s*\/?\s*km/i);
  return single
    ? { paceSecondsPerKm: Number(single[1]) * 60 + Number(single[2]) }
    : {};
}

function blockFingerprint(block: {
  type: string;
  name: string;
  items: string[];
}) {
  return [
    block.type,
    block.name.trim().toLowerCase(),
    block.items.map((item) => item.trim().toLowerCase()).join("|"),
  ].join("\u001f");
}

function legacyBlockKey(block: WorkoutBlock, index: number) {
  return `${index}-${slug(block.name || block.type)}`;
}

function adaptOriginalBlocks(sessionId: string, blocks: WorkoutBlock[]) {
  const duplicateCounts = new Map<string, number>();

  return blocks.map((block, index): AthleteSessionBlock => {
    const fingerprint = blockFingerprint(block);
    const occurrence = duplicateCounts.get(fingerprint) ?? 0;
    duplicateCounts.set(fingerprint, occurrence + 1);

    return {
      id: makeStableId("block", sessionId, fingerprint, occurrence),
      legacyKey: legacyBlockKey(block, index),
      name: block.name,
      type: block.type,
      durationMinutes: block.durationMinutes,
      items: [...block.items],
    };
  });
}

function adaptCurrentBlocks(
  sessionId: string,
  blocks: WorkoutBlock[],
  originalBlocks: AthleteSessionBlock[],
) {
  const assignedOriginals: Array<AthleteSessionBlock | undefined> = Array.from({
    length: blocks.length,
  });
  const usedOriginalIds = new Set<string>();

  // Claim exact semantic matches first so an inserted block cannot shift every
  // legacy identity by one position.
  blocks.forEach((block, index) => {
    const fingerprint = blockFingerprint(block);
    const match = originalBlocks.find(
      (candidate) =>
        !usedOriginalIds.has(candidate.id) &&
        blockFingerprint(candidate) === fingerprint,
    );

    if (match) {
      assignedOriginals[index] = match;
      usedOriginalIds.add(match.id);
    }
  });

  // Name/type matches retain identity when the prescription text is edited.
  blocks.forEach((block, index) => {
    if (assignedOriginals[index]) return;
    const match = originalBlocks.find(
      (candidate) =>
        !usedOriginalIds.has(candidate.id) &&
        candidate.type === block.type &&
        candidate.name.trim().toLowerCase() ===
          block.name.trim().toLowerCase(),
    );

    if (match) {
      assignedOriginals[index] = match;
      usedOriginalIds.add(match.id);
    }
  });

  // Finally preserve position for an edited block when that original identity
  // was not already claimed by a reordered exact match.
  blocks.forEach((_, index) => {
    const candidate = originalBlocks[index];
    if (!assignedOriginals[index] && candidate && !usedOriginalIds.has(candidate.id)) {
      assignedOriginals[index] = candidate;
      usedOriginalIds.add(candidate.id);
    }
  });

  const addedCounts = new Map<string, number>();

  return blocks.map((block, index): AthleteSessionBlock => {
    const original = assignedOriginals[index];
    const fingerprint = blockFingerprint(block);
    const addedOccurrence = addedCounts.get(fingerprint) ?? 0;
    addedCounts.set(fingerprint, addedOccurrence + 1);

    return {
      id:
        original?.id ??
        makeStableId("block", sessionId, "added", fingerprint, addedOccurrence),
      legacyKey: original?.legacyKey ?? legacyBlockKey(block, index),
      name: block.name,
      type: block.type,
      durationMinutes: block.durationMinutes,
      items: [...block.items],
    };
  });
}

function prescriptionFromWorkout(
  workout: Workout,
  blocks: AthleteSessionBlock[],
): SessionPrescription {
  return {
    title: workout.title,
    category: normalizeLegacyCategory(workout),
    legacyCategory: workout.category,
    sessionType: workout.sessionType,
    phase: workout.phase,
    priority: workout.priority,
    date: workout.date,
    durationMinutes: workout.durationMinutes,
    minimumMinutes: workout.minimumMinutes,
    intensity: workout.intensity,
    focus: [...workout.focus],
    equipment: [...workout.equipment],
    blocks,
    targets: {
      prescribedLoadsOrPace: workout.prescribedLoadsOrPace,
      targetStimulus: workout.targetStimulus,
      ...parsePaceSeconds(workout.prescribedLoadsOrPace),
    },
    scalingNotes: workout.scalingNotes,
    coachNotes: workout.coachNotes,
    substitutions: [
      ...(workout.substitutions ?? []),
      ...(workout.alternatives ?? []),
    ],
  };
}

function parseDistanceMeters(value: string | undefined) {
  if (!value) return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(km|kilometres?|m|metres?|mi|miles?)\b/i);

  if (!match) return undefined;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "km" || unit.startsWith("kilomet")) return amount * 1_000;
  if (unit === "mi" || unit.startsWith("mile")) return amount * 1_609.344;
  return amount;
}

function matchCompletedBlock(
  result: BlockResult,
  index: number,
  blocks: AthleteSessionBlock[],
): CompletedBlockResult {
  const block =
    blocks.find(
      (candidate) =>
        candidate.id === result.blockKey ||
        candidate.legacyKey === result.blockKey,
    ) ??
    blocks.find(
      (candidate) =>
        candidate.name.trim().toLowerCase() === result.blockName.trim().toLowerCase(),
    ) ??
    blocks[index];

  return {
    blockId:
      block?.id ??
      makeStableId("completed_block", result.blockKey, result.blockName, index),
    legacyBlockKey: result.blockKey,
    blockName: result.blockName,
    status: result.status ?? "todo",
    result: result.result,
    load: result.load,
    reps: result.reps,
    time: result.time,
    calories: result.calories,
    distance: result.distance,
    notes: result.notes,
  };
}

function completionFromLog(
  log: SessionLog,
  blocks: AthleteSessionBlock[],
): CompletedPrescription {
  return {
    logId: log.id,
    completedAt: log.completedAt,
    rpe: log.rpe,
    actualDurationMinutes: log.actualDurationMinutes,
    actualDistanceMeters:
      log.blockResults
        ?.map((result) => parseDistanceMeters(result.distance))
        .filter((value): value is number => value !== undefined)
        .reduce((total, value) => total + value, 0) || undefined,
    score: log.score ?? log.result,
    limiter: log.limiter,
    notes: log.notes,
    blocks: (log.blockResults ?? []).map((result, index) =>
      matchCompletedBlock(result, index, blocks),
    ),
  };
}

function safeVariantUpdate(
  workout: Workout,
  sessionId: string,
  originalBlocks: AthleteSessionBlock[],
): Partial<SessionPrescription> {
  return {
    title: workout.title,
    durationMinutes: workout.durationMinutes,
    minimumMinutes: workout.minimumMinutes,
    intensity: workout.intensity,
    focus: [...workout.focus],
    equipment: [...workout.equipment],
    blocks: adaptCurrentBlocks(sessionId, workout.blocks, originalBlocks),
    targets: {
      prescribedLoadsOrPace: workout.prescribedLoadsOrPace,
      targetStimulus: workout.targetStimulus,
      ...parsePaceSeconds(workout.prescribedLoadsOrPace),
    },
    scalingNotes: workout.scalingNotes,
  };
}

function applyLegacyScaleChanges(
  workout: Workout,
  changes: Partial<Workout>,
): Workout {
  const merged = { ...workout, ...changes };

  return {
    ...merged,
    id: changes.id ?? workout.id,
    title: changes.title ?? workout.title,
    category: changes.category ?? workout.category,
    durationMinutes: changes.durationMinutes ?? workout.durationMinutes,
    intensity: changes.intensity ?? workout.intensity,
    focus: changes.focus ? [...changes.focus] : [...workout.focus],
    equipment: changes.equipment
      ? [...changes.equipment]
      : [...workout.equipment],
    blocks: changes.blocks
      ? cloneLegacyBlocks(changes.blocks)
      : cloneLegacyBlocks(workout.blocks),
  };
}

function legacyVariantOptions(
  workout: Workout,
  sessionId: string,
  originalBlocks: AthleteSessionBlock[],
): VariantBuildOptions {
  const scaleDown = workout.scaleOptions?.find(
    (option) => option.type === "scale_down" || option.type === "fatigue",
  );
  const minimum = workout.scaleOptions?.find((option) => option.type === "time_cap");

  return {
    adjustedPrescription: scaleDown?.changes
      ? safeVariantUpdate(
          applyLegacyScaleChanges(workout, scaleDown.changes),
          sessionId,
          originalBlocks,
        )
      : undefined,
    adjustedRationale: scaleDown?.description,
    minimumPrescription: minimum?.changes
      ? safeVariantUpdate(
          applyLegacyScaleChanges(workout, minimum.changes),
          sessionId,
          originalBlocks,
        )
      : undefined,
    minimumRationale: minimum?.description,
  };
}

function logsForContext(
  logs: SessionLog[],
  context: LegacyWorkoutContext,
  duplicateWorkoutIds: Set<string>,
) {
  const matching = logs.filter(
    (log) => log.workoutId === context.day.workout.id,
  );

  if (!duplicateWorkoutIds.has(context.day.workout.id)) {
    return { logs: matching, warning: undefined };
  }

  const date = context.day.workout.date;
  const dateMatched = date
    ? matching.filter((log) => log.workoutDate === date)
    : [];

  if (dateMatched.length > 0) {
    return {
      logs: dateMatched,
      warning:
        "Duplicate legacy workout ID was disambiguated using the captured workout date.",
    };
  }

  return {
    logs: [],
    warning:
      "Duplicate legacy workout ID prevented automatic log linking; preserve these logs for manual migration review.",
  };
}

export function adaptLegacyWorkout(
  context: LegacyWorkoutContext,
  options: LegacyProgrammeAdapterOptions = {},
  duplicateWorkoutIds = new Set<string>(),
): AthleteSession {
  const sourceWorkout = context.day.workout;
  const sessionId = makeStableId(
    "session",
    context.programme.id,
    context.week.id,
    context.day.id,
    sourceWorkout.id,
  );
  const override = options.overrides?.[sourceWorkout.id];
  const effectiveWorkout = applyLegacyWorkoutOverride(sourceWorkout, override);
  const originalBlocks = adaptOriginalBlocks(sessionId, sourceWorkout.blocks);
  const currentBlocks = adaptCurrentBlocks(
    sessionId,
    effectiveWorkout.blocks,
    originalBlocks,
  );
  const originalPrescription = prescriptionFromWorkout(
    sourceWorkout,
    originalBlocks,
  );
  const currentPrescription = prescriptionFromWorkout(
    effectiveWorkout,
    currentBlocks,
  );
  const linked = logsForContext(
    options.logs ?? [],
    context,
    duplicateWorkoutIds,
  );
  const completionHistory = linked.logs
    .map((log) => completionFromLog(log, currentBlocks))
    .sort(
      (first, second) =>
        new Date(first.completedAt).getTime() -
        new Date(second.completedAt).getTime(),
    );
  const completedPrescription =
    completionHistory[completionHistory.length - 1];
  const explicitStatus =
    options.statusOverrides?.[sessionId] ??
    options.statusOverrides?.[sourceWorkout.id];
  const status: SessionStatus = completedPrescription
    ? "completed"
    : explicitStatus === "skipped"
      ? "skipped"
      : override
        ? "modified"
        : "planned";
  const variants = buildSessionVariants(
    sessionId,
    currentPrescription,
    legacyVariantOptions(sourceWorkout, sessionId, originalBlocks),
  );
  const migrationWarnings = linked.warning ? [linked.warning] : [];

  if (!sourceWorkout.id) {
    migrationWarnings.push(
      "Legacy workout had no ID; a deterministic session ID was generated from programme position.",
    );
  }

  return {
    id: sessionId,
    athleteId: options.athleteId,
    source: {
      kind: "programme",
      sourceId: context.programme.id,
      legacyProgrammeId: context.programme.id,
      legacyWeekId: context.week.id,
      legacyDayId: context.day.id,
      legacyWorkoutId: sourceWorkout.id,
      legacySessionLogIds: linked.logs.map((log) => log.id),
    },
    status,
    isModified: Boolean(override),
    modificationReason: override?.modificationReason,
    originalPrescription,
    currentPrescription,
    completedPrescription,
    completionHistory,
    variants,
    selectedVariant: "full",
    plannedLoad: classifySessionLoad(currentPrescription),
    integration: {
      garminWorkoutId: options.garminWorkoutIds?.[sourceWorkout.id],
      garminSyncState: options.garminWorkoutIds?.[sourceWorkout.id]
        ? "scheduled"
        : "not_sent",
    },
    migrationWarnings,
    metadata: {
      legacyWeekNumber: context.week.weekNumber,
      legacyDayNumber: context.day.dayNumber,
      legacyDayLabel: context.day.label,
      legacyScaleOptionIds:
        sourceWorkout.scaleOptions?.map((option) => option.id) ?? [],
      sourceSessionId: sourceWorkout.sourceSessionId,
    },
  };
}

export function adaptLegacyProgramme(
  programme: Programme,
  options: LegacyProgrammeAdapterOptions = {},
): AthleteSession[] {
  const contexts = programme.weeks.flatMap((week) =>
    week.days.map((day) => ({ programme, week, day })),
  );
  const counts = contexts.reduce<Map<string, number>>((result, context) => {
    const id = context.day.workout.id;
    result.set(id, (result.get(id) ?? 0) + 1);
    return result;
  }, new Map());
  const duplicateWorkoutIds = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
  );

  return contexts.map((context) =>
    adaptLegacyWorkout(context, options, duplicateWorkoutIds),
  );
}
