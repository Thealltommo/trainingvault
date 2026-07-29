"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Link2,
  LoaderCircle,
  RefreshCw,
  Unlink,
} from "lucide-react";
import {
  analyseGarminPlannedVsActual,
  clearGarminActivityMatch,
  confirmGarminActivityMatch,
  getKnownGarminActivityIds,
  mergeGarminActivityBatch,
  useGarminLocalState,
  type GarminActivityLink,
  type GarminActivitySyncApiRecord,
  type GarminPlannedSession,
  type GarminPlannedVsActual,
  type NormalizedGarminActivity,
} from "@/lib/garmin-storage";

export type GarminActivityLinkedEvent = {
  link: GarminActivityLink;
  activity: NormalizedGarminActivity;
  plannedSession: GarminPlannedSession;
  comparison: GarminPlannedVsActual;
};

type GarminSyncPanelProps = {
  plannedSessions: GarminPlannedSession[];
  onActivityLinked?: (event: GarminActivityLinkedEvent) => void;
};

type ActivitySyncResponse = {
  records: GarminActivitySyncApiRecord[];
  sourceReturned: number;
  nextStart: number;
  syncedAt: string;
  skippedWithoutId: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSyncResponse(value: unknown): ActivitySyncResponse | null {
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

function errorMessage(value: unknown, fallback: string) {
  return isObject(value) && typeof value.error === "string"
    ? value.error.slice(0, 300)
    : fallback;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Time unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (seconds === null) {
    return "—";
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatDistance(meters: number | null) {
  return meters === null ? "—" : `${(meters / 1_000).toFixed(2)} km`;
}

function formatPace(secondsPerKm: number | null) {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm)) {
    return "—";
  }

  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function comparisonTone(adherence: GarminPlannedVsActual["adherence"]) {
  if (adherence === "on_target") {
    return "border-[var(--accent)] text-[var(--accent)]";
  }

  if (adherence === "partial" || adherence === "over") {
    return "border-amber-300/50 text-amber-200";
  }

  return "border-[var(--border)] text-[var(--muted)]";
}

function PlannedActual({
  session,
  activity,
}: {
  session: GarminPlannedSession;
  activity: NormalizedGarminActivity;
}) {
  const result = analyseGarminPlannedVsActual(session, activity);

  return (
    <div className="mt-3 rounded-md border border-[rgba(215,255,47,0.28)] bg-black/65 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tv-label text-[var(--accent)]">Planned vs actual</p>
        <span
          className={`rounded-sm border px-2 py-1 text-xs font-black uppercase ${comparisonTone(
            result.adherence,
          )}`}
        >
          {result.adherence.replace("_", " ")}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div>
          <p className="tv-label">Distance</p>
          <p className="mt-1 text-sm font-black">
            {formatDistance(activity.distanceMeters)}
          </p>
        </div>
        <div>
          <p className="tv-label">Time</p>
          <p className="mt-1 text-sm font-black">
            {formatDuration(activity.durationSeconds)}
          </p>
        </div>
        <div>
          <p className="tv-label">Pace</p>
          <p className="mt-1 text-sm font-black">
            {formatPace(activity.averagePaceSecondsPerKm)}
          </p>
        </div>
        <div>
          <p className="tv-label">Avg HR</p>
          <p className="mt-1 text-sm font-black">
            {activity.averageHeartRateBpm === null
              ? "—"
              : `${Math.round(activity.averageHeartRateBpm)} bpm`}
          </p>
        </div>
        <div>
          <p className="tv-label">Elevation</p>
          <p className="mt-1 text-sm font-black">
            {activity.elevationGainMeters === null
              ? "—"
              : `${Math.round(activity.elevationGainMeters)} m`}
          </p>
        </div>
      </div>
      <ul className="mt-3 grid gap-1 text-xs font-bold text-[var(--muted)]">
        {result.observations.map((observation) => (
          <li
            key={observation}
            className="border-l-2 border-[var(--accent)] pl-2"
          >
            {observation}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GarminSyncPanel({
  plannedSessions,
  onActivityLinked,
}: GarminSyncPanelProps) {
  const garmin = useGarminLocalState();
  const [syncing, setSyncing] = useState<"latest" | "older" | null>(null);
  const [syncError, setSyncError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const sessionsForMatching = plannedSessions.map((session) => ({
    ...session,
    garminWorkoutId:
      session.garminWorkoutId ??
      garmin.workoutSync[session.sessionId]?.garminWorkoutId ??
      null,
  }));

  const plannedById = new Map(
    sessionsForMatching.map((session) => [session.sessionId, session]),
  );

  function notifyLinked(
    link: GarminActivityLink,
    activity: NormalizedGarminActivity,
  ) {
    const plannedSession = plannedById.get(link.sessionId);

    if (!plannedSession || !onActivityLinked) {
      return;
    }

    onActivityLinked({
      link,
      activity,
      plannedSession,
      comparison: analyseGarminPlannedVsActual(plannedSession, activity),
    });
  }

  async function syncActivities(mode: "latest" | "older") {
    if (syncing) {
      return;
    }

    setSyncing(mode);
    setSyncError("");
    setSyncMessage("");

    try {
      const response = await fetch("/api/garmin/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: mode === "latest" ? 0 : garmin.nextActivityStart,
          limit: 30,
          knownActivityIds: getKnownGarminActivityIds(),
          plannedSessions: sessionsForMatching,
        }),
      });
      const value = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          errorMessage(value, "Garmin activities could not be synced."),
        );
      }

      const parsed = parseSyncResponse(value);

      if (!parsed) {
        throw new Error("Garmin returned an unexpected activity response.");
      }

      const automaticallyLinked = mergeGarminActivityBatch(parsed);

      for (const link of automaticallyLinked) {
        const record = parsed.records.find(
          (candidate) => candidate.activity.activityId === link.activityId,
        );

        if (record) {
          notifyLinked(link, record.activity);
        }
      }

      const imported = parsed.records.filter(
        (record) =>
          record.isNew && record.activity.activityId !== null,
      ).length;
      setSyncMessage(
        imported > 0
          ? `${imported} new Garmin activit${imported === 1 ? "y" : "ies"} imported.`
          : "Garmin is up to date for this page.",
      );

      if (parsed.skippedWithoutId > 0) {
        setSyncMessage(
          (current) =>
            `${current} ${parsed.skippedWithoutId} record${
              parsed.skippedWithoutId === 1 ? "" : "s"
            } without a Garmin activity ID were not persisted.`,
        );
      }
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Garmin activities could not be synced.",
      );
    } finally {
      setSyncing(null);
    }
  }

  function handleConfirm(
    record: GarminActivitySyncApiRecord,
    sessionId: string,
  ) {
    const activityId = record.activity.activityId;

    if (!activityId) {
      return;
    }

    const link = confirmGarminActivityMatch(activityId, sessionId);

    if (link) {
      notifyLinked(link, record.activity);
    }
  }

  return (
    <section className="tv-card border-[rgba(215,255,47,0.3)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Garmin activity sync</p>
          <h2 className="mt-1 text-2xl font-black uppercase">
            Completed training
          </h2>
          <p className="mt-2 text-sm font-bold text-[var(--muted)]">
            Sync is manual and bounded. Confident runs link automatically;
            uncertain matches always wait for you.
          </p>
        </div>
        {garmin.lastSyncedAt ? (
          <span className="text-xs font-bold text-[var(--muted)]">
            Last sync {formatDate(garmin.lastSyncedAt)}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void syncActivities("latest")}
          disabled={Boolean(syncing)}
          className="tv-button-primary disabled:cursor-wait disabled:opacity-50"
        >
          {syncing === "latest" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Sync latest
        </button>
        {garmin.lastSyncedAt && garmin.lastSourceReturned > 0 ? (
          <button
            type="button"
            onClick={() => void syncActivities("older")}
            disabled={Boolean(syncing)}
            className="tv-button-ghost disabled:cursor-wait disabled:opacity-50"
          >
            {syncing === "older" ? (
              <LoaderCircle
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Activity className="h-4 w-4" aria-hidden="true" />
            )}
            Load older
          </button>
        ) : null}
      </div>

      {syncError ? (
        <p
          className="mt-3 flex items-start gap-2 rounded-md border border-red-400/35 bg-red-400/10 p-3 text-sm font-bold text-red-200"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {syncError}
        </p>
      ) : null}
      {syncMessage ? (
        <p
          className="mt-3 flex items-start gap-2 rounded-md border border-[rgba(215,255,47,0.3)] bg-[rgba(215,255,47,0.08)] p-3 text-sm font-bold text-[var(--accent)]"
          aria-live="polite"
        >
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {syncMessage}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {garmin.activities.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--border)] bg-black/40 p-5 text-center">
            <Activity
              className="mx-auto h-6 w-6 text-[var(--muted)]"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">
              No Garmin activities have been imported on this device.
            </p>
          </div>
        ) : (
          garmin.activities.slice(0, 12).map((record) => {
            const activityId = record.activity.activityId;
            const link = activityId
              ? garmin.activityLinks[activityId]
              : undefined;
            const linkedSession = link
              ? plannedById.get(link.sessionId)
              : undefined;
            const candidates =
              record.match.kind === "ambiguous"
                ? [
                    record.match.candidate,
                    ...record.match.alternatives,
                  ]
                : [];

            return (
              <article
                key={activityId ?? `${record.importedAt}-${record.activity.title}`}
                className="rounded-md border border-[var(--border)] bg-black/45 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-black uppercase">
                      {record.activity.title ||
                        record.activity.activityType ||
                        "Garmin activity"}
                    </p>
                    <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                      {formatDate(
                        record.activity.startTime ??
                          record.activity.localStartTime,
                      )}
                    </p>
                  </div>
                  {link ? (
                    <span className="inline-flex min-h-8 items-center gap-1 rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.1)] px-2 text-xs font-black uppercase text-[var(--accent)]">
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {link.method === "automatic" ? "Auto-linked" : "Matched"}
                    </span>
                  ) : (
                    <span className="rounded-sm border border-[var(--border)] px-2 py-1 text-xs font-black uppercase text-[var(--muted)]">
                      Unlinked
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="tv-label">Distance</p>
                    <p className="mt-1 font-black">
                      {formatDistance(record.activity.distanceMeters)}
                    </p>
                  </div>
                  <div>
                    <p className="tv-label">Time</p>
                    <p className="mt-1 font-black">
                      {formatDuration(record.activity.durationSeconds)}
                    </p>
                  </div>
                  <div>
                    <p className="tv-label">Pace</p>
                    <p className="mt-1 font-black">
                      {formatPace(record.activity.averagePaceSecondsPerKm)}
                    </p>
                  </div>
                </div>

                {!link && record.match.kind === "ambiguous" ? (
                  <div className="mt-3 rounded-md border border-amber-300/45 bg-amber-300/10 p-3">
                    <p className="text-sm font-black uppercase text-amber-200">
                      Match this activity?
                    </p>
                    <p className="mt-1 text-xs font-bold text-amber-100/75">
                      More than one plan match is plausible. Nothing has been
                      completed automatically.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {candidates.map((candidate) => {
                        const candidateSession = plannedById.get(
                          candidate.sessionId,
                        );

                        return (
                          <button
                            key={candidate.sessionId}
                            type="button"
                            onClick={() =>
                              handleConfirm(record, candidate.sessionId)
                            }
                            className="tv-button-ghost min-h-9 px-3 py-1 text-xs"
                          >
                            Match{" "}
                            {candidateSession?.title ?? candidate.sessionId}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {!link && record.match.kind === "none" ? (
                  <p className="mt-3 text-xs font-bold text-[var(--muted)]">
                    No planned run had enough matching evidence.
                  </p>
                ) : null}

                {link && linkedSession ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-black uppercase text-[var(--accent)]">
                        {linkedSession.title}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          activityId
                            ? clearGarminActivityMatch(activityId)
                            : undefined
                        }
                        className="inline-flex items-center gap-1 text-xs font-black uppercase text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                        Unlink
                      </button>
                    </div>
                    <PlannedActual
                      session={linkedSession}
                      activity={record.activity}
                    />
                  </>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
