"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Watch,
} from "lucide-react";
import {
  saveGarminRecovery,
  useDailyRecovery,
} from "@/lib/recovery-storage";

type GarminRecoverySyncProps = {
  date: string;
};

type NullableNumber = number | null;

type RecoveryApiPayload = {
  recovery: {
    date: string;
    restingHeartRateBpm: NullableNumber;
    hrvLastNightMs: NullableNumber;
    hrvWeeklyAverageMs: NullableNumber;
    sleepScore: NullableNumber;
    sleepDurationSeconds: NullableNumber;
    averageStressLevel: NullableNumber;
    bodyBatteryCurrent: NullableNumber;
    trainingReadinessScore: NullableNumber;
    partial: boolean;
    unavailableMetrics: string[];
  };
  trainingStatus: {
    acuteLoad: NullableNumber;
    chronicLoad: NullableNumber;
  } | null;
  partial: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableNumber(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function parseRecovery(value: unknown): RecoveryApiPayload | null {
  if (!isObject(value) || !isObject(value.recovery)) {
    return null;
  }

  const recovery = value.recovery;
  const requiredNumbers = [
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
    typeof recovery.partial !== "boolean" ||
    !Array.isArray(recovery.unavailableMetrics) ||
    !requiredNumbers.every(nullableNumber) ||
    typeof value.partial !== "boolean"
  ) {
    return null;
  }

  let trainingStatus: RecoveryApiPayload["trainingStatus"] = null;

  if (value.trainingStatus !== null) {
    if (
      !isObject(value.trainingStatus) ||
      !nullableNumber(value.trainingStatus.acuteLoad) ||
      !nullableNumber(value.trainingStatus.chronicLoad)
    ) {
      return null;
    }

    trainingStatus = {
      acuteLoad: value.trainingStatus.acuteLoad as NullableNumber,
      chronicLoad: value.trainingStatus.chronicLoad as NullableNumber,
    };
  }

  return {
    recovery: {
      date: recovery.date,
      restingHeartRateBpm: recovery.restingHeartRateBpm as NullableNumber,
      hrvLastNightMs: recovery.hrvLastNightMs as NullableNumber,
      hrvWeeklyAverageMs: recovery.hrvWeeklyAverageMs as NullableNumber,
      sleepScore: recovery.sleepScore as NullableNumber,
      sleepDurationSeconds: recovery.sleepDurationSeconds as NullableNumber,
      averageStressLevel: recovery.averageStressLevel as NullableNumber,
      bodyBatteryCurrent: recovery.bodyBatteryCurrent as NullableNumber,
      trainingReadinessScore:
        recovery.trainingReadinessScore as NullableNumber,
      partial: recovery.partial,
      unavailableMetrics: recovery.unavailableMetrics.filter(
        (metric): metric is string => typeof metric === "string",
      ),
    },
    trainingStatus,
    partial: value.partial,
  };
}

function safeError(value: unknown) {
  return isObject(value) && typeof value.error === "string"
    ? value.error.slice(0, 300)
    : "Garmin recovery could not be refreshed.";
}

function formatLastSync(value: string | null) {
  if (!value) {
    return "Never synced";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Previously synced"
    : new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export default function GarminRecoverySync({
  date,
}: GarminRecoverySyncProps) {
  const dailyRecovery = useDailyRecovery(date);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleRefresh() {
    if (syncing || !date) {
      return;
    }

    setSyncing(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/garmin/recovery?date=${encodeURIComponent(date)}`,
        { cache: "no-store" },
      );
      const value = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(safeError(value));
      }

      const payload = parseRecovery(value);

      if (!payload || payload.recovery.date !== date) {
        throw new Error("Garmin returned an unexpected recovery response.");
      }

      const saved = saveGarminRecovery({
        date,
        sleepHours:
          payload.recovery.sleepDurationSeconds === null
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
        throw new Error("Garmin recovery could not be saved locally.");
      }

      const missing = payload.recovery.unavailableMetrics.length;
      setMessage(
        payload.partial
          ? `Recovery refreshed with partial Garmin data${
              missing > 0 ? ` · ${missing} source${missing === 1 ? "" : "s"} unavailable` : ""
            }.`
          : "Recovery refreshed from Garmin.",
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Garmin recovery could not be refreshed.",
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="tv-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Garmin signals</p>
          <p className="mt-1 flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <Watch className="h-3.5 w-3.5" aria-hidden="true" />
            {formatLastSync(dailyRecovery?.garminSyncedAt ?? null)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={syncing}
          className="tv-button-ghost min-h-9 px-3 py-1 text-xs disabled:cursor-wait disabled:opacity-50"
        >
          {syncing ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Refresh
        </button>
      </div>

      {message ? (
        <p
          className="mt-3 flex items-start gap-2 text-xs font-bold text-[var(--accent)]"
          aria-live="polite"
        >
          <CheckCircle2
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-3 flex items-start gap-2 text-xs font-bold text-amber-200"
          role="alert"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {error}
        </p>
      ) : null}
    </section>
  );
}
