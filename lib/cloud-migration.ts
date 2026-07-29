import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const shortText = z.string().trim().min(1).max(300);
const optionalText = z.string().max(20_000).optional();
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const boundedStringArray = z.array(z.string().max(2_000)).max(200);

const workoutBlockSchema = z
  .object({
    name: shortText,
    type: z.enum([
      "warmup",
      "strength",
      "skill",
      "conditioning",
      "intervals",
      "accessory",
      "cooldown",
    ]),
    durationMinutes: z.number().finite().min(0).max(10_080).optional(),
    items: z.array(z.string().max(5_000)).max(200),
  })
  .strict();

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string().max(100_000),
    z.array(jsonValueSchema).max(2_000),
    z
      .record(z.string().min(1).max(300), jsonValueSchema)
      .refine((value) => Object.keys(value).length <= 2_000, {
        message: "JSON object has too many fields",
      }),
  ]),
);

const jsonObjectSchema = z
  .record(z.string().min(1).max(300), jsonValueSchema)
  .refine((value) => Object.keys(value).length <= 2_000, {
    message: "JSON object has too many fields",
  });

const workoutSchema = z
  .object({
    id: shortText,
    title: shortText,
    category: z.enum([
      "strength",
      "conditioning",
      "track",
      "gymnastics",
      "hybrid",
      "recovery",
    ]),
    durationMinutes: z.number().finite().min(0).max(10_080),
    intensity: z.enum(["easy", "moderate", "hard"]),
    sessionType: z.string().max(300).optional(),
    phase: z.string().max(300).optional(),
    priority: z
      .enum(["Low", "Medium", "High", "Recovery", "Target", "Primer", "Optional"])
      .optional(),
    date: isoDate.optional(),
    day: z.string().max(100).optional(),
    minimumMinutes: z.number().finite().min(0).max(10_080).optional(),
    prescribedLoadsOrPace: optionalText,
    targetStimulus: optionalText,
    scalingNotes: optionalText,
    sourceSessionId: z.string().max(300).optional(),
    focus: boundedStringArray,
    equipment: boundedStringArray,
    blocks: z.array(workoutBlockSchema).max(100),
    coachNotes: optionalText,
    substitutions: boundedStringArray.optional(),
    alternatives: boundedStringArray.optional(),
    scaleOptions: z
      .array(
        z
          .object({
            id: shortText,
            label: shortText,
            type: z.enum([
              "scale_down",
              "scale_up",
              "equipment_swap",
              "time_cap",
              "fatigue",
            ]),
            description: z.string().max(20_000),
            changes: jsonObjectSchema.optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict();

const programmeSchema = z
  .object({
    id: shortText,
    name: shortText,
    description: z.string().max(50_000),
    durationWeeks: z.number().int().min(0).max(520),
    startDate: isoDate.nullish(),
    targetEvent: z.string().max(1_000).optional(),
    targetDate: isoDate.optional(),
    checkpointName: z.string().max(1_000).optional(),
    checkpointDate: isoDate.optional(),
    trainingSettings: z
      .record(
        z.string().min(1).max(300),
        z.union([z.string().max(5_000), z.number().finite()]),
      )
      .refine((value) => Object.keys(value).length <= 500, {
        message: "Too many training settings",
      })
      .optional(),
    handstandGuide: z.array(jsonObjectSchema).max(200).optional(),
    weeks: z
      .array(
        z
          .object({
            id: shortText,
            weekNumber: z.number().int().min(0).max(520),
            title: shortText,
            days: z
              .array(
                z
                  .object({
                    id: shortText,
                    dayNumber: z.number().int().min(0).max(31),
                    label: shortText,
                    workout: workoutSchema,
                  })
                  .strict(),
              )
              .max(31),
          })
          .strict(),
      )
      .max(520),
  })
  .strict();

const workoutOverrideSchema = z
  .object({
    workoutId: shortText,
    date: isoDate.optional(),
    title: z.string().trim().min(1).max(300).optional(),
    durationMinutes: z.number().finite().min(0).max(10_080).optional(),
    minimumMinutes: z.number().finite().min(0).max(10_080).optional(),
    intensity: z.enum(["easy", "moderate", "hard"]).optional(),
    focus: boundedStringArray.optional(),
    equipment: boundedStringArray.optional(),
    blocks: z.array(workoutBlockSchema).max(100).optional(),
    prescribedLoadsOrPace: optionalText,
    targetStimulus: optionalText,
    scalingNotes: optionalText,
    modificationReason: optionalText,
    updatedAt: isoDateTime,
  })
  .strict();

const blockResultSchema = z
  .object({
    blockKey: z.string().max(500),
    blockName: z.string().max(500),
    blockType: z.string().max(100).optional(),
    blockItems: z.array(z.string().max(5_000)).max(200).optional(),
    status: z.enum(["todo", "done", "skipped"]).optional(),
    result: optionalText,
    load: optionalText,
    reps: optionalText,
    time: optionalText,
    calories: optionalText,
    distance: optionalText,
    notes: optionalText,
  })
  .strict();

const sessionLogSchema = z
  .object({
    id: shortText,
    workoutId: shortText,
    workoutTitle: shortText,
    workoutCategory: z
      .enum([
        "strength",
        "conditioning",
        "track",
        "gymnastics",
        "hybrid",
        "recovery",
      ])
      .optional(),
    workoutSessionType: z.string().max(300).optional(),
    workoutDate: isoDate.optional(),
    workoutModified: z.boolean().optional(),
    completedAt: isoDateTime,
    rpe: z.number().finite().min(0).max(10),
    actualDurationMinutes: z.number().finite().min(0).max(10_080).optional(),
    score: optionalText,
    limiter: optionalText,
    result: optionalText,
    notes: optionalText,
    blockResults: z.array(blockResultSchema).max(200).optional(),
  })
  .strict();

const blockProgressSchema = z
  .object({
    workoutId: shortText,
    updatedAt: isoDateTime,
    blocks: z
      .record(z.string().min(1).max(500), z.enum(["todo", "done", "skipped"]))
      .refine((value) => Object.keys(value).length <= 200, {
        message: "Too many block progress entries",
      }),
  })
  .strict();

const variantSchema = z
  .object({
    id: z.enum(["full", "adjusted", "minimum"]),
    label: shortText,
    reason: z.string().max(20_000),
    prescription: workoutSchema,
  })
  .strict();

const manualSessionSchema = z
  .object({
    id: shortText,
    type: z.enum([
      "run",
      "strength",
      "crossfit",
      "conditioning",
      "hyrox",
      "fell-trail",
      "hike",
      "race",
      "mobility",
      "recovery",
      "rest",
      "custom",
    ]),
    scheduledDate: isoDate,
    originalWorkout: workoutSchema,
    variants: z
      .object({
        full: variantSchema,
        adjusted: variantSchema,
        minimum: variantSchema,
      })
      .strict(),
    selectedVariant: z.enum(["full", "adjusted", "minimum"]),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict();

const lifecycleSchema = z
  .record(
    z.string().min(1).max(300),
    z
      .object({
        status: z.enum(["skipped", "deleted"]),
        reason: optionalText,
        updatedAt: isoDateTime,
      })
      .strict(),
  )
  .refine((value) => Object.keys(value).length <= 5_000, {
    message: "Too many lifecycle entries",
  });

const boundedOverrideRecord = z
  .record(z.string().min(1).max(300), workoutOverrideSchema)
  .refine((value) => Object.keys(value).length <= 5_000, {
    message: "Too many workout overrides",
  });

const boundedProgressRecord = z
  .record(z.string().min(1).max(300), blockProgressSchema)
  .refine((value) => Object.keys(value).length <= 5_000, {
    message: "Too many block progress records",
  });

const boundedBlockResultsRecord = z
  .record(
    z.string().min(1).max(300),
    z
      .record(z.string().min(1).max(500), blockResultSchema)
      .refine((value) => Object.keys(value).length <= 200, {
        message: "Too many block results",
      }),
  )
  .refine((value) => Object.keys(value).length <= 5_000, {
    message: "Too many workout block result records",
  });

export const cloudMigrationRequestSchema = z
  .object({
    snapshot: z
      .object({
        version: z.union([z.literal(1), z.literal(2)]),
        programme: programmeSchema.nullable(),
        logs: z.array(sessionLogSchema).max(5_000),
        selectedTodayWorkoutId: z.string().max(300).nullable().default(null),
        programmeAnchor: isoDate.nullable().default(null),
        programmeStartDate: isoDate.nullable().default(null),
        blockProgress: boundedProgressRecord.default({}),
        blockResults: boundedBlockResultsRecord.default({}),
        workoutOverrides: boundedOverrideRecord.default({}),
        exportedAt: isoDateTime,
      })
      .strict(),
    manualSessions: z.array(manualSessionSchema).max(2_000),
    lifecycle: lifecycleSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const logIds = new Set<string>();
    for (const [index, log] of value.snapshot.logs.entries()) {
      if (logIds.has(log.id)) {
        context.addIssue({
          code: "custom",
          message: "Session log IDs must be unique",
          path: ["snapshot", "logs", index, "id"],
        });
      }
      logIds.add(log.id);
    }

    const manualIds = new Set<string>();
    for (const [index, session] of value.manualSessions.entries()) {
      if (manualIds.has(session.id)) {
        context.addIssue({
          code: "custom",
          message: "Manual session IDs must be unique",
          path: ["manualSessions", index, "id"],
        });
      }
      manualIds.add(session.id);
    }
  });

export type CloudMigrationInput = z.infer<typeof cloudMigrationRequestSchema>;
type Workout = z.infer<typeof workoutSchema>;
type WorkoutOverride = z.infer<typeof workoutOverrideSchema>;
type SessionLog = z.infer<typeof sessionLogSchema>;

export const MAX_CLOUD_MIGRATION_BYTES = 2 * 1_024 * 1_024;
export const CLOUD_MIGRATION_KEY = "local_storage_to_normalized_v1";
const CLOUD_SOURCE = "local_storage";
const UPSERT_BATCH_SIZE = 100;

export type CloudMigrationTable =
  | "training_plans"
  | "sessions"
  | "session_blocks"
  | "session_variants"
  | "session_logs";

export type CloudMigrationRow = Record<string, unknown> & { id: string };

export type DataMigrationRecord = CloudMigrationRow & {
  athlete_id: string;
  migration_key: string;
  source_kind: string;
  source_version: string | null;
  source_fingerprint: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  records_discovered: number;
  records_imported: number;
  records_skipped: number;
  records_failed: number;
  checkpoint: Record<string, unknown>;
  summary: Record<string, unknown>;
  failure_details: Array<Record<string, unknown>>;
  started_at: string | null;
  completed_at: string | null;
};

export interface CloudMigrationRepository {
  upsertAthlete(row: CloudMigrationRow): Promise<void>;
  claimMigration(row: DataMigrationRecord): Promise<void>;
  getMigration(
    athleteId: string,
    migrationKey: string,
  ): Promise<DataMigrationRecord | null>;
  updateMigration(row: DataMigrationRecord): Promise<void>;
  upsertRows(
    table: CloudMigrationTable,
    rows: CloudMigrationRow[],
  ): Promise<void>;
}

export class CloudMigrationConflictError extends Error {
  constructor() {
    super(
      "A different local snapshot has already claimed the one-time cloud migration.",
    );
    this.name = "CloudMigrationConflictError";
  }
}

export class CloudMigrationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudMigrationConfigurationError";
  }
}

export class CloudMigrationStorageError extends Error {
  readonly stage: string;
  readonly code: string | undefined;

  constructor(stage: string, code?: string) {
    super(`Cloud migration storage failed during ${stage}`);
    this.name = "CloudMigrationStorageError";
    this.stage = stage;
    this.code = code;
  }
}

export type CloudMigrationRows = {
  fingerprint: string;
  plans: CloudMigrationRow[];
  sessions: CloudMigrationRow[];
  blocks: CloudMigrationRow[];
  variants: CloudMigrationRow[];
  logs: CloudMigrationRow[];
};

export type CloudMigrationSummary = {
  athletes: 1;
  plans: number;
  sessions: number;
  blocks: number;
  variants: number;
  logs: number;
  browserDataDeleted: false;
};

function stableUuid(...parts: Array<string | number>) {
  const bytes = createHash("sha256")
    .update(parts.map(String).join("\u001f"))
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function sourceKey(prefix: string, ...parts: Array<string | number>) {
  return `${prefix}:${parts
    .map((part) => encodeURIComponent(String(part)))
    .join(":")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(object[key])}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function programmeNeedsFallbackDate(input: CloudMigrationInput) {
  const programme = input.snapshot.programme;
  if (!programme) return false;

  const anchor =
    input.snapshot.programmeAnchor ??
    input.snapshot.programmeStartDate ??
    programme.startDate;

  if (anchor) return false;
  return programme.weeks.some((week) =>
    week.days.some((day) => !day.workout.date),
  );
}

export function fingerprintCloudMigration(input: CloudMigrationInput) {
  const stableSnapshot: Record<string, unknown> = {
    ...input.snapshot,
  };
  delete stableSnapshot.exportedAt;
  const fingerprintSource: Record<string, unknown> = {
    ...input,
    snapshot: stableSnapshot,
  };

  if (programmeNeedsFallbackDate(input)) {
    fingerprintSource.fallbackScheduleDate =
      input.snapshot.exportedAt.slice(0, 10);
  }

  return createHash("sha256")
    .update(canonicalJson(fingerprintSource))
    .digest("hex");
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function applyOverride(
  workout: Workout,
  override: WorkoutOverride | undefined,
): Workout {
  if (!override) return workout;

  return {
    ...workout,
    title: override.title ?? workout.title,
    date: override.date ?? workout.date,
    durationMinutes:
      override.durationMinutes ?? workout.durationMinutes,
    minimumMinutes: override.minimumMinutes ?? workout.minimumMinutes,
    intensity: override.intensity ?? workout.intensity,
    focus: override.focus ?? workout.focus,
    equipment: override.equipment ?? workout.equipment,
    blocks: override.blocks ?? workout.blocks,
    prescribedLoadsOrPace:
      override.prescribedLoadsOrPace ?? workout.prescribedLoadsOrPace,
    targetStimulus: override.targetStimulus ?? workout.targetStimulus,
    scalingNotes: override.scalingNotes ?? workout.scalingNotes,
  };
}

function inferSessionType(
  workout:
    | Pick<Workout, "category" | "sessionType" | "title" | "focus">
    | {
        category?: Workout["category"];
        sessionType?: string;
        title: string;
        focus?: string[];
      },
) {
  const signal = [
    workout.category,
    workout.sessionType,
    workout.title,
    ...(workout.focus ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (signal.includes("hyrox")) return "hyrox";
  if (signal.includes("hawkeye")) return "hawkeye";
  if (signal.includes("crossfit")) return "crossfit";
  if (
    signal.includes("fell") ||
    signal.includes("trail") ||
    signal.includes("mountain")
  ) {
    return "fell_trail";
  }
  if (signal.includes("hike") || signal.includes("walk")) return "hike";
  if (signal.includes("spartan")) return "spartan_race";
  if (signal.includes("race")) return "race";
  if (signal.includes("mobility")) return "mobility";
  if (signal.includes("rest")) return "rest";
  if (
    workout.category === "track" ||
    signal.includes("run") ||
    signal.includes("tempo") ||
    signal.includes("threshold")
  ) {
    return "run";
  }
  if (workout.category === "strength") return "strength";
  if (workout.category === "conditioning") return "conditioning";
  if (workout.category === "recovery") return "recovery";
  if (workout.category === "hybrid") return "conditioning";
  return "custom";
}

function mapManualSessionType(
  value: CloudMigrationInput["manualSessions"][number]["type"],
) {
  if (value === "fell-trail") return "fell_trail";
  return value;
}

function mapBlockType(type: Workout["blocks"][number]["type"]) {
  switch (type) {
    case "warmup":
      return "warm_up";
    case "intervals":
      return "interval";
    case "cooldown":
      return "cool_down";
    case "conditioning":
      return "metcon";
    case "accessory":
      return "work";
    case "skill":
      return "custom";
    default:
      return type;
  }
}

function programmeSessionDate(
  input: CloudMigrationInput,
  workout: Workout,
  weekIndex: number,
  dayNumber: number,
) {
  if (workout.date) return workout.date;

  const programme = input.snapshot.programme;
  const anchor =
    input.snapshot.programmeAnchor ??
    input.snapshot.programmeStartDate ??
    programme?.startDate ??
    input.snapshot.exportedAt.slice(0, 10);

  return addDays(anchor, weekIndex * 7 + Math.max(0, dayNumber - 1));
}

function selectedProgrammeVariant(
  override: WorkoutOverride | undefined,
) {
  if (!override) return "full";
  if (
    override.minimumMinutes !== undefined &&
    override.durationMinutes === override.minimumMinutes
  ) {
    return "minimum";
  }
  return "adjusted";
}

function sortedDates(rows: SessionDraft[]) {
  return rows
    .map((draft) => draft.scheduledOn)
    .filter(Boolean)
    .sort();
}

type SessionDraft = {
  id: string;
  rawWorkoutId: string;
  scheduledOn: string;
  original: Workout | Record<string, unknown>;
  current: Workout | Record<string, unknown>;
  sessionType: string;
  selectedVariant: "full" | "adjusted" | "minimum";
  status: "planned" | "completed" | "skipped" | "modified" | "cancelled";
  sourceId: string;
  legacyId: string | null;
  trainingPlanId: string;
  title: string;
  modificationReason?: string;
  lifecycle?: CloudMigrationInput["lifecycle"][string];
  latestLog?: SessionLog;
  blockProgress?: CloudMigrationInput["snapshot"]["blockProgress"][string];
  blockResults?: CloudMigrationInput["snapshot"]["blockResults"][string];
  variantInputs: Array<{
    type: "full" | "adjusted" | "minimum";
    title: string;
    prescription: Record<string, unknown>;
    rationale?: string;
    recommended: boolean;
  }>;
};

function buildPlanRow(
  id: string,
  athleteId: string,
  name: string,
  sourceId: string,
  originalPlan: Record<string, unknown>,
  currentPlan: Record<string, unknown>,
  dates: string[],
  legacyId: string | null,
): CloudMigrationRow {
  return {
    id,
    athlete_id: athleteId,
    name,
    status: "active",
    starts_on: dates[0] ?? null,
    ends_on: dates[dates.length - 1] ?? null,
    original_plan: originalPlan,
    current_plan: currentPlan,
    source: CLOUD_SOURCE,
    source_id: sourceId,
    legacy_id: legacyId,
  };
}

function buildEffectiveProgramme(input: CloudMigrationInput) {
  const programme = input.snapshot.programme;
  if (!programme) return null;

  return {
    ...programme,
    startDate:
      input.snapshot.programmeAnchor ??
      input.snapshot.programmeStartDate ??
      programme.startDate,
    weeks: programme.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        workout: applyOverride(
          day.workout,
          input.snapshot.workoutOverrides[day.workout.id],
        ),
      })),
    })),
  };
}

function blockCompletion(
  block: Workout["blocks"][number] | undefined,
  position: number,
  results: SessionLog["blockResults"] | undefined,
) {
  if (!results) return null;

  return (
    results.find(
      (result) =>
        result.blockName.trim().toLowerCase() ===
        block?.name.trim().toLowerCase(),
    ) ??
    results[position] ??
    null
  );
}

function buildSessionRows(
  drafts: SessionDraft[],
  athleteId: string,
) {
  const sessions: CloudMigrationRow[] = [];
  const blocks: CloudMigrationRow[] = [];
  const variants: CloudMigrationRow[] = [];
  const logs: CloudMigrationRow[] = [];

  for (const draft of drafts) {
    const originalWorkout = draft.original as Partial<Workout>;
    const currentWorkout = draft.current as Partial<Workout>;
    const originalBlocks = originalWorkout.blocks ?? [];
    const currentBlocks = currentWorkout.blocks ?? [];
    const localBlockResults = draft.blockResults ?? {};
    const completedResult =
      draft.latestLog || draft.blockProgress || Object.keys(localBlockResults).length
        ? {
            log: draft.latestLog ?? null,
            blockProgress: draft.blockProgress ?? null,
            blockResults: localBlockResults,
            localLifecycle: draft.lifecycle ?? null,
          }
        : null;
    const completedAt = draft.latestLog?.completedAt ?? null;

    sessions.push({
      id: draft.id,
      athlete_id: athleteId,
      training_plan_id: draft.trainingPlanId,
      title: draft.title,
      session_type: draft.sessionType,
      scheduled_on: draft.scheduledOn,
      status: draft.latestLog ? "completed" : draft.status,
      selected_variant: draft.selectedVariant,
      original_prescription: draft.original,
      current_prescription: draft.current,
      completed_result: completedResult,
      modification_reason: draft.modificationReason ?? null,
      planned_duration_seconds:
        typeof currentWorkout.durationMinutes === "number"
          ? Math.round(currentWorkout.durationMinutes * 60)
          : null,
      completed_at: completedAt,
      source: CLOUD_SOURCE,
      source_id: draft.sourceId,
      legacy_id: draft.legacyId,
    });

    const blockCount = Math.max(originalBlocks.length, currentBlocks.length);
    for (let position = 0; position < blockCount; position += 1) {
      const originalBlock = originalBlocks[position];
      const currentBlock = currentBlocks[position];
      const identityBlock = currentBlock ?? originalBlock;

      if (!identityBlock) continue;

      const id = stableUuid(
        "trainvault",
        athleteId,
        "session-block",
        draft.id,
        position,
      );
      blocks.push({
        id,
        athlete_id: athleteId,
        session_id: draft.id,
        position,
        block_type: mapBlockType(identityBlock.type),
        title: identityBlock.name || null,
        original_prescription: originalBlock ?? {},
        current_prescription: currentBlock ?? {},
        completed_result: blockCompletion(
          identityBlock,
          position,
          draft.latestLog?.blockResults,
        ),
        source_id: `${draft.sourceId}:block:${position}`,
        legacy_id: null,
      });
    }

    for (const variant of draft.variantInputs) {
      variants.push({
        id: stableUuid(
          "trainvault",
          athleteId,
          "session-variant",
          draft.id,
          variant.type,
        ),
        athlete_id: athleteId,
        session_id: draft.id,
        variant_type: variant.type,
        title: variant.title,
        prescription: variant.prescription,
        rationale: variant.rationale ?? null,
        planned_training_cost: null,
        is_recommended: variant.recommended,
        source_id: `${draft.sourceId}:variant:${variant.type}`,
        legacy_id: null,
      });
    }

    if (draft.latestLog) {
      const localResults = Object.values(localBlockResults);
      logs.push({
        id: stableUuid(
          "trainvault",
          athleteId,
          "session-log",
          draft.latestLog.id,
        ),
        athlete_id: athleteId,
        session_id: draft.id,
        log_status: "completed",
        completed_at: draft.latestLog.completedAt,
        duration_seconds:
          draft.latestLog.actualDurationMinutes === undefined
            ? null
            : Math.round(draft.latestLog.actualDurationMinutes * 60),
        rpe: draft.latestLog.rpe,
        notes: draft.latestLog.notes ?? null,
        original_prescription: draft.original,
        current_prescription: draft.current,
        completed_result: {
          log: draft.latestLog,
          blockProgress: draft.blockProgress ?? null,
          blockResults: localBlockResults,
          localLifecycle: draft.lifecycle ?? null,
        },
        block_results:
          draft.latestLog.blockResults?.length
            ? draft.latestLog.blockResults
            : localResults,
        source: CLOUD_SOURCE,
        source_id: `session-log:${draft.latestLog.id}`,
        legacy_id: draft.latestLog.id,
      });
    }
  }

  return { sessions, blocks, variants, logs };
}

export function buildCloudMigrationRows(
  input: CloudMigrationInput,
  athleteId: string,
): CloudMigrationRows {
  const fingerprint = fingerprintCloudMigration(input);
  const plans: CloudMigrationRow[] = [];
  const drafts: SessionDraft[] = [];
  const programme = input.snapshot.programme;
  const programmePlanId = programme
    ? stableUuid("trainvault", athleteId, "training-plan", programme.id)
    : null;
  const manualPlanId = stableUuid(
    "trainvault",
    athleteId,
    "training-plan",
    "manual-sessions-v1",
  );
  const recoveredPlanId = stableUuid(
    "trainvault",
    athleteId,
    "training-plan",
    "recovered-completions-v1",
  );
  const workoutIdCounts = new Map<string, number>();

  programme?.weeks.forEach((week) => {
    week.days.forEach((day) => {
      workoutIdCounts.set(
        day.workout.id,
        (workoutIdCounts.get(day.workout.id) ?? 0) + 1,
      );
    });
  });

  const manualIdSet = new Set(input.manualSessions.map((session) => session.id));
  for (const id of manualIdSet) {
    workoutIdCounts.set(id, (workoutIdCounts.get(id) ?? 0) + 1);
  }

  if (programme && programmePlanId) {
    programme.weeks.forEach((week, weekIndex) => {
      week.days.forEach((day, dayIndex) => {
        const original = day.workout;
        const override = input.snapshot.workoutOverrides[original.id];
        const current = applyOverride(original, override);
        const lifecycle = input.lifecycle[original.id];
        const scheduledOn = programmeSessionDate(
          input,
          current,
          weekIndex,
          day.dayNumber,
        );
        const selectedVariant = selectedProgrammeVariant(override);
        const sourceId = sourceKey(
          "programme",
          programme.id,
          week.id || weekIndex,
          day.id || dayIndex,
          original.id,
        );
        const id = stableUuid(
          "trainvault",
          athleteId,
          "session",
          sourceId,
        );
        const variantInputs: SessionDraft["variantInputs"] = [
          {
            type: "full",
            title: "Full",
            prescription: original,
            rationale: "Original imported prescription.",
            recommended: selectedVariant === "full",
          },
        ];

        if (selectedVariant !== "full") {
          variantInputs.push({
            type: selectedVariant,
            title:
              selectedVariant === "minimum" ? "Minimum" : "Adjusted",
            prescription: current,
            rationale:
              override?.modificationReason ??
              "Imported local workout override.",
            recommended: true,
          });
        }

        drafts.push({
          id,
          rawWorkoutId: original.id,
          scheduledOn,
          original,
          current,
          sessionType: inferSessionType(current),
          selectedVariant,
          status:
            lifecycle?.status === "deleted"
              ? "cancelled"
              : lifecycle?.status === "skipped"
                ? "skipped"
                : override
                  ? "modified"
                  : "planned",
          sourceId,
          legacyId:
            workoutIdCounts.get(original.id) === 1 ? original.id : null,
          trainingPlanId: programmePlanId,
          title: current.title,
          modificationReason:
            override?.modificationReason ?? lifecycle?.reason,
          lifecycle,
          blockProgress: input.snapshot.blockProgress[original.id],
          blockResults: input.snapshot.blockResults[original.id],
          variantInputs,
        });
      });
    });
  }

  for (const manual of input.manualSessions) {
    const original = manual.originalWorkout;
    const selected =
      manual.variants[manual.selectedVariant]?.prescription ?? original;
    const override = input.snapshot.workoutOverrides[manual.id];
    const current = applyOverride(selected, override);
    const lifecycle = input.lifecycle[manual.id];
    const sourceId = `manual-session:${manual.id}`;
    const id = stableUuid(
      "trainvault",
      athleteId,
      "session",
      sourceId,
    );

    drafts.push({
      id,
      rawWorkoutId: manual.id,
      scheduledOn: current.date ?? manual.scheduledDate,
      original,
      current,
      sessionType: mapManualSessionType(manual.type),
      selectedVariant: manual.selectedVariant,
      status:
        lifecycle?.status === "deleted"
          ? "cancelled"
          : lifecycle?.status === "skipped"
            ? "skipped"
            : override || manual.selectedVariant !== "full"
              ? "modified"
              : "planned",
      sourceId,
      legacyId:
        workoutIdCounts.get(manual.id) === 1 ? manual.id : null,
      trainingPlanId: manualPlanId,
      title: current.title,
      modificationReason: override?.modificationReason ?? lifecycle?.reason,
      lifecycle,
      blockProgress: input.snapshot.blockProgress[manual.id],
      blockResults: input.snapshot.blockResults[manual.id],
      variantInputs: (
        ["full", "adjusted", "minimum"] as const
      ).map((type) => ({
        type,
        title: manual.variants[type].label,
        prescription: manual.variants[type].prescription,
        rationale: manual.variants[type].reason,
        recommended: manual.selectedVariant === type,
      })),
    });
  }

  const candidateDraftsByWorkoutId = new Map<string, SessionDraft[]>();
  for (const draft of drafts) {
    const candidates =
      candidateDraftsByWorkoutId.get(draft.rawWorkoutId) ?? [];
    candidates.push(draft);
    candidateDraftsByWorkoutId.set(draft.rawWorkoutId, candidates);
  }

  const logsByDraft = new Map<string, SessionLog[]>();
  const recoveredLogs: SessionLog[] = [];
  for (const log of input.snapshot.logs) {
    const candidates =
      candidateDraftsByWorkoutId.get(log.workoutId) ?? [];
    const dateMatches = log.workoutDate
      ? candidates.filter(
          (candidate) => candidate.scheduledOn === log.workoutDate,
        )
      : [];
    const target =
      candidates.length === 1
        ? candidates[0]
        : dateMatches.length === 1
          ? dateMatches[0]
          : null;

    if (!target) {
      recoveredLogs.push(log);
      continue;
    }

    const attached = logsByDraft.get(target.id) ?? [];
    attached.push(log);
    logsByDraft.set(target.id, attached);
  }

  for (const draft of drafts) {
    const attached = (logsByDraft.get(draft.id) ?? []).sort((first, second) =>
      first.completedAt.localeCompare(second.completedAt),
    );
    draft.latestLog = attached.pop();
    recoveredLogs.push(...attached);
  }

  for (const log of recoveredLogs) {
    const sourceId = `recovered-log-session:${log.id}`;
    const id = stableUuid(
      "trainvault",
      athleteId,
      "session",
      sourceId,
    );
    const recoveredPrescription: Record<string, unknown> = {
      id: `recovered-${log.id}`,
      title: log.workoutTitle,
      category: log.workoutCategory ?? "hybrid",
      sessionType: log.workoutSessionType,
      date: log.workoutDate,
      durationMinutes: log.actualDurationMinutes ?? 0,
      focus: [],
      equipment: [],
      blocks: [],
      recoveredFromLocalLog: true,
      legacyWorkoutId: log.workoutId,
    };

    drafts.push({
      id,
      rawWorkoutId: log.workoutId,
      scheduledOn: log.workoutDate ?? log.completedAt.slice(0, 10),
      original: recoveredPrescription,
      current: recoveredPrescription,
      sessionType: inferSessionType({
        category: log.workoutCategory,
        sessionType: log.workoutSessionType,
        title: log.workoutTitle,
      }),
      selectedVariant: "full",
      status: "completed",
      sourceId,
      legacyId: null,
      trainingPlanId: recoveredPlanId,
      title: log.workoutTitle,
      latestLog: log,
      blockProgress: input.snapshot.blockProgress[log.workoutId],
      blockResults: input.snapshot.blockResults[log.workoutId],
      variantInputs: [
        {
          type: "full",
          title: "Recovered completion",
          prescription: recoveredPrescription,
          rationale:
            "Recovered from a local completion that could not be linked uniquely.",
          recommended: true,
        },
      ],
    });
  }

  const programmeDrafts = drafts.filter(
    (draft) => draft.trainingPlanId === programmePlanId,
  );
  if (programme && programmePlanId) {
    plans.push(
      buildPlanRow(
        programmePlanId,
        athleteId,
        programme.name,
          sourceKey("programme", programme.id),
        programme,
        buildEffectiveProgramme(input) ?? programme,
        sortedDates(programmeDrafts),
        programme.id,
      ),
    );
  }

  const manualDrafts = drafts.filter(
    (draft) => draft.trainingPlanId === manualPlanId,
  );
  if (manualDrafts.length > 0) {
    plans.push(
      buildPlanRow(
        manualPlanId,
        athleteId,
        "TrainVault manual sessions",
        "manual-sessions-v1",
        {
          kind: "manual_sessions",
          sessions: input.manualSessions.map((session) => ({
            id: session.id,
            scheduledDate: session.scheduledDate,
            originalWorkout: session.originalWorkout,
          })),
        },
        {
          kind: "manual_sessions",
          sessions: input.manualSessions,
          lifecycle: Object.fromEntries(
            input.manualSessions
              .filter((session) => input.lifecycle[session.id])
              .map((session) => [
                session.id,
                input.lifecycle[session.id],
              ]),
          ),
        },
        sortedDates(manualDrafts),
        null,
      ),
    );
  }

  const recoveredDrafts = drafts.filter(
    (draft) => draft.trainingPlanId === recoveredPlanId,
  );
  if (recoveredDrafts.length > 0) {
    plans.push(
      buildPlanRow(
        recoveredPlanId,
        athleteId,
        "Recovered local completions",
        "recovered-completions-v1",
        {
          kind: "recovered_completions",
          logIds: recoveredDrafts.map(
            (draft) => draft.latestLog?.id,
          ),
        },
        {
          kind: "recovered_completions",
          logIds: recoveredDrafts.map(
            (draft) => draft.latestLog?.id,
          ),
        },
        sortedDates(recoveredDrafts),
        null,
      ),
    );
  }

  const normalized = buildSessionRows(drafts, athleteId);
  return {
    fingerprint,
    plans,
    sessions: normalized.sessions,
    blocks: normalized.blocks,
    variants: normalized.variants,
    logs: normalized.logs,
  };
}

function migrationSummary(
  rows: CloudMigrationRows,
): CloudMigrationSummary {
  return {
    athletes: 1,
    plans: rows.plans.length,
    sessions: rows.sessions.length,
    blocks: rows.blocks.length,
    variants: rows.variants.length,
    logs: rows.logs.length,
    browserDataDeleted: false,
  };
}

function totalImported(summary: CloudMigrationSummary) {
  return (
    summary.athletes +
    summary.plans +
    summary.sessions +
    summary.blocks +
    summary.variants +
    summary.logs
  );
}

function totalDiscovered(input: CloudMigrationInput) {
  const programmeSessions =
    input.snapshot.programme?.weeks.reduce(
      (total, week) => total + week.days.length,
      0,
    ) ?? 0;
  return (
    1 +
    (input.snapshot.programme ? 1 : 0) +
    programmeSessions +
    input.manualSessions.length +
    input.snapshot.logs.length
  );
}

function migrationRecord(
  athleteId: string,
  input: CloudMigrationInput,
  rows: CloudMigrationRows,
  now: string,
): DataMigrationRecord {
  return {
    id: stableUuid(
      "trainvault",
      athleteId,
      "data-migration",
      CLOUD_MIGRATION_KEY,
    ),
    athlete_id: athleteId,
    migration_key: CLOUD_MIGRATION_KEY,
    source_kind: "browser_local_storage",
    source_version: String(input.snapshot.version),
    source_fingerprint: rows.fingerprint,
    status: "in_progress",
    records_discovered: totalDiscovered(input),
    records_imported: 0,
    records_skipped: 0,
    records_failed: 0,
    checkpoint: {
      phase: "claimed",
      browserDataDeleted: false,
    },
    summary: migrationSummary(rows),
    failure_details: [],
    started_at: now,
    completed_at: null,
  };
}

export type ExecuteCloudMigrationResult = {
  alreadyMigrated: boolean;
  summary: CloudMigrationSummary;
  fingerprint: string;
};

export async function executeCloudMigration(
  input: CloudMigrationInput,
  options: {
    athleteId: string;
    repository: CloudMigrationRepository;
    now?: () => Date;
  },
): Promise<ExecuteCloudMigrationResult> {
  const { athleteId, repository } = options;
  const rows = buildCloudMigrationRows(input, athleteId);
  const summary = migrationSummary(rows);
  const now = (options.now ?? (() => new Date()))().toISOString();

  try {
    await repository.upsertAthlete({
      id: athleteId,
      profile: {
        migrationSource: "browser_local_storage",
      },
    });
  } catch (error) {
    if (
      error instanceof CloudMigrationStorageError &&
      error.code === "23503"
    ) {
      throw new CloudMigrationConfigurationError(
        "TRAINVAULT_ATHLETE_ID must be the UUID of an existing Supabase Auth user.",
      );
    }
    throw error;
  }

  const claim = migrationRecord(athleteId, input, rows, now);
  await repository.claimMigration(claim);
  const existing = await repository.getMigration(
    athleteId,
    CLOUD_MIGRATION_KEY,
  );

  if (!existing) {
    throw new CloudMigrationStorageError("migration_claim_read");
  }

  if (existing.source_fingerprint !== rows.fingerprint) {
    throw new CloudMigrationConflictError();
  }

  if (existing.status === "completed") {
    return {
      alreadyMigrated: true,
      summary,
      fingerprint: rows.fingerprint,
    };
  }

  const inProgress: DataMigrationRecord = {
    ...claim,
    started_at: existing.started_at ?? now,
    checkpoint: {
      phase: "writing",
      browserDataDeleted: false,
    },
  };
  await repository.updateMigration(inProgress);

  let stage: CloudMigrationTable | "complete" = "training_plans";
  try {
    await repository.upsertRows("training_plans", rows.plans);
    stage = "sessions";
    await repository.upsertRows("sessions", rows.sessions);
    stage = "session_blocks";
    await repository.upsertRows("session_blocks", rows.blocks);
    stage = "session_variants";
    await repository.upsertRows("session_variants", rows.variants);
    stage = "session_logs";
    await repository.upsertRows("session_logs", rows.logs);
    stage = "complete";

    await repository.updateMigration({
      ...inProgress,
      status: "completed",
      records_imported: totalImported(summary),
      checkpoint: {
        phase: "complete",
        browserDataDeleted: false,
        selectedTodayWorkoutId:
          input.snapshot.selectedTodayWorkoutId,
      },
      summary,
      completed_at: (options.now ?? (() => new Date()))().toISOString(),
    });
  } catch (error) {
    try {
      await repository.updateMigration({
        ...inProgress,
        status: "failed",
        records_failed: 1,
        checkpoint: {
          phase: stage,
          browserDataDeleted: false,
          retrySameSnapshot: true,
        },
        failure_details: [
          {
            stage,
            code: "storage_write_failed",
          },
        ],
      });
    } catch {
      // A failed status write must not hide the original failure. Every data
      // row uses a deterministic ID, so retrying the same snapshot is safe.
    }
    throw error;
  }

  return {
    alreadyMigrated: false,
    summary,
    fingerprint: rows.fingerprint,
  };
}

function storageError(stage: string, error: { code?: string } | null) {
  if (error) {
    throw new CloudMigrationStorageError(stage, error.code);
  }
}

export function createSupabaseCloudMigrationRepository(
  client: SupabaseClient,
): CloudMigrationRepository {
  return {
    async upsertAthlete(row) {
      const { error } = await client
        .from("athletes")
        .upsert(row, {
          ignoreDuplicates: true,
          onConflict: "id",
        });
      storageError("athlete", error);
    },

    async claimMigration(row) {
      const { error } = await client
        .from("data_migrations")
        .upsert(row, {
          ignoreDuplicates: true,
          onConflict: "id",
        });
      storageError("migration_claim", error);
    },

    async getMigration(athleteId, migrationKey) {
      const { data, error } = await client
        .from("data_migrations")
        .select(
          "id,athlete_id,migration_key,source_kind,source_version,source_fingerprint,status,records_discovered,records_imported,records_skipped,records_failed,checkpoint,summary,failure_details,started_at,completed_at",
        )
        .eq("athlete_id", athleteId)
        .eq("migration_key", migrationKey)
        .maybeSingle();
      storageError("migration_read", error);
      return (data as DataMigrationRecord | null) ?? null;
    },

    async updateMigration(row) {
      const { error } = await client
        .from("data_migrations")
        .upsert(row, { onConflict: "id" });
      storageError("migration_status", error);
    },

    async upsertRows(table, rows) {
      for (let offset = 0; offset < rows.length; offset += UPSERT_BATCH_SIZE) {
        const batch = rows.slice(offset, offset + UPSERT_BATCH_SIZE);
        const { error } = await client
          .from(table)
          .upsert(batch, { onConflict: "id" });
        storageError(table, error);
      }
    },
  };
}
