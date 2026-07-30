import { createHash } from "node:crypto";

export type TrainVaultCloudSnapshot = {
  version: 1;
  exportedAt: string;
  entries: Record<string, string>;
};

export type CanonicalV3Entity = {
  entity_type: string;
  entity_id: string;
  effective_date: string | null;
  source_key: string;
  data: unknown;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CANONICAL_ENTITIES = 5_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanId(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, 240) : null;
}

function dateOnly(value: unknown) {
  if (typeof value !== "string") return null;
  if (DATE_PATTERN.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseStoredJson(entries: Record<string, string>, key: string): unknown {
  const raw = entries[key];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function parseTrainVaultCloudSnapshot(value: unknown): TrainVaultCloudSnapshot | null {
  if (!isObject(value) || value.version !== 1 || typeof value.exportedAt !== "string") {
    return null;
  }
  if (!isObject(value.entries)) return null;

  const entries: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value.entries)) {
    if (typeof raw !== "string" || (!key.startsWith("trainvault_") && key !== "selectedTodayWorkoutId")) {
      continue;
    }
    entries[key] = raw;
  }

  return { version: 1, exportedAt: value.exportedAt, entries };
}

export function fingerprintTrainVaultSnapshot(snapshot: TrainVaultCloudSnapshot) {
  const stableEntries = Object.entries(snapshot.entries).sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256")
    .update(JSON.stringify({ version: snapshot.version, entries: stableEntries }))
    .digest("hex");
}

export function projectTrainVaultSnapshot(snapshot: TrainVaultCloudSnapshot) {
  const entities = new Map<string, CanonicalV3Entity>();

  function add(
    entityType: string,
    entityId: unknown,
    effectiveDate: unknown,
    sourceKey: string,
    data: unknown,
  ) {
    const id = cleanId(entityId);
    if (!id) return;
    const entity: CanonicalV3Entity = {
      entity_type: entityType,
      entity_id: id,
      effective_date: dateOnly(effectiveDate),
      source_key: sourceKey,
      data,
    };
    entities.set(`${entityType}\u0000${id}`, entity);
    if (entities.size > MAX_CANONICAL_ENTITIES) {
      throw new Error("TrainVault canonical projection exceeded the safe entity limit.");
    }
  }

  const manualSessionsKey = "trainvault_manual_sessions_v1";
  const manualSessions = parseStoredJson(snapshot.entries, manualSessionsKey);
  if (Array.isArray(manualSessions)) {
    manualSessions.forEach((session) => {
      if (!isObject(session)) return;
      add("session", session.id, session.scheduledDate, manualSessionsKey, session);
    });
  }

  const sessionLogsKey = "trainvault_session_logs";
  const sessionLogs = parseStoredJson(snapshot.entries, sessionLogsKey);
  if (Array.isArray(sessionLogs)) {
    sessionLogs.forEach((log) => {
      if (!isObject(log)) return;
      add("session_log", log.id, log.completedAt, sessionLogsKey, log);
    });
  }

  const recoveryKey = "trainvault_recovery_records_v1";
  const recoveryRecords = parseStoredJson(snapshot.entries, recoveryKey);
  if (Array.isArray(recoveryRecords)) {
    recoveryRecords.forEach((record) => {
      if (!isObject(record)) return;
      add("recovery", record.date, record.date, recoveryKey, record);
    });
  }

  const structuredKey = "trainvault_structured_running_workouts_v1";
  const structuredRuns = parseStoredJson(snapshot.entries, structuredKey);
  if (isObject(structuredRuns)) {
    Object.entries(structuredRuns).forEach(([fallbackId, workout]) => {
      if (!isObject(workout)) return;
      add("structured_run", workout.id ?? fallbackId, workout.date, structuredKey, workout);
    });
  }

  const garminKey = "trainvault_garmin_v1";
  const garmin = parseStoredJson(snapshot.entries, garminKey);
  if (isObject(garmin)) {
    if (Array.isArray(garmin.activities)) {
      garmin.activities.forEach((record) => {
        if (!isObject(record) || !isObject(record.activity)) return;
        const activity = record.activity;
        add(
          "garmin_activity",
          activity.activityId,
          activity.localStartTime ?? activity.startTime,
          garminKey,
          record,
        );
      });
    }
    if (isObject(garmin.workoutSync)) {
      Object.entries(garmin.workoutSync).forEach(([fallbackId, record]) => {
        if (!isObject(record)) return;
        add(
          "garmin_workout_sync",
          record.sessionId ?? fallbackId,
          record.scheduledDate,
          garminKey,
          record,
        );
      });
    }
  }

  const recordsKey = "trainvault_athlete_records_v1";
  const records = parseStoredJson(snapshot.entries, recordsKey);
  if (isObject(records)) {
    if (Array.isArray(records.events)) {
      records.events.forEach((event) => {
        if (!isObject(event)) return;
        add("event", event.id, event.date, recordsKey, event);
      });
    }
    if (Array.isArray(records.personalRecords)) {
      records.personalRecords.forEach((record) => {
        if (!isObject(record)) return;
        add("personal_record", record.id, record.date, recordsKey, record);
      });
    }
  }

  const programmeKey = "trainvault_active_programme";
  const programme = parseStoredJson(snapshot.entries, programmeKey);
  if (isObject(programme) && Array.isArray(programme.weeks)) {
    programme.weeks.forEach((week) => {
      if (!isObject(week) || !Array.isArray(week.days)) return;
      week.days.forEach((day) => {
        if (!isObject(day) || !isObject(day.workout)) return;
        const workout = day.workout;
        add(
          "session",
          workout.id,
          workout.date,
          programmeKey,
          {
            source: "programme",
            programmeId: programme.id ?? null,
            weekId: week.id ?? null,
            weekNumber: week.weekNumber ?? null,
            dayId: day.id ?? null,
            dayNumber: day.dayNumber ?? null,
            workout,
          },
        );
      });
    });
  }

  const overridesKey = "trainvault_workout_overrides";
  const overrides = parseStoredJson(snapshot.entries, overridesKey);
  if (isObject(overrides)) {
    Object.entries(overrides).forEach(([fallbackId, override]) => {
      if (!isObject(override)) return;
      add("workout_override", override.workoutId ?? fallbackId, override.date, overridesKey, override);
    });
  }

  const lifecycleKey = "trainvault_session_lifecycle_v1";
  const lifecycle = parseStoredJson(snapshot.entries, lifecycleKey);
  if (isObject(lifecycle)) {
    Object.entries(lifecycle).forEach(([sessionId, record]) => {
      if (!isObject(record)) return;
      add("session_lifecycle", sessionId, record.updatedAt, lifecycleKey, record);
    });
  }

  return Array.from(entities.values()).sort((a, b) => {
    const typeCompare = a.entity_type.localeCompare(b.entity_type);
    return typeCompare !== 0 ? typeCompare : a.entity_id.localeCompare(b.entity_id);
  });
}
