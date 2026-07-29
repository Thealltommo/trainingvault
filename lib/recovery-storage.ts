"use client";

import { useSyncExternalStore } from "react";
import type {
  DailyRecoveryInput,
  ReadinessRecommendation,
} from "@/lib/athlete";

export type RecoverySource = "manual" | "garmin" | "mixed";

export type DailyRecoveryRecord = {
  date: string;
  source: RecoverySource;
  sleepHours: number | null;
  sleepScore: number | null;
  hrvMs: number | null;
  hrvBaselineMs: number | null;
  restingHeartRate: number | null;
  restingHeartRateBaseline: number | null;
  garminReadiness: number | null;
  recentLoad7d: number | null;
  baselineLoad7d: number | null;
  lowerBodyLoad48h: number | null;
  runningLoad7d: number | null;
  highIntensitySessions72h: number | null;
  soreness: number | null;
  subjectiveReadiness: number | null;
  daysSinceRest: number | null;
  stressAverage: number | null;
  bodyBattery: number | null;
  manualOverride: ReadinessRecommendation | null;
  manualOverrideReason: string | null;
  garminSyncedAt: string | null;
  updatedAt: string;
};

export type DailyCheckInInput = Pick<
  DailyRecoveryRecord,
  | "date"
  | "sleepHours"
  | "hrvMs"
  | "hrvBaselineMs"
  | "restingHeartRate"
  | "restingHeartRateBaseline"
  | "soreness"
  | "subjectiveReadiness"
  | "manualOverride"
  | "manualOverrideReason"
>;

export type GarminRecoveryInput = Partial<
  Omit<
    DailyRecoveryRecord,
    | "date"
    | "source"
    | "soreness"
    | "subjectiveReadiness"
    | "manualOverride"
    | "manualOverrideReason"
    | "updatedAt"
  >
> & {
  date: string;
};

const RECOVERY_KEY = "trainvault_recovery_records_v1";
const RECOVERY_CHANGE_EVENT = "trainvault:recovery-change";
const STORAGE_CHANGE_EVENT = "trainvault:storage-change";
const EMPTY_RECOVERY_RECORDS: DailyRecoveryRecord[] = [];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const recommendations: ReadinessRecommendation[] = [
  "full",
  "adjusted",
  "minimum",
  "rest",
];

let recoveryRaw: string | null | undefined;
let recoverySnapshot: DailyRecoveryRecord[] = EMPTY_RECOVERY_RECORDS;

function canUseStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const bounded = Math.min(maximum, Math.max(minimum, parsed));
  return integer ? Math.round(bounded) : Math.round(bounded * 10) / 10;
}

function nullableText(value: unknown, maximumLength = 240) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text ? text.slice(0, maximumLength) : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

function validIsoDateTime(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    return null;
  }

  return value;
}

export function emptyDailyRecovery(date: string): DailyRecoveryRecord {
  return {
    date,
    source: "manual",
    sleepHours: null,
    sleepScore: null,
    hrvMs: null,
    hrvBaselineMs: null,
    restingHeartRate: null,
    restingHeartRateBaseline: null,
    garminReadiness: null,
    recentLoad7d: null,
    baselineLoad7d: null,
    lowerBodyLoad48h: null,
    runningLoad7d: null,
    highIntensitySessions72h: null,
    soreness: null,
    subjectiveReadiness: null,
    daysSinceRest: null,
    stressAverage: null,
    bodyBattery: null,
    manualOverride: null,
    manualOverrideReason: null,
    garminSyncedAt: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeDailyRecovery(
  value: unknown,
): DailyRecoveryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (!validDate(candidate.date)) {
    return null;
  }

  const source: RecoverySource =
    candidate.source === "garmin" || candidate.source === "mixed"
      ? candidate.source
      : "manual";
  const manualOverride = recommendations.includes(
    candidate.manualOverride as ReadinessRecommendation,
  )
    ? (candidate.manualOverride as ReadinessRecommendation)
    : null;

  return {
    date: candidate.date,
    source,
    sleepHours: finiteNumber(candidate.sleepHours, 0, 24),
    sleepScore: finiteNumber(candidate.sleepScore, 0, 100, true),
    hrvMs: finiteNumber(candidate.hrvMs, 1, 300),
    hrvBaselineMs: finiteNumber(candidate.hrvBaselineMs, 1, 300),
    restingHeartRate: finiteNumber(
      candidate.restingHeartRate,
      20,
      250,
      true,
    ),
    restingHeartRateBaseline: finiteNumber(
      candidate.restingHeartRateBaseline,
      20,
      250,
      true,
    ),
    garminReadiness: finiteNumber(
      candidate.garminReadiness,
      0,
      100,
      true,
    ),
    recentLoad7d: finiteNumber(candidate.recentLoad7d, 0, 100_000),
    baselineLoad7d: finiteNumber(candidate.baselineLoad7d, 0, 100_000),
    lowerBodyLoad48h: finiteNumber(
      candidate.lowerBodyLoad48h,
      0,
      100,
      true,
    ),
    runningLoad7d: finiteNumber(candidate.runningLoad7d, 0, 100_000),
    highIntensitySessions72h: finiteNumber(
      candidate.highIntensitySessions72h,
      0,
      21,
      true,
    ),
    soreness: finiteNumber(candidate.soreness, 0, 10, true),
    subjectiveReadiness: finiteNumber(
      candidate.subjectiveReadiness,
      0,
      10,
      true,
    ),
    daysSinceRest: finiteNumber(candidate.daysSinceRest, 0, 365, true),
    stressAverage: finiteNumber(candidate.stressAverage, 0, 100, true),
    bodyBattery: finiteNumber(candidate.bodyBattery, 0, 100, true),
    manualOverride,
    manualOverrideReason: nullableText(candidate.manualOverrideReason),
    garminSyncedAt: validIsoDateTime(candidate.garminSyncedAt),
    updatedAt:
      validIsoDateTime(candidate.updatedAt) ?? new Date().toISOString(),
  };
}

function subscribeRecovery(callback: () => void) {
  if (!canUseStorage()) {
    return () => {};
  }

  window.addEventListener(RECOVERY_CHANGE_EVENT, callback);
  window.addEventListener(STORAGE_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(RECOVERY_CHANGE_EVENT, callback);
    window.removeEventListener(STORAGE_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getRecoverySnapshot() {
  if (!canUseStorage()) {
    return EMPTY_RECOVERY_RECORDS;
  }

  const raw = window.localStorage.getItem(RECOVERY_KEY);

  if (raw === recoveryRaw) {
    return recoverySnapshot;
  }

  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    recoverySnapshot = Array.isArray(parsed)
      ? parsed
          .map(normalizeDailyRecovery)
          .filter((record): record is DailyRecoveryRecord => Boolean(record))
          .sort((first, second) => second.date.localeCompare(first.date))
      : EMPTY_RECOVERY_RECORDS;
  } catch {
    recoverySnapshot = EMPTY_RECOVERY_RECORDS;
  }

  recoveryRaw = raw;
  return recoverySnapshot;
}

function writeRecoveryRecords(records: DailyRecoveryRecord[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event(RECOVERY_CHANGE_EVENT));
}

function mergedSource(
  existing: DailyRecoveryRecord | null,
  incoming: Exclude<RecoverySource, "mixed">,
) {
  if (!existing || existing.source === incoming) {
    return incoming;
  }

  return "mixed" as const;
}

function saveRecoveryPatch(
  date: string,
  patch: Partial<DailyRecoveryRecord>,
  source: Exclude<RecoverySource, "mixed">,
) {
  if (!validDate(date)) {
    return null;
  }

  const current =
    getRecoverySnapshot().find((record) => record.date === date) ?? null;
  const next = normalizeDailyRecovery({
    ...(current ?? emptyDailyRecovery(date)),
    ...patch,
    date,
    source: mergedSource(current, source),
    updatedAt: new Date().toISOString(),
  });

  if (!next) {
    return null;
  }

  writeRecoveryRecords([
    next,
    ...getRecoverySnapshot().filter((record) => record.date !== date),
  ]);
  return next;
}

export function getRecoveryRecords() {
  return getRecoverySnapshot();
}

export function useRecoveryRecords() {
  return useSyncExternalStore(
    subscribeRecovery,
    getRecoverySnapshot,
    () => EMPTY_RECOVERY_RECORDS,
  );
}

export function getDailyRecovery(date: string) {
  return (
    getRecoverySnapshot().find((record) => record.date === date) ?? null
  );
}

export function useDailyRecovery(date: string) {
  const records = useRecoveryRecords();
  return records.find((record) => record.date === date) ?? null;
}

export function saveDailyCheckIn(input: DailyCheckInInput) {
  return saveRecoveryPatch(input.date, input, "manual");
}

export function toAvailableGarminRecoveryPatch(
  input: GarminRecoveryInput,
): Partial<DailyRecoveryRecord> {
  const availableValues = Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        key !== "date" && value !== null && value !== undefined,
    ),
  ) as Partial<DailyRecoveryRecord>;

  return {
    ...availableValues,
    garminSyncedAt: input.garminSyncedAt ?? new Date().toISOString(),
  };
}

export function saveGarminRecovery(input: GarminRecoveryInput) {
  return saveRecoveryPatch(
    input.date,
    toAvailableGarminRecoveryPatch(input),
    "garmin",
  );
}

export function removeDailyRecovery(date: string) {
  if (!canUseStorage()) {
    return;
  }

  writeRecoveryRecords(
    getRecoverySnapshot().filter((record) => record.date !== date),
  );
}

export function recoverySignalCount(
  record: DailyRecoveryRecord | null | undefined,
) {
  if (!record) {
    return 0;
  }

  return [
    record.sleepHours ?? record.sleepScore,
    record.hrvMs != null && record.hrvBaselineMs != null
      ? record.hrvMs
      : null,
    record.restingHeartRate != null &&
    record.restingHeartRateBaseline != null
      ? record.restingHeartRate
      : null,
    record.garminReadiness,
    record.recentLoad7d != null && record.baselineLoad7d != null
      ? record.recentLoad7d
      : null,
    record.lowerBodyLoad48h,
    record.highIntensitySessions72h,
    record.soreness,
    record.subjectiveReadiness,
    record.daysSinceRest,
  ].filter((value) => value !== null && value !== undefined).length;
}

export function toDailyRecoveryInput(
  record: DailyRecoveryRecord | null,
  derived: Partial<DailyRecoveryInput> = {},
): DailyRecoveryInput {
  return {
    date: record?.date ?? derived.date ?? "",
    sleepHours: record?.sleepHours,
    sleepScore: record?.sleepScore,
    hrvMs: record?.hrvMs,
    hrvBaselineMs: record?.hrvBaselineMs,
    restingHeartRate: record?.restingHeartRate,
    restingHeartRateBaseline: record?.restingHeartRateBaseline,
    garminReadiness: record?.garminReadiness,
    recentLoad7d: record?.recentLoad7d ?? derived.recentLoad7d,
    baselineLoad7d: record?.baselineLoad7d ?? derived.baselineLoad7d,
    lowerBodyLoad48h:
      record?.lowerBodyLoad48h ?? derived.lowerBodyLoad48h,
    highIntensitySessions72h:
      record?.highIntensitySessions72h ??
      derived.highIntensitySessions72h,
    soreness: record?.soreness,
    subjectiveReadiness: record?.subjectiveReadiness,
    daysSinceRest: record?.daysSinceRest,
    upcomingEventDays: derived.upcomingEventDays,
    upcomingEventPriority: derived.upcomingEventPriority,
    manualOverride: record?.manualOverride,
    manualOverrideReason: record?.manualOverrideReason,
  };
}
