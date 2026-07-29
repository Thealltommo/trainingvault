"use client";

import { useEffect, useRef } from "react";
import {
  getKnownGarminActivityIds,
  mergeGarminActivityBatch,
  toGarminActivityMatchingSession,
  useGarminLocalState,
  type GarminActivitySyncApiRecord,
  type GarminPlannedSession,
} from "@/lib/garmin-storage";

type GarminActivityAutoSyncProps = {
  plannedSessions: GarminPlannedSession[];
};

type ActivitySyncResponse = {
  records: GarminActivitySyncApiRecord[];
  sourceReturned: number;
  nextStart: number;
  syncedAt: string;
  skippedWithoutId: number;
};

const AUTO_SYNC_MAX_AGE_MS = 15 * 60 * 1000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResponse(value: unknown): ActivitySyncResponse | null {
  if (
    !isObject(value) ||
    !Array.isArray(value.records) ||
    typeof value.sourceReturned !== "number" ||
    typeof value.nextStart !== "number" ||
    typeof value.syncedAt !== "string" ||
    typeof value.skippedWithoutId !== "number"
  ) {
    return null;
  }

  const records = value.records.filter(
    (record): record is GarminActivitySyncApiRecord =>
      isObject(record) &&
      isObject(record.activity) &&
      (typeof record.activity.activityId === "string" ||
        record.activity.activityId === null) &&
      isObject(record.match) &&
      (record.match.kind === "matched" ||
        record.match.kind === "ambiguous" ||
        record.match.kind === "none") &&
      typeof record.isNew === "boolean",
  );

  if (records.length !== value.records.length) {
    return null;
  }

  return {
    records,
    sourceReturned: Math.max(0, Math.floor(value.sourceReturned)),
    nextStart: Math.max(0, Math.floor(value.nextStart)),
    syncedAt: value.syncedAt,
    skippedWithoutId: Math.max(0, Math.floor(value.skippedWithoutId)),
  };
}

function isStale(lastSyncedAt: string | null) {
  if (!lastSyncedAt) {
    return true;
  }

  const timestamp = new Date(lastSyncedAt).getTime();
  return !Number.isFinite(timestamp) || Date.now() - timestamp > AUTO_SYNC_MAX_AGE_MS;
}

export default function GarminActivityAutoSync({
  plannedSessions,
}: GarminActivityAutoSyncProps) {
  const garmin = useGarminLocalState();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || !isStale(garmin.lastSyncedAt)) {
      return;
    }

    attempted.current = true;
    const controller = new AbortController();

    void fetch("/api/garmin/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        start: 0,
        limit: 30,
        knownActivityIds: getKnownGarminActivityIds(),
        plannedSessions: plannedSessions.map((session) =>
          toGarminActivityMatchingSession({
            ...session,
            garminWorkoutId:
              session.garminWorkoutId ??
              garmin.workoutSync[session.sessionId]?.garminWorkoutId ??
              null,
          }),
        ),
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return parseResponse((await response.json()) as unknown);
      })
      .then((payload) => {
        if (payload) {
          mergeGarminActivityBatch(payload);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // Automatic sync is intentionally silent. The full Log sync panel
        // remains the visible retry/error surface.
      });

    return () => controller.abort();
  }, [garmin.lastSyncedAt, garmin.workoutSync, plannedSessions]);

  return null;
}
