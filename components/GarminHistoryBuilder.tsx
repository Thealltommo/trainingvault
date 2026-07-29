"use client";

import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  DatabaseZap,
  LoaderCircle,
  RefreshCw,
  Watch,
} from "lucide-react";
import {
  getKnownGarminActivityIds,
  mergeGarminActivityBatch,
  useGarminLocalState,
  type GarminActivitySyncApiRecord,
} from "@/lib/garmin-storage";
import {
  saveGarminRecovery,
  useRecoveryRecords,
} from "@/lib/recovery-storage";

const ACTIVITY_PAGE_SIZE = 30;
const MAX_ACTIVITY_PAGES_PER_RUN = 4;
const REQUEST_GAP_MS = 350;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableNumber(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recentDateKeys(days: number) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - index);
    return localDateKey(date);
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

type RecoveryPayload = {
  recovery: {
    date: string;
    restingHeartRateBpm: number | null;
    hrvLastNightMs: number | null;
    hrvWeeklyAverageMs: number | null;
    sleepScore: number | null;
    sleepDurationSeconds: number | null;
    averageStressLevel: number | null;
    bodyBatteryCurrent: number | null;
    trainingReadinessScore: number | null;
  };
  trainingStatus: {
    acuteLoad: number | null;
    chronicLoad: number | null;
  } | null;
};

function parseRecoveryPayload(value: unknown): RecoveryPayload | null {
  if (!isObject(value) || !isObject(value.recovery)) return null;
  const recovery = value.recovery;
  const numericValues = [
    recovery.restingHeartRateBpm,
    recovery.hrvLastNightMs,
    recovery.hrvWeeklyAverageMs,
    recovery.sleepScore,
    recovery.sleepDurationSeconds,
    recovery.averageStressLevel,
    recovery.bodyBatteryCurrent,
    recovery.trainingReadinessScore,
  ];
  if (
    typeof recovery.date !== "string" ||
    !numericValues.every(nullableNumber)
  ) {
    return null;
  }

  let trainingStatus: RecoveryPayload["trainingStatus"] = null;
  if (value.trainingStatus !== null && value.trainingStatus !== undefined) {
    if (
      !isObject(value.trainingStatus) ||
      !nullableNumber(value.trainingStatus.acuteLoad) ||
      !nullableNumber(value.trainingStatus.chronicLoad)
    ) {
      return null;
    }
    trainingStatus = {
      acuteLoad: value.trainingStatus.acuteLoad as number | null,
      chronicLoad: value.trainingStatus.chronicLoad as number | null,
    };
  }

  return {
    recovery: {
      date: recovery.date,
      restingHeartRateBpm: recovery.restingHeartRateBpm as number | null,
      hrvLastNightMs: recovery.hrvLastNightMs as number | null,
      hrvWeeklyAverageMs: recovery.hrvWeeklyAverageMs as number | null,
      sleepScore: recovery.sleepScore as number | null,
      sleepDurationSeconds: recovery.sleepDurationSeconds as number | null,
      averageStressLevel: recovery.averageStressLevel as number | null,
      bodyBatteryCurrent: recovery.bodyBatteryCurrent as number | null,
      trainingReadinessScore: recovery.trainingReadinessScore as number | null,
    },
    trainingStatus,
  };
}

type ActivityPayload = {
  records: GarminActivitySyncApiRecord[];
  sourceReturned: number;
  nextStart: number;
  syncedAt: string;
};

function parseActivityPayload(value: unknown): ActivityPayload | null {
  if (
    !isObject(value) ||
    !Array.isArray(value.records) ||
    typeof value.sourceReturned !== "number" ||
    typeof value.nextStart !== "number" ||
    typeof value.syncedAt !== "string"
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
        record.match.kind === "none"),
  );

  if (records.length !== value.records.length) return null;

  return {
    records,
    sourceReturned: Math.max(0, Math.floor(value.sourceReturned)),
    nextStart: Math.max(0, Math.floor(value.nextStart)),
    syncedAt: value.syncedAt,
  };
}

function errorFromPayload(value: unknown, fallback: string) {
  return isObject(value) && typeof value.error === "string"
    ? value.error.slice(0, 300)
    : fallback;
}

export default function GarminHistoryBuilder() {
  const garmin = useGarminLocalState();
  const recovery = useRecoveryRecords();
  const [mode, setMode] = useState<"recovery" | "activities" | null>(null);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const recoveryKeys = useMemo(() => recentDateKeys(14), []);
  const recoverySet = useMemo(
    () => new Set(recovery.map((record) => record.date)),
    [recovery],
  );
  const missingRecovery = recoveryKeys.filter((date) => !recoverySet.has(date));
  const oldestActivity = useMemo(() => {
    const timestamps = garmin.activities
      .map((record) =>
        Date.parse(
          record.activity.localStartTime ??
            record.activity.startTime ??
            record.importedAt,
        ),
      )
      .filter(Number.isFinite);
    if (timestamps.length === 0) return null;
    return new Date(Math.min(...timestamps)).toISOString();
  }, [garmin.activities]);

  async function backfillRecovery() {
    if (mode || missingRecovery.length === 0) return;
    setMode("recovery");
    setMessage("");
    setError("");
    let completed = 0;

    try {
      for (const date of [...missingRecovery].reverse()) {
        setProgress(`Recovery ${completed + 1}/${missingRecovery.length} · ${date}`);
        const response = await fetch(
          `/api/garmin/recovery?date=${encodeURIComponent(date)}`,
          { cache: "no-store" },
        );
        const value = (await response.json()) as unknown;
        if (!response.ok) {
          throw new Error(
            errorFromPayload(value, `Garmin recovery failed for ${date}.`),
          );
        }
        const payload = parseRecoveryPayload(value);
        if (!payload || payload.recovery.date !== date) {
          throw new Error(`Garmin returned an unexpected recovery record for ${date}.`);
        }
        const saved = saveGarminRecovery({
          date,
          sleepHours:
            payload.recovery.sleepDurationSeconds == null
              ? null
              : payload.recovery.sleepDurationSeconds / 3_600,
          sleepScore: payload.recovery.sleepScore,
          hrvMs: payload.recovery.hrvLastNightMs,
          hrvBaselineMs: payload.recovery.hrvWeeklyAverageMs,
          restingHeartRate: payload.recovery.restingHeartRateBpm,
          garminReadiness: payload.recovery.trainingReadinessScore,
          recentLoad7d: payload.trainingStatus?.acuteLoad ?? null,
          baselineLoad7d: payload.trainingStatus?.chronicLoad ?? null,
          stressAverage: payload.recovery.averageStressLevel,
          bodyBattery: payload.recovery.bodyBatteryCurrent,
          garminSyncedAt: new Date().toISOString(),
        });
        if (!saved) {
          throw new Error(`Recovery for ${date} could not be stored.`);
        }
        completed += 1;
        if (completed < missingRecovery.length) await delay(REQUEST_GAP_MS);
      }
      setMessage(`Recovery history built · ${completed} day${completed === 1 ? "" : "s"} added.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Garmin recovery history could not be completed.",
      );
    } finally {
      setProgress("");
      setMode(null);
    }
  }

  async function backfillActivities() {
    if (mode) return;
    setMode("activities");
    setMessage("");
    setError("");
    let nextStart = garmin.nextActivityStart > 0 ? garmin.nextActivityStart : 30;
    let imported = 0;
    let pages = 0;

    try {
      while (pages < MAX_ACTIVITY_PAGES_PER_RUN) {
        setProgress(
          `Activity history page ${pages + 1}/${MAX_ACTIVITY_PAGES_PER_RUN} · starting at ${nextStart}`,
        );
        const response = await fetch("/api/garmin/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: nextStart,
            limit: ACTIVITY_PAGE_SIZE,
            knownActivityIds: getKnownGarminActivityIds(),
            plannedSessions: [],
          }),
        });
        const value = (await response.json()) as unknown;
        if (!response.ok) {
          throw new Error(
            errorFromPayload(value, "Garmin activity history could not be loaded."),
          );
        }
        const payload = parseActivityPayload(value);
        if (!payload) {
          throw new Error("Garmin returned an unexpected activity-history response.");
        }

        mergeGarminActivityBatch(payload);
        imported += payload.records.length;
        pages += 1;
        nextStart = payload.nextStart;

        if (
          payload.sourceReturned < ACTIVITY_PAGE_SIZE ||
          payload.sourceReturned === 0
        ) {
          break;
        }
        if (pages < MAX_ACTIVITY_PAGES_PER_RUN) await delay(REQUEST_GAP_MS);
      }
      setMessage(
        `Activity history extended · ${pages} page${pages === 1 ? "" : "s"}, ${imported} validated record${imported === 1 ? "" : "s"} processed.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Garmin activity history could not be completed.",
      );
    } finally {
      setProgress("");
      setMode(null);
    }
  }

  return (
    <section className="border border-[rgba(215,255,47,0.3)] bg-[rgba(215,255,47,0.035)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--accent)] text-black">
              <DatabaseZap className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="tv-label text-[var(--accent)]">Evidence builder</p>
              <h2 className="text-2xl font-black uppercase">Give the Lab a longer memory</h2>
            </div>
          </div>
          <p className="mt-3 text-sm font-bold leading-relaxed text-[var(--muted)]">
            TrainVault deliberately avoids hammering Garmin in the background. These bounded, manual backfills let you seed the useful history once: up to 14 recovery days and up to four older 30-activity pages per run. Existing activity IDs are deduplicated locally.
          </p>
        </div>
        <div className="grid min-w-56 gap-2 text-xs font-black uppercase">
          <div className="flex items-center justify-between gap-4 border border-[var(--border)] bg-black/45 p-2.5">
            <span className="text-[var(--muted)]">Recovery runway</span>
            <span>{14 - missingRecovery.length}/14</span>
          </div>
          <div className="flex items-center justify-between gap-4 border border-[var(--border)] bg-black/45 p-2.5">
            <span className="text-[var(--muted)]">Activity bank</span>
            <span>{garmin.activities.length}/250</span>
          </div>
          <div className="flex items-center justify-between gap-4 border border-[var(--border)] bg-black/45 p-2.5">
            <span className="text-[var(--muted)]">Oldest record</span>
            <span>{formatDate(oldestActivity)}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => void backfillRecovery()}
          disabled={Boolean(mode) || missingRecovery.length === 0}
          className="flex min-h-20 items-center gap-3 border border-[var(--border)] bg-black/55 p-4 text-left transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mode === "recovery" ? (
            <LoaderCircle className="h-6 w-6 shrink-0 animate-spin text-[var(--accent)]" aria-hidden="true" />
          ) : missingRecovery.length === 0 ? (
            <CheckCircle2 className="h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          ) : (
            <CalendarClock className="h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          )}
          <span>
            <span className="block text-sm font-black uppercase">
              {missingRecovery.length === 0
                ? "14-day recovery runway complete"
                : `Backfill ${missingRecovery.length} missing recovery day${missingRecovery.length === 1 ? "" : "s"}`}
            </span>
            <span className="mt-1 block text-xs font-bold text-[var(--muted)]">
              HRV · resting HR · sleep · Body Battery · readiness where Garmin exposes them.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => void backfillActivities()}
          disabled={Boolean(mode) || garmin.lastSourceReturned === 0 && garmin.activities.length > 0}
          className="flex min-h-20 items-center gap-3 border border-[var(--border)] bg-black/55 p-4 text-left transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mode === "activities" ? (
            <LoaderCircle className="h-6 w-6 shrink-0 animate-spin text-[var(--accent)]" aria-hidden="true" />
          ) : (
            <ArchiveRestore className="h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          )}
          <span>
            <span className="block text-sm font-black uppercase">Extend Garmin activity history</span>
            <span className="mt-1 block text-xs font-bold text-[var(--muted)]">
              Up to 120 older source records per click, sequentially and with a short request gap.
            </span>
          </span>
        </button>
      </div>

      {progress ? (
        <p className="mt-4 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          {progress}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 flex items-start gap-2 border-l-2 border-[var(--accent)] pl-3 text-sm font-bold">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 flex items-start gap-2 border-l-2 border-amber-300 pl-3 text-sm font-bold text-amber-100">
          <Watch className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </section>
  );
}
