import type {
  BlockResult,
  BlockStatus,
  Programme,
  ProgrammeDay,
  ProgrammeGuideItem,
  ProgrammeWeek,
  SessionLog,
  Workout,
  WorkoutBlock,
  WorkoutBlockType,
  WorkoutCategory,
  WorkoutIntensity,
  WorkoutOverride,
  WorkoutPriority,
} from "./types";
import { normalizeLimiter } from "./session-log";

export type ImportKind = "programme" | "backup" | "unknown";

const workoutCategories: WorkoutCategory[] = [
  "strength",
  "conditioning",
  "track",
  "gymnastics",
  "hybrid",
  "recovery",
];
const workoutIntensities: WorkoutIntensity[] = ["easy", "moderate", "hard"];
const workoutPriorities: WorkoutPriority[] = ["Low", "Medium", "High", "Recovery", "Target", "Primer", "Optional"];
const blockTypes: WorkoutBlockType[] = [
  "warmup",
  "strength",
  "skill",
  "conditioning",
  "intervals",
  "accessory",
  "cooldown",
];
const blockStatuses: BlockStatus[] = ["todo", "done", "skipped"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }

  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function asStringPreservingBlank(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return asString(value);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function splitText(value: string) {
  return value
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }

        if (typeof item === "number" && Number.isFinite(item)) {
          return String(item);
        }

        if (isRecord(item)) {
          return asString(getField(item, ["text", "title", "name", "value", "description"]));
        }

        return undefined;
      })
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value === "string") {
    return splitText(value);
  }

  return [];
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "imported"
  );
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function unwrapData(value: unknown): unknown {
  if (isRecord(value) && isRecord(value.data)) {
    return value.data;
  }

  return value;
}

function getProgrammeCandidate(value: unknown): unknown {
  const unwrapped = unwrapData(value);

  if (isRecord(unwrapped) && isRecord(unwrapped.programme)) {
    return unwrapped.programme;
  }

  return unwrapped;
}

function normalizeCategory(value: unknown, fallbackSignal = ""): WorkoutCategory {
  const raw = `${asString(value) ?? ""} ${fallbackSignal}`.toLowerCase();

  if (workoutCategories.includes(raw.trim() as WorkoutCategory)) {
    return raw.trim() as WorkoutCategory;
  }

  if (raw.includes("rest") || raw.includes("recovery") || raw.includes("reload")) {
    return "recovery";
  }

  if (
    raw.includes("murph") ||
    raw.includes("comp sim") ||
    raw.includes("competition") ||
    raw.includes("hybrid") ||
    raw.includes("mixed")
  ) {
    return "hybrid";
  }

  if (raw.includes("run") || raw.includes("track") || raw.includes("interval") || raw.includes("5k")) {
    return "track";
  }

  if (
    raw.includes("skill") ||
    raw.includes("gymnastics") ||
    raw.includes("handstand") ||
    raw.includes("muscle-up") ||
    raw.includes("muscle up") ||
    raw.includes("rings")
  ) {
    return "gymnastics";
  }

  if (
    raw.includes("oly") ||
    raw.includes("strength") ||
    raw.includes("barbell") ||
    raw.includes("squat") ||
    raw.includes("deadlift") ||
    raw.includes("press")
  ) {
    return "strength";
  }

  if (raw.includes("conditioning") || raw.includes("metcon") || raw.includes("engine")) {
    return "conditioning";
  }

  return "conditioning";
}

function normalizeIntensity(value: unknown, priority: WorkoutPriority | undefined, category: WorkoutCategory): WorkoutIntensity {
  const raw = `${asString(value) ?? ""} ${priority ?? ""}`.toLowerCase();

  if (workoutIntensities.includes(raw.trim() as WorkoutIntensity)) {
    return raw.trim() as WorkoutIntensity;
  }

  if (raw.includes("easy") || raw.includes("recovery") || raw.includes("rest") || raw.includes("low")) {
    return "easy";
  }

  if (raw.includes("hard") || raw.includes("high") || raw.includes("target") || raw.includes("primer")) {
    return "hard";
  }

  if (raw.includes("moderate") || raw.includes("medium")) {
    return "moderate";
  }

  return category === "recovery" ? "easy" : "moderate";
}

function normalizePriority(value: unknown): WorkoutPriority | undefined {
  const raw = asString(value);

  if (!raw) {
    return undefined;
  }

  const direct = workoutPriorities.find((priority) => priority.toLowerCase() === raw.toLowerCase());

  if (direct) {
    return direct;
  }

  const normalized = raw.toLowerCase();

  if (normalized.includes("target")) return "Target";
  if (normalized.includes("primer")) return "Primer";
  if (normalized.includes("optional")) return "Optional";
  if (normalized.includes("recovery") || normalized.includes("rest")) return "Recovery";
  if (normalized.includes("high") || normalized.includes("hard")) return "High";
  if (normalized.includes("medium") || normalized.includes("moderate")) return "Medium";
  if (normalized.includes("low") || normalized.includes("easy")) return "Low";

  return undefined;
}

function normalizeBlockType(value: unknown): WorkoutBlockType {
  const raw = asString(value)?.toLowerCase() ?? "";

  if (blockTypes.includes(raw as WorkoutBlockType)) {
    return raw as WorkoutBlockType;
  }

  if (raw.includes("warm")) return "warmup";
  if (raw.includes("cool") || raw.includes("downshift")) return "cooldown";
  if (raw.includes("interval")) return "intervals";
  if (raw.includes("strength") || raw.includes("lift") || raw.includes("barbell")) return "strength";
  if (raw.includes("skill") || raw.includes("handstand") || raw.includes("gymnastics")) return "skill";
  if (raw.includes("accessory") || raw.includes("armor")) return "accessory";

  return "conditioning";
}

function normalizeBlock(value: unknown, index: number, forcedType?: WorkoutBlockType, forcedName?: string): WorkoutBlock | null {
  if (typeof value === "string") {
    const type = forcedType ?? normalizeBlockType(forcedName);

    return {
      name: forcedName ?? titleCase(type),
      type,
      items: splitText(value),
    };
  }

  if (Array.isArray(value)) {
    const type = forcedType ?? normalizeBlockType(forcedName);

    return {
      name: forcedName ?? titleCase(type),
      type,
      items: asStringArray(value),
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const type = forcedType ?? normalizeBlockType(getField(value, ["type", "blockType", "block_type", "name", "title"]));
  const name = asString(getField(value, ["name", "title", "block", "section"])) ?? forcedName ?? titleCase(type);
  const items = [
    ...asStringArray(getField(value, ["items", "steps", "work", "prescription", "details", "description"])),
    ...asStringArray(getField(value, ["notes", "cues"])),
  ];

  return {
    name,
    type,
    durationMinutes: asNumber(getField(value, ["durationMinutes", "duration_minutes", "minutes", "duration"])),
    items,
  };
}

function normalizeBlocks(workout: Record<string, unknown>): WorkoutBlock[] {
  const directBlocks = getField(workout, ["blocks", "sections", "parts"]);

  if (Array.isArray(directBlocks)) {
    return directBlocks
      .map((block, index) => normalizeBlock(block, index))
      .filter((block): block is WorkoutBlock => Boolean(block));
  }

  const namedBlockFields: Array<[string, WorkoutBlockType, string]> = [
    ["warmup", "warmup", "Warmup"],
    ["warmUp", "warmup", "Warmup"],
    ["prep", "warmup", "Prep"],
    ["strength", "strength", "Strength"],
    ["skill", "skill", "Skill"],
    ["conditioning", "conditioning", "Conditioning"],
    ["intervals", "intervals", "Intervals"],
    ["accessory", "accessory", "Accessory"],
    ["cooldown", "cooldown", "Cooldown"],
    ["coolDown", "cooldown", "Cooldown"],
  ];

  return namedBlockFields
    .map(([field, type, name], index) => {
      const value = workout[field];
      return typeof value === "undefined" || value === null ? null : normalizeBlock(value, index, type, name);
    })
    .filter((block): block is WorkoutBlock => Boolean(block));
}

function normalizeWorkout(value: unknown, fallbackId: string, fallbackLabel: string, fallbackDate?: string): Workout | null {
  if (!isRecord(value)) {
    return null;
  }

  const title =
    asString(getField(value, ["title", "name", "session", "sessionName", "session_name", "workoutTitle"])) ??
    fallbackLabel;
  const sessionType = asString(getField(value, ["sessionType", "session_type", "type", "categoryLabel"]));
  const category = normalizeCategory(getField(value, ["category", "workoutCategory", "workout_category"]), `${title} ${sessionType ?? ""}`);
  const priority = normalizePriority(getField(value, ["priority", "sessionPriority", "session_priority"]));
  const blocks = normalizeBlocks(value);
  const blockMinutes = blocks.reduce((total, block) => total + (block.durationMinutes ?? 0), 0);
  const durationMinutes =
    asNumber(
      getField(value, [
        "durationMinutes",
        "duration_minutes",
        "fullSessionMinutes",
        "full_session_min",
        "full_session_minutes",
        "duration",
        "durationMin",
        "duration_min",
        "minutes",
      ]),
    ) ??
    blockMinutes ??
    0;
  const sourceSessionId = asString(getField(value, ["sourceSessionId", "source_session_id", "sessionId", "session_id"]));
  const id = asString(getField(value, ["id", "workoutId", "workout_id"])) ?? sourceSessionId ?? `${fallbackId}-${slugify(title)}`;
  const focus = asStringArray(getField(value, ["focus", "focusTags", "focus_tags", "tags", "trainingFocus", "training_focus"]));
  const equipment = asStringArray(getField(value, ["equipment", "kit", "gear"]));

  return {
    id,
    title,
    category,
    durationMinutes,
    intensity: normalizeIntensity(getField(value, ["intensity", "effort", "difficulty"]), priority, category),
    sessionType,
    phase: asString(getField(value, ["phase", "trainingPhase", "training_phase", "block"])),
    priority,
    date: asString(getField(value, ["date", "sessionDate", "session_date"])) ?? fallbackDate,
    day: asString(getField(value, ["day", "dayName", "day_name"])),
    minimumMinutes: asNumber(
      getField(value, [
        "minimumMinutes",
        "minimum_minutes",
        "minimumViableMin",
        "minimum_viable_min",
        "minimum_viable_minutes",
        "minimumSessionMinutes",
        "minimum_session_minutes",
      ]),
    ),
    prescribedLoadsOrPace: asString(
      getField(value, [
        "prescribedLoadsOrPace",
        "prescribed_loads_or_pace",
        "loadsOrPace",
        "loads_or_pace",
        "pace",
        "loads",
      ]),
    ),
    targetStimulus: asString(getField(value, ["targetStimulus", "target_stimulus", "stimulus", "intent"])),
    scalingNotes: asString(
      getField(value, ["scalingNotes", "scaling_notes", "minimumVersion", "minimum_version", "scale", "scaling"]),
    ),
    sourceSessionId,
    focus,
    equipment,
    blocks,
    coachNotes: asString(getField(value, ["coachNotes", "coach_notes", "notes", "coachNote"])),
    substitutions: asStringArray(getField(value, ["substitutions", "subs", "scales"])),
    alternatives: asStringArray(getField(value, ["alternatives", "alternativeOptions", "alternative_options"])),
  };
}

function parseDayNumber(value: unknown, fallback: number) {
  const direct = asNumber(value);

  if (direct) {
    return direct;
  }

  const raw = asString(value)?.toLowerCase();

  switch (raw) {
    case "monday":
    case "mon":
      return 1;
    case "tuesday":
    case "tue":
    case "tues":
      return 2;
    case "wednesday":
    case "wed":
      return 3;
    case "thursday":
    case "thu":
    case "thur":
    case "thurs":
      return 4;
    case "friday":
    case "fri":
      return 5;
    case "saturday":
    case "sat":
      return 6;
    case "sunday":
    case "sun":
      return 7;
    default:
      return fallback;
  }
}

function getWeekEntries(week: Record<string, unknown>): { entries: unknown[]; source: "days" | "sessions" | "workouts" | "none" } {
  const days = week.days;

  if (Array.isArray(days)) {
    return { entries: days, source: "days" };
  }

  const sessions = week.sessions;

  if (Array.isArray(sessions)) {
    return { entries: sessions, source: "sessions" };
  }

  const workouts = week.workouts;

  if (Array.isArray(workouts)) {
    return { entries: workouts, source: "workouts" };
  }

  return { entries: [], source: "none" };
}

function normalizeProgrammeDay(value: unknown, weekId: string, weekNumber: number, index: number, source: string): ProgrammeDay | null {
  const fallbackDayNumber = index + 1;
  const record = isRecord(value) ? value : null;
  const workoutValue =
    source === "workouts"
      ? value
      : record
        ? (getField(record, ["workout", "session", "trainingSession"]) ?? value)
        : value;
  const daySource = record ? getField(record, ["dayNumber", "day_number", "dayIndex", "day_index", "day", "label"]) : undefined;
  const dayNumber = parseDayNumber(daySource, fallbackDayNumber);
  const label =
    (record ? asString(getField(record, ["label", "day", "dayName", "day_name", "date"])) : undefined) ??
    `Day ${dayNumber}`;
  const date = record ? asString(getField(record, ["date", "sessionDate", "session_date"])) : undefined;
  const workout = normalizeWorkout(workoutValue, `${weekId}-day-${index + 1}`, label, date);

  if (!workout) {
    return null;
  }

  if (!workout.day) {
    workout.day = label;
  }

  return {
    id: (record ? asString(getField(record, ["id", "dayId", "day_id"])) : undefined) ?? `${weekId}-day-${index + 1}`,
    dayNumber,
    label,
    workout,
  };
}

function normalizeWeek(value: unknown, index: number): ProgrammeWeek | null {
  if (!isRecord(value)) {
    return null;
  }

  const weekNumber = asNumber(getField(value, ["weekNumber", "week_number", "number", "week"])) ?? index + 1;
  const id = asString(getField(value, ["id", "weekId", "week_id"])) ?? `week-${weekNumber}`;
  const title =
    asString(getField(value, ["title", "name", "phase", "label"])) ??
    `Week ${weekNumber}`;
  const { entries, source } = getWeekEntries(value);

  return {
    id,
    weekNumber,
    title,
    days: entries
      .map((entry, entryIndex) => normalizeProgrammeDay(entry, id, weekNumber, entryIndex, source))
      .filter((day): day is ProgrammeDay => Boolean(day)),
  };
}

function normalizeTrainingSettings(value: unknown): Record<string, string | number> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number",
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeGuideItems(value: unknown): ProgrammeGuideItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const guide = value.reduce<ProgrammeGuideItem[]>((items, item) => {
      if (typeof item === "string") {
        items.push({ title: item });
        return items;
      }

      if (!isRecord(item)) {
        return items;
      }

      items.push({
        title: asString(item.title),
        name: asString(item.name),
        level: asString(item.level),
        description: asString(item.description),
        details: asString(item.details),
        note: asString(item.note),
        items: asStringArray(item.items),
        drills: asStringArray(item.drills),
        cues: asStringArray(item.cues),
      });

      return items;
    }, []);

  return guide.length > 0 ? guide : undefined;
}

function normalizeBlockStatus(value: unknown): BlockStatus | undefined {
  const status = asString(value)?.toLowerCase();

  if (blockStatuses.includes(status as BlockStatus)) {
    return status as BlockStatus;
  }

  return undefined;
}

function normalizeBlockResult(value: unknown, index: number): BlockResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const blockKey = asString(getField(value, ["blockKey", "block_key", "key", "id"])) ?? `block-${index + 1}`;
  const blockName = asString(getField(value, ["blockName", "block_name", "name", "title"])) ?? `Block ${index + 1}`;

  return {
    blockKey,
    blockName,
    blockType: asString(getField(value, ["blockType", "block_type", "type"])),
    blockItems: asStringArray(getField(value, ["blockItems", "block_items", "items"])),
    status: normalizeBlockStatus(value.status),
    result: asString(value.result),
    load: asString(value.load),
    reps: asString(value.reps),
    time: asString(value.time),
    calories: asString(value.calories),
    distance: asString(value.distance),
    notes: asString(getField(value, ["notes", "note"])),
  };
}

function normalizeSessionLog(value: unknown, index: number): SessionLog | null {
  if (!isRecord(value)) {
    return null;
  }

  const workoutId = asString(getField(value, ["workoutId", "workout_id", "sessionId", "session_id"]));
  const workoutTitle = asString(getField(value, ["workoutTitle", "workout_title", "sessionTitle", "title", "name"]));
  const completedAt = asString(getField(value, ["completedAt", "completed_at", "date", "loggedAt", "logged_at"]));
  const rpe = asNumber(getField(value, ["rpe", "RPE", "effort"]));

  if (!workoutId || !workoutTitle || !completedAt || !rpe) {
    return null;
  }

  const categoryValue = getField(value, ["workoutCategory", "workout_category", "category"]);
  const blockResultsSource = value.blockResults ?? value.block_results;
  const blockResults = Array.isArray(blockResultsSource)
    ? blockResultsSource
        .map((blockResult, blockIndex) => normalizeBlockResult(blockResult, blockIndex))
        .filter((blockResult): blockResult is BlockResult => Boolean(blockResult))
    : undefined;

  return {
    id: asString(value.id) ?? `${workoutId}-${completedAt}-${index}`,
    workoutId,
    workoutTitle,
    workoutCategory: categoryValue ? normalizeCategory(categoryValue) : undefined,
    workoutSessionType: asString(getField(value, ["workoutSessionType", "workout_session_type", "sessionType", "session_type"])),
    workoutDate: asString(getField(value, ["workoutDate", "workout_date", "sessionDate", "session_date"])),
    workoutModified: typeof value.workoutModified === "boolean" ? value.workoutModified : undefined,
    completedAt,
    rpe,
    actualDurationMinutes: asNumber(getField(value, ["actualDurationMinutes", "actual_duration_minutes", "actualMinutes"])),
    score: asString(getField(value, ["score", "result"])),
    limiter: normalizeLimiter(asString(getField(value, ["limiter", "limitingFactor", "limiting_factor"]))),
    result: asString(getField(value, ["result", "score"])),
    notes: asString(getField(value, ["notes", "note"])),
    blockResults,
  };
}

function normalizeWorkoutOverride(value: unknown): WorkoutOverride | null {
  if (!isRecord(value)) {
    return null;
  }

  const workoutId = asString(getField(value, ["workoutId", "workout_id", "id"]));

  if (!workoutId) {
    return null;
  }

  const blocksSource = value.blocks;
  const blocks = Array.isArray(blocksSource)
    ? blocksSource
        .map((block, index) => normalizeBlock(block, index))
        .filter((block): block is WorkoutBlock => Boolean(block))
    : undefined;
  const intensity = normalizeIntensity(value.intensity, undefined, "conditioning");

  return {
    workoutId,
    date: asString(value.date),
    title: asString(value.title),
    durationMinutes: asNumber(value.durationMinutes),
    minimumMinutes: asNumber(value.minimumMinutes),
    intensity: value.intensity ? intensity : undefined,
    focus: Array.isArray(value.focus) || typeof value.focus === "string" ? asStringArray(value.focus) : undefined,
    equipment:
      Array.isArray(value.equipment) || typeof value.equipment === "string" ? asStringArray(value.equipment) : undefined,
    blocks,
    prescribedLoadsOrPace: Object.prototype.hasOwnProperty.call(value, "prescribedLoadsOrPace")
      ? asStringPreservingBlank(value.prescribedLoadsOrPace)
      : undefined,
    targetStimulus: Object.prototype.hasOwnProperty.call(value, "targetStimulus")
      ? asStringPreservingBlank(value.targetStimulus)
      : undefined,
    scalingNotes: Object.prototype.hasOwnProperty.call(value, "scalingNotes")
      ? asStringPreservingBlank(value.scalingNotes)
      : undefined,
    modificationReason: asString(value.modificationReason),
    updatedAt: asString(value.updatedAt) ?? new Date().toISOString(),
  };
}

export function detectImportKind(value: unknown): ImportKind {
  const unwrapped = unwrapData(value);

  if (isRecord(unwrapped) && isRecord(unwrapped.programme) && Array.isArray(unwrapped.programme.weeks)) {
    return "backup";
  }

  if (isRecord(unwrapped) && Array.isArray(unwrapped.weeks)) {
    return "programme";
  }

  return "unknown";
}

export function normalizeImportedProgramme(value: unknown): Programme | null {
  const candidate = getProgrammeCandidate(value);

  if (!isRecord(candidate) || !Array.isArray(candidate.weeks)) {
    return null;
  }

  const name = asString(getField(candidate, ["name", "title", "programmeName", "programme_name"])) ?? "Imported Programme";
  const weeks = candidate.weeks
    .map((week, index) => normalizeWeek(week, index))
    .filter((week): week is ProgrammeWeek => Boolean(week));

  return {
    id: asString(candidate.id) ?? slugify(name),
    name,
    description: asString(candidate.description) ?? "",
    durationWeeks:
      asNumber(getField(candidate, ["durationWeeks", "duration_weeks", "weeksCount", "weeks_count"])) ??
      weeks.length,
    startDate: asNullableString(getField(candidate, ["startDate", "start_date"])),
    targetEvent: asString(getField(candidate, ["targetEvent", "target_event"])),
    targetDate: asString(getField(candidate, ["targetDate", "target_date"])),
    checkpointName: asString(getField(candidate, ["checkpointName", "checkpoint_name"])),
    checkpointDate: asString(getField(candidate, ["checkpointDate", "checkpoint_date"])),
    trainingSettings: normalizeTrainingSettings(getField(candidate, ["trainingSettings", "training_settings"])),
    handstandGuide: normalizeGuideItems(getField(candidate, ["handstandGuide", "handstand_guide"])),
    weeks,
  };
}

export function normalizeImportedBackup(
  value: unknown,
): { programme: Programme; logs: SessionLog[]; workoutOverrides: Record<string, WorkoutOverride> } | null {
  const unwrapped = unwrapData(value);

  if (!isRecord(unwrapped) || !isRecord(unwrapped.programme)) {
    return null;
  }

  const programme = normalizeImportedProgramme(unwrapped.programme);

  if (!programme) {
    return null;
  }

  const logsSource = getField(unwrapped, ["logs", "sessionLogs", "session_logs"]);
  const logs = Array.isArray(logsSource)
    ? logsSource
        .map((log, index) => normalizeSessionLog(log, index))
        .filter((log): log is SessionLog => Boolean(log))
    : [];
  const overridesSource = getField(unwrapped, ["workoutOverrides", "workout_overrides", "overrides"]);
  const workoutOverrides = isRecord(overridesSource)
    ? Object.fromEntries(
        Object.values(overridesSource)
          .map((override) => normalizeWorkoutOverride(override))
          .filter((override): override is WorkoutOverride => Boolean(override))
          .map((override) => [override.workoutId, override] as const),
      )
    : {};

  return {
    programme,
    logs,
    workoutOverrides,
  };
}

export function validateProgrammeShape(programme: Programme): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!programme.name.trim()) {
    errors.push("Programme name is missing.");
  }

  if (!Array.isArray(programme.weeks) || programme.weeks.length === 0) {
    errors.push("Found a programme, but no weeks array was detected.");
  }

  let workoutCount = 0;

  programme.weeks.forEach((week, weekIndex) => {
    if (!Array.isArray(week.days) || week.days.length === 0) {
      errors.push(`Found a programme, but Week ${week.weekNumber || weekIndex + 1} has no days/sessions/workouts.`);
      return;
    }

    week.days.forEach((day) => {
      const workout = day.workout;
      workoutCount += 1;

      if (!workout.id) {
        errors.push(`Week ${week.weekNumber}, ${day.label}: workout id is missing.`);
      }

      if (!workout.title) {
        errors.push(`Week ${week.weekNumber}, ${day.label}: workout title is missing.`);
      }

      if (!workoutCategories.includes(workout.category)) {
        errors.push(`Week ${week.weekNumber}, ${day.label}: workout category is not supported.`);
      }

      if (!workoutIntensities.includes(workout.intensity)) {
        errors.push(`Week ${week.weekNumber}, ${day.label}: workout intensity is not supported.`);
      }

      if (!Number.isFinite(workout.durationMinutes) || workout.durationMinutes <= 0) {
        warnings.push(`Week ${week.weekNumber}, ${day.label}: duration is missing or zero.`);
      }

      if (workout.minimumMinutes && workout.minimumMinutes > workout.durationMinutes && workout.durationMinutes > 0) {
        warnings.push(`Week ${week.weekNumber}, ${day.label}: minimum duration is longer than full duration.`);
      }

      if (!Array.isArray(workout.blocks) || workout.blocks.length === 0) {
        warnings.push(`Week ${week.weekNumber}, ${day.label}: no workout blocks were supplied.`);
      }
    });
  });

  if (workoutCount === 0) {
    errors.push("No workouts were found in the programme.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
