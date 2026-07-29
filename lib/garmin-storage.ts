"use client";

import { useSyncExternalStore } from "react";
import type {
  ActivityMatchResult,
  GarminActivity,
  GarminSyncState,
  PlannedRunningSession,
} from "@/lib/garmin";

const GARMIN_STORAGE_KEY = "trainvault_garmin_v1";
const GARMIN_STORAGE_EVENT = "trainvault:garmin-change";
const MAX_STORED_ACTIVITIES = 250;

export type GarminActivityLap = {
  lapIndex: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  averagePaceSecondsPerKm: number | null;
  averageHeartRateBpm: number | null;
};

export type NormalizedGarminActivity = GarminActivity & {
  laps: GarminActivityLap[] | null;
};

export type GarminWorkoutSyncRecord = {
  sessionId: string;
  state: GarminSyncState;
  scheduledDate: string;
  garminWorkoutId: string | null;
  workoutScheduleId: string | null;
  deviceId: string | null;
  failedStage?: "upload" | "schedule" | "push";
  error?: string;
  updatedAt: string;
};

export type GarminActivityLink = {
  activityId: string;
  sessionId: string;
  method: "automatic" | "manual";
  linkedAt: string;
};

export type GarminActivitySyncApiRecord = {
  activity: NormalizedGarminActivity;
  match: ActivityMatchResult;
  isNew?: boolean;
};

export type GarminStoredActivity = GarminActivitySyncApiRecord & {
  importedAt: string;
};

export type GarminLocalState = {
  version: 1;
  workoutSync: Record<string, GarminWorkoutSyncRecord>;
  activities: GarminStoredActivity[];
  activityLinks: Record<string, GarminActivityLink>;
  rejectedMatches: Record<string, string[]>;
  lastSyncedAt: string | null;
  nextActivityStart: number;
  lastSourceReturned: number;
};

export type GarminPlannedSession = PlannedRunningSession & {
  plannedPaceSecondsPerKm?: number | null;
  plannedHeartRateRange?: [number, number] | null;
  plannedElevationMeters?: number | null;
  plannedIntervalCount?: number | null;
};

export type GarminPlannedVsActual = {
  adherence: "unknown" | "partial" | "on_target" | "over";
  durationDeltaMinutes: number | null;
  durationDeltaPercent: number | null;
  distanceDeltaMeters: number | null;
  distanceDeltaPercent: number | null;
  paceDeltaSecondsPerKm: number | null;
  averageHeartRateBpm: number | null;
  heartRateAssessment: string | null;
  elevationDeltaMeters: number | null;
  recordedLapCount: number | null;
  plannedIntervalCount: number | null;
  observations: string[];
};

export type GarminPostRunCoachInsight = {
  title: string;
  body: string;
  confidence: string;
};

const EMPTY_STATE: GarminLocalState = {
  version: 1,
  workoutSync: {},
  activities: [],
  activityLinks: {},
  rejectedMatches: {},
  lastSyncedAt: null,
  nextActivityStart: 0,
  lastSourceReturned: 0,
};

let cachedRaw: string | null | undefined;
let cachedState: GarminLocalState = EMPTY_STATE;

function canUseStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRejectedMatches(value: unknown) {
  if (!isObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_STORED_ACTIVITIES)
      .flatMap(([activityId, sessionIds]) => {
        if (!activityId || !Array.isArray(sessionIds)) {
          return [];
        }

        const validSessionIds = Array.from(
          new Set(
            sessionIds
              .filter(
                (sessionId): sessionId is string =>
                  typeof sessionId === "string" && Boolean(sessionId),
              )
              .slice(0, 100),
          ),
        );

        return validSessionIds.length > 0
          ? [[activityId, validSessionIds] as const]
          : [];
      }),
  );
}

function parseState(raw: string | null): GarminLocalState {
  if (!raw) {
    return EMPTY_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isObject(parsed) || parsed.version !== 1) {
      return EMPTY_STATE;
    }

    const activities = Array.isArray(parsed.activities)
      ? parsed.activities.filter((record): record is GarminStoredActivity => {
          if (!isObject(record) || !isObject(record.activity)) {
            return false;
          }

          return typeof record.activity.activityId === "string";
        })
      : [];

    return {
      version: 1,
      workoutSync: isObject(parsed.workoutSync)
        ? (parsed.workoutSync as Record<string, GarminWorkoutSyncRecord>)
        : {},
      activities: activities.slice(0, MAX_STORED_ACTIVITIES),
      activityLinks: isObject(parsed.activityLinks)
        ? (parsed.activityLinks as Record<string, GarminActivityLink>)
        : {},
      rejectedMatches: parseRejectedMatches(parsed.rejectedMatches),
      lastSyncedAt:
        typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
      nextActivityStart:
        typeof parsed.nextActivityStart === "number" &&
        Number.isSafeInteger(parsed.nextActivityStart) &&
        parsed.nextActivityStart >= 0
          ? parsed.nextActivityStart
          : 0,
      lastSourceReturned:
        typeof parsed.lastSourceReturned === "number" &&
        Number.isSafeInteger(parsed.lastSourceReturned) &&
        parsed.lastSourceReturned >= 0
          ? parsed.lastSourceReturned
          : 0,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function getStateSnapshot() {
  if (!canUseStorage()) {
    return EMPTY_STATE;
  }

  const raw = window.localStorage.getItem(GARMIN_STORAGE_KEY);

  if (raw === cachedRaw) {
    return cachedState;
  }

  cachedRaw = raw;
  cachedState = parseState(raw);
  return cachedState;
}

function subscribe(callback: () => void) {
  if (!canUseStorage()) {
    return () => {};
  }

  window.addEventListener(GARMIN_STORAGE_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(GARMIN_STORAGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function writeState(state: GarminLocalState) {
  if (!canUseStorage()) {
    return;
  }

  const raw = JSON.stringify(state);
  window.localStorage.setItem(GARMIN_STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedState = state;
  window.dispatchEvent(new Event(GARMIN_STORAGE_EVENT));
}

function activityTimestamp(record: GarminStoredActivity) {
  const value =
    record.activity.startTime ??
    record.activity.localStartTime ??
    record.importedAt;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getGarminLocalState() {
  return getStateSnapshot();
}

export function useGarminLocalState() {
  return useSyncExternalStore(subscribe, getStateSnapshot, () => EMPTY_STATE);
}

export function getGarminCompletedSessionIds(
  state: GarminLocalState = getStateSnapshot(),
) {
  return Array.from(
    new Set(
      Object.values(state.activityLinks)
        .map((link) => link?.sessionId)
        .filter((sessionId): sessionId is string => Boolean(sessionId)),
    ),
  );
}

export function saveGarminWorkoutSync(record: GarminWorkoutSyncRecord) {
  const current = getStateSnapshot();
  writeState({
    ...current,
    workoutSync: {
      ...current.workoutSync,
      [record.sessionId]: record,
    },
  });
}

export function mergeGarminActivityBatch(input: {
  records: GarminActivitySyncApiRecord[];
  syncedAt: string;
  nextStart: number;
  sourceReturned: number;
}) {
  const current = getStateSnapshot();
  const activitiesById = new Map(
    current.activities.map((record) => [record.activity.activityId, record]),
  );
  const activityLinks = { ...current.activityLinks };
  const linkedSessionIds = new Set(
    Object.values(activityLinks)
      .map((link) => link?.sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
  );
  const automaticallyLinked: GarminActivityLink[] = [];

  for (const record of input.records) {
    const activityId = record.activity.activityId;

    if (!activityId) {
      continue;
    }

    activitiesById.set(activityId, {
      activity: record.activity,
      match: record.match,
      importedAt: input.syncedAt,
    });

    if (
      record.match.kind === "matched" &&
      !activityLinks[activityId] &&
      !linkedSessionIds.has(record.match.candidate.sessionId) &&
      !current.rejectedMatches[activityId]?.includes(
        record.match.candidate.sessionId,
      )
    ) {
      const link: GarminActivityLink = {
        activityId,
        sessionId: record.match.candidate.sessionId,
        method: "automatic",
        linkedAt: input.syncedAt,
      };
      activityLinks[activityId] = link;
      linkedSessionIds.add(link.sessionId);
      automaticallyLinked.push(link);
    }
  }

  const activities = [...activitiesById.values()]
    .sort(
      (first, second) =>
        activityTimestamp(second) - activityTimestamp(first) ||
        (first.activity.activityId ?? "").localeCompare(
          second.activity.activityId ?? "",
        ),
    )
    .slice(0, MAX_STORED_ACTIVITIES);

  writeState({
    ...current,
    activities,
    activityLinks,
    lastSyncedAt: input.syncedAt,
    nextActivityStart: input.nextStart,
    lastSourceReturned: input.sourceReturned,
  });

  return automaticallyLinked;
}

export function confirmGarminActivityMatch(
  activityId: string,
  sessionId: string,
) {
  if (!activityId || !sessionId) {
    return null;
  }

  const current = getStateSnapshot();
  const activityLinks = { ...current.activityLinks };
  const rejectedMatches = Object.fromEntries(
    Object.entries(current.rejectedMatches).map(([id, sessionIds]) => [
      id,
      [...sessionIds],
    ]),
  );
  const rejectMatch = (rejectedActivityId: string, rejectedSessionId: string) => {
    rejectedMatches[rejectedActivityId] = Array.from(
      new Set([
        ...(rejectedMatches[rejectedActivityId] ?? []),
        rejectedSessionId,
      ]),
    );
  };
  const previousActivityLink = activityLinks[activityId];

  if (
    previousActivityLink &&
    previousActivityLink.sessionId !== sessionId
  ) {
    rejectMatch(activityId, previousActivityLink.sessionId);
  }

  for (const [linkedActivityId, existingLink] of Object.entries(
    activityLinks,
  )) {
    if (
      linkedActivityId !== activityId &&
      existingLink.sessionId === sessionId
    ) {
      rejectMatch(linkedActivityId, sessionId);
      delete activityLinks[linkedActivityId];
    }
  }

  const remainingRejections = (
    rejectedMatches[activityId] ?? []
  ).filter((rejectedSessionId) => rejectedSessionId !== sessionId);

  if (remainingRejections.length > 0) {
    rejectedMatches[activityId] = remainingRejections;
  } else {
    delete rejectedMatches[activityId];
  }

  const link: GarminActivityLink = {
    activityId,
    sessionId,
    method: "manual",
    linkedAt: new Date().toISOString(),
  };

  writeState({
    ...current,
    activityLinks: {
      ...activityLinks,
      [activityId]: link,
    },
    rejectedMatches,
  });

  return link;
}

export function clearGarminActivityMatch(activityId: string) {
  const current = getStateSnapshot();

  if (!current.activityLinks[activityId]) {
    return;
  }

  const activityLinks = { ...current.activityLinks };
  const rejectedLink = activityLinks[activityId];
  delete activityLinks[activityId];
  writeState({
    ...current,
    activityLinks,
    rejectedMatches: {
      ...current.rejectedMatches,
      [activityId]: Array.from(
        new Set([
          ...(current.rejectedMatches[activityId] ?? []),
          rejectedLink.sessionId,
        ]),
      ),
    },
  });
}

export function getKnownGarminActivityIds() {
  return getStateSnapshot().activities
    .map((record) => record.activity.activityId)
    .filter((id): id is string => Boolean(id))
    .slice(0, 500);
}

function round(value: number, places = 1) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

function deltaPercent(actual: number | null, planned: number | null | undefined) {
  if (actual === null || planned === null || planned === undefined || planned <= 0) {
    return null;
  }

  return round(((actual - planned) / planned) * 100);
}

export function analyseGarminPlannedVsActual(
  session: GarminPlannedSession,
  activity: NormalizedGarminActivity,
): GarminPlannedVsActual {
  const actualDurationMinutes =
    activity.durationSeconds !== null
      ? activity.durationSeconds / 60
      : null;
  const plannedDurationMinutes =
    session.plannedDurationSeconds !== null &&
    session.plannedDurationSeconds !== undefined
      ? session.plannedDurationSeconds / 60
      : null;
  const durationDeltaMinutes =
    actualDurationMinutes !== null && plannedDurationMinutes !== null
      ? round(actualDurationMinutes - plannedDurationMinutes)
      : null;
  const durationDeltaPercent = deltaPercent(
    actualDurationMinutes,
    plannedDurationMinutes,
  );
  const distanceDeltaMeters =
    activity.distanceMeters !== null &&
    session.plannedDistanceMeters !== null &&
    session.plannedDistanceMeters !== undefined
      ? round(activity.distanceMeters - session.plannedDistanceMeters, 0)
      : null;
  const distanceDeltaPercent = deltaPercent(
    activity.distanceMeters,
    session.plannedDistanceMeters,
  );
  const derivedPlannedPace =
    session.plannedPaceSecondsPerKm ??
    (session.plannedDurationSeconds &&
    session.plannedDistanceMeters &&
    session.plannedDistanceMeters > 0
      ? session.plannedDurationSeconds /
        (session.plannedDistanceMeters / 1_000)
      : null);
  const paceDeltaSecondsPerKm =
    activity.averagePaceSecondsPerKm !== null &&
    derivedPlannedPace !== null &&
    derivedPlannedPace !== undefined
      ? round(activity.averagePaceSecondsPerKm - derivedPlannedPace)
      : null;
  const elevationDeltaMeters =
    activity.elevationGainMeters !== null &&
    session.plannedElevationMeters !== null &&
    session.plannedElevationMeters !== undefined
      ? round(activity.elevationGainMeters - session.plannedElevationMeters, 0)
      : null;
  const plannedHeartRate = session.plannedHeartRateRange;
  const averageHeartRateBpm = activity.averageHeartRateBpm;
  let heartRateAssessment: string | null = null;

  if (plannedHeartRate && averageHeartRateBpm !== null) {
    heartRateAssessment =
      averageHeartRateBpm < plannedHeartRate[0]
        ? `${round(plannedHeartRate[0] - averageHeartRateBpm, 0)} bpm below target range`
        : averageHeartRateBpm > plannedHeartRate[1]
          ? `${round(averageHeartRateBpm - plannedHeartRate[1], 0)} bpm above target range`
          : "Within target range";
  }

  const completionRatios = [
    actualDurationMinutes !== null && plannedDurationMinutes !== null
      ? actualDurationMinutes / Math.max(1, plannedDurationMinutes)
      : null,
    activity.distanceMeters !== null &&
    session.plannedDistanceMeters !== null &&
    session.plannedDistanceMeters !== undefined
      ? activity.distanceMeters / Math.max(1, session.plannedDistanceMeters)
      : null,
  ].filter((value): value is number => value !== null);
  const averageCompletion =
    completionRatios.length > 0
      ? completionRatios.reduce((total, value) => total + value, 0) /
        completionRatios.length
      : null;
  const adherence =
    averageCompletion === null
      ? "unknown"
      : averageCompletion < 0.8
        ? "partial"
        : averageCompletion > 1.2
          ? "over"
          : "on_target";
  const observations: string[] = [];

  if (durationDeltaPercent !== null) {
    observations.push(
      `Duration was ${Math.abs(durationDeltaPercent).toFixed(1)}% ${
        durationDeltaPercent >= 0 ? "above" : "below"
      } plan.`,
    );
  }

  if (distanceDeltaPercent !== null) {
    observations.push(
      `Distance was ${Math.abs(distanceDeltaPercent).toFixed(1)}% ${
        distanceDeltaPercent >= 0 ? "above" : "below"
      } plan.`,
    );
  }

  if (paceDeltaSecondsPerKm !== null) {
    observations.push(
      `Average pace was ${Math.abs(paceDeltaSecondsPerKm).toFixed(0)} sec/km ${
        paceDeltaSecondsPerKm <= 0 ? "faster" : "slower"
      } than plan.`,
    );
  }

  if (heartRateAssessment) {
    observations.push(`Average heart rate was ${heartRateAssessment.toLowerCase()}.`);
  }

  const recordedLapCount = activity.laps?.length ?? null;
  const plannedIntervalCount = session.plannedIntervalCount ?? null;

  if (recordedLapCount !== null && plannedIntervalCount !== null) {
    observations.push(
      `Garmin supplied ${recordedLapCount} lap records for ${plannedIntervalCount} planned work repetitions; review lap pace and heart rate before judging interval execution.`,
    );
  } else if (recordedLapCount !== null) {
    observations.push(
      `Garmin supplied ${recordedLapCount} lap records for interval review.`,
    );
  }

  if (observations.length === 0) {
    observations.push(
      "Not enough comparable planned and actual fields were available.",
    );
  }

  observations.push("Add subjective RPE in the TrainVault session log.");

  return {
    adherence,
    durationDeltaMinutes,
    durationDeltaPercent,
    distanceDeltaMeters,
    distanceDeltaPercent,
    paceDeltaSecondsPerKm,
    averageHeartRateBpm,
    heartRateAssessment,
    elevationDeltaMeters,
    recordedLapCount,
    plannedIntervalCount,
    observations,
  };
}

export function generateGarminPostRunCoachInsight(
  comparison: GarminPlannedVsActual,
): GarminPostRunCoachInsight {
  const comparableFields = [
    comparison.durationDeltaPercent,
    comparison.distanceDeltaPercent,
    comparison.paceDeltaSecondsPerKm,
    comparison.heartRateAssessment,
    comparison.elevationDeltaMeters,
    comparison.recordedLapCount !== null &&
    comparison.plannedIntervalCount !== null
      ? comparison.recordedLapCount
      : null,
  ].filter((value) => value !== null).length;
  const confidence = `Basic · ${comparableFields} comparable field${
    comparableFields === 1 ? "" : "s"
  }`;

  if (comparison.adherence === "partial") {
    return {
      title: "Volume landed below plan",
      body: "The matched run completed materially less volume than prescribed. Add RPE and context before adapting the week; do not automatically make up the missing load.",
      confidence,
    };
  }

  if (comparison.adherence === "over") {
    return {
      title: "Count the extra running cost",
      body: "The matched run materially exceeded prescribed volume. Treat that additional work as training load before the next lower-body or quality session.",
      confidence,
    };
  }

  if (comparison.adherence === "on_target") {
    const heartRateContext =
      comparison.heartRateAssessment &&
      comparison.heartRateAssessment !== "Within target range"
        ? ` Average heart rate was ${comparison.heartRateAssessment.toLowerCase()}.`
        : "";

    return {
      title: "Prescription substantially completed",
      body: `Completed volume was close to plan.${heartRateContext} Add RPE so TrainVault can pair the Garmin response with subjective cost.`,
      confidence,
    };
  }

  return {
    title: "Matched, with limited comparable data",
    body: "The activity is linked, but planned and actual fields are too sparse for a volume conclusion. Add RPE and notes; no automatic load adjustment has been inferred.",
    confidence,
  };
}
