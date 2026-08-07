"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Send,
  Watch,
} from "lucide-react";
import type {
  GarminSyncState,
  StructuredRunningWorkout,
} from "@/lib/garmin";
import {
  saveGarminWorkoutSync,
  useGarminLocalState,
  type GarminWorkoutSyncRecord,
} from "@/lib/garmin-storage";

type GarminDevice = {
  deviceId: string | null;
  userDeviceId: string | null;
  displayName: string | null;
  model: string | null;
  primary: boolean | null;
};

type GarminSessionActionsProps = {
  sessionId: string;
  scheduledDate?: string | null;
  structuredWorkout?: StructuredRunningWorkout | null;
  prescriptionMatchesStructuredWorkout?: boolean;
};

const stateLabels: Record<GarminSyncState, string> = {
  not_sent: "Not sent",
  syncing: "Syncing",
  scheduled: "Scheduled",
  sent_to_device: "Sent to device",
  error: "Error",
};

const STALE_SYNC_AFTER_MS = 2 * 60 * 1_000;
const STRUCTURED_SIGNATURES_KEY = "trainvault_garmin_structured_signatures_v1";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeError(value: unknown, fallback: string) {
  if (!isObject(value) || typeof value.error !== "string") return fallback;
  return value.error.slice(0, 300);
}

function safeWarning(value: unknown) {
  if (!isObject(value) || typeof value.replacementWarning !== "string") return "";
  return value.replacementWarning.slice(0, 400);
}

function responseRecord(
  value: unknown,
  fallback: GarminWorkoutSyncRecord,
): GarminWorkoutSyncRecord | null {
  if (!isObject(value)) return null;

  const state = value.state;
  if (state !== "scheduled" && state !== "sent_to_device" && state !== "error") {
    return null;
  }

  const failedStage =
    value.failedStage === "upload" ||
    value.failedStage === "schedule" ||
    value.failedStage === "push"
      ? value.failedStage
      : undefined;

  return {
    sessionId: fallback.sessionId,
    scheduledDate: fallback.scheduledDate,
    state,
    garminWorkoutId:
      typeof value.garminWorkoutId === "string"
        ? value.garminWorkoutId
        : fallback.garminWorkoutId,
    workoutScheduleId:
      typeof value.workoutScheduleId === "string"
        ? value.workoutScheduleId
        : fallback.workoutScheduleId,
    deviceId:
      typeof value.deviceId === "string" ? value.deviceId : fallback.deviceId,
    ...(failedStage ? { failedStage } : {}),
    ...(state === "error"
      ? { error: safeError(value, "The Garmin operation failed.") }
      : {}),
    updatedAt: new Date().toISOString(),
  };
}

function stateClasses(state: GarminSyncState) {
  if (state === "scheduled" || state === "sent_to_device") {
    return "border-[var(--accent)] bg-[rgba(215,255,47,0.1)] text-[var(--accent)]";
  }
  if (state === "error") {
    return "border-red-400/45 bg-red-400/10 text-red-300";
  }
  return "border-[var(--border)] bg-black text-[var(--muted)]";
}

function structuredWorkoutSignature(workout: StructuredRunningWorkout) {
  const raw = JSON.stringify({
    name: workout.name,
    date: workout.date ?? null,
    description: workout.description ?? null,
    estimatedDurationSeconds: workout.estimatedDurationSeconds ?? null,
    steps: workout.steps,
  });
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${raw.length}:${(hash >>> 0).toString(16)}`;
}

function readSyncedSignature(sessionId: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STRUCTURED_SIGNATURES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    return typeof parsed[sessionId] === "string" ? parsed[sessionId] : null;
  } catch {
    return null;
  }
}

function writeSyncedSignature(sessionId: string, signature: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STRUCTURED_SIGNATURES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const signatures = isObject(parsed) ? parsed : {};
    window.localStorage.setItem(
      STRUCTURED_SIGNATURES_KEY,
      JSON.stringify({ ...signatures, [sessionId]: signature }),
    );
  } catch {
    // Signature tracking improves replacement UX but is not required for delivery.
  }
}

export default function GarminSessionActions({
  sessionId,
  scheduledDate,
  structuredWorkout,
  prescriptionMatchesStructuredWorkout = true,
}: GarminSessionActionsProps) {
  const garmin = useGarminLocalState();
  const record = garmin.workoutSync[sessionId];
  const scheduleChanged = Boolean(
    record && scheduledDate && record.scheduledDate !== scheduledDate,
  );
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const recordUpdatedAt = record ? Date.parse(record.updatedAt) : Number.NaN;
  const staleSyncing =
    record?.state === "syncing" &&
    (!Number.isFinite(recordUpdatedAt) ||
      currentTime - recordUpdatedAt >= STALE_SYNC_AFTER_MS);
  const state: GarminSyncState = staleSyncing
    ? "error"
    : record?.state ?? "not_sent";

  const [pushToDevice, setPushToDevice] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [devices, setDevices] = useState<GarminDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [operationNotice, setOperationNotice] = useState("");
  const [syncedSignature, setSyncedSignature] = useState<string | null>(null);

  const hasPrescription =
    Boolean(structuredWorkout) && (structuredWorkout?.steps.length ?? 0) > 0;
  const currentSignature = useMemo(
    () => (structuredWorkout ? structuredWorkoutSignature(structuredWorkout) : null),
    [structuredWorkout],
  );
  const hasExistingScheduledWorkout = Boolean(
    record?.garminWorkoutId &&
      record?.workoutScheduleId &&
      (state === "scheduled" || state === "sent_to_device"),
  );
  const signatureChanged = Boolean(
    hasExistingScheduledWorkout &&
      currentSignature &&
      syncedSignature &&
      currentSignature !== syncedSignature,
  );
  const unverifiedPrescriptionChange = Boolean(
    hasExistingScheduledWorkout &&
      !prescriptionMatchesStructuredWorkout &&
      currentSignature !== syncedSignature,
  );
  const requiresInitialConfirmation = Boolean(
    !hasExistingScheduledWorkout &&
      hasPrescription &&
      !prescriptionMatchesStructuredWorkout,
  );
  const needsReplacement =
    scheduleChanged || signatureChanged || unverifiedPrescriptionChange;
  const canPushExisting = Boolean(
    hasExistingScheduledWorkout &&
      !needsReplacement &&
      pushToDevice &&
      state === "scheduled",
  );
  const canInitialSend = Boolean(
    !hasExistingScheduledWorkout && state !== "syncing",
  );
  const canRetry = state === "error" && hasPrescription;
  const canSend =
    Boolean(scheduledDate) &&
    hasPrescription &&
    state !== "syncing" &&
    (needsReplacement || canPushExisting || canInitialSend || canRetry);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setSyncedSignature(readSyncedSignature(sessionId)),
      0,
    );
    return () => window.clearTimeout(timeoutId);
  }, [sessionId]);

  useEffect(() => {
    if (
      !currentSignature ||
      syncedSignature ||
      !hasExistingScheduledWorkout ||
      !prescriptionMatchesStructuredWorkout ||
      scheduleChanged
    ) {
      return;
    }

    writeSyncedSignature(sessionId, currentSignature);
    const timeoutId = window.setTimeout(
      () => setSyncedSignature(currentSignature),
      0,
    );
    return () => window.clearTimeout(timeoutId);
  }, [
    currentSignature,
    hasExistingScheduledWorkout,
    prescriptionMatchesStructuredWorkout,
    scheduleChanged,
    sessionId,
    syncedSignature,
  ]);

  useEffect(() => {
    if (record?.state !== "syncing" || !Number.isFinite(recordUpdatedAt)) return;
    const remaining = Math.max(
      0,
      recordUpdatedAt + STALE_SYNC_AFTER_MS - Date.now(),
    );
    const timeoutId = window.setTimeout(
      () => setCurrentTime(Date.now()),
      remaining + 50,
    );
    return () => window.clearTimeout(timeoutId);
  }, [record?.state, record?.updatedAt, recordUpdatedAt]);

  async function loadDevices() {
    if (devicesLoading || devices.length > 0) return;
    setDevicesLoading(true);
    setDeviceError("");

    try {
      const response = await fetch("/api/garmin/devices", { cache: "no-store" });
      const value = (await response.json()) as unknown;
      if (!response.ok || !isObject(value) || !Array.isArray(value.devices)) {
        throw new Error(safeError(value, "Garmin devices could not be loaded."));
      }

      const parsedDevices = value.devices.filter(
        (device): device is GarminDevice =>
          isObject(device) &&
          (device.userDeviceId === null || typeof device.userDeviceId === "string") &&
          (device.displayName === null || typeof device.displayName === "string"),
      );
      setDevices(parsedDevices);
      const primary = parsedDevices.find(
        (device) => device.primary && device.userDeviceId,
      );
      if (primary?.userDeviceId) setSelectedDeviceId(primary.userDeviceId);
    } catch (error) {
      setDeviceError(
        error instanceof Error
          ? error.message
          : "Garmin devices could not be loaded.",
      );
    } finally {
      setDevicesLoading(false);
    }
  }

  async function handleSend() {
    if (!structuredWorkout || !scheduledDate || !canSend) return;

    if (
      requiresInitialConfirmation &&
      !window.confirm(
        "TrainVault cannot prove that the current prescription and stored Garmin work order came from the same edit.\n\nThe structured steps visible on this page are exactly what will be sent to Garmin. Send those reviewed steps now?",
      )
    ) {
      return;
    }

    if (
      needsReplacement &&
      !window.confirm(
        scheduleChanged
          ? `This workout is still scheduled in Garmin for ${record?.scheduledDate}. Replace it with the version scheduled for ${scheduledDate}?\n\nTrainVault will create the new calendar entry first, then remove the old Garmin schedule and workout template.`
          : "Replace the workout already scheduled in Garmin with the structured steps shown on this page?\n\nTrainVault will upload and schedule the new version first, then remove the old Garmin calendar entry and workout template. Your previous TrainVault prescription remains in history.",
      )
    ) {
      return;
    }

    setOperationNotice("");
    const retryIds = {
      garminWorkoutId: record?.garminWorkoutId ?? null,
      workoutScheduleId: record?.workoutScheduleId ?? null,
    };
    const syncingRecord: GarminWorkoutSyncRecord = {
      sessionId,
      state: "syncing",
      scheduledDate,
      garminWorkoutId: retryIds.garminWorkoutId,
      workoutScheduleId: retryIds.workoutScheduleId,
      deviceId: selectedDeviceId || record?.deviceId || null,
      updatedAt: new Date().toISOString(),
    };
    saveGarminWorkoutSync(syncingRecord);

    try {
      const response = await fetch("/api/garmin/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          scheduledDate,
          workout: structuredWorkout,
          pushToDevice,
          replaceExisting: needsReplacement,
          deviceId: selectedDeviceId || null,
          ...retryIds,
        }),
      });
      const value = (await response.json()) as unknown;
      const nextRecord = responseRecord(value, syncingRecord);
      if (!nextRecord) {
        throw new Error(safeError(value, "Garmin returned an unexpected response."));
      }

      saveGarminWorkoutSync(nextRecord);
      if (nextRecord.state === "scheduled" || nextRecord.state === "sent_to_device") {
        if (currentSignature) {
          writeSyncedSignature(sessionId, currentSignature);
          setSyncedSignature(currentSignature);
        }
        const warning = safeWarning(value);
        setOperationNotice(
          warning ||
            (needsReplacement
              ? "Garmin now has the updated structured workout. The previous scheduled version was cleaned up."
              : nextRecord.state === "sent_to_device"
                ? "Garmin accepted the workout for the selected device."
                : "Workout is scheduled in Garmin Connect."),
        );
      }
    } catch (error) {
      saveGarminWorkoutSync({
        ...syncingRecord,
        state: "error",
        error:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "The Garmin operation failed.",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const buttonLabel = needsReplacement
    ? scheduleChanged
      ? "Reschedule Garmin"
      : "Update Garmin"
    : state === "error"
      ? "Retry Garmin"
      : state === "scheduled" && pushToDevice
        ? "Send to device"
        : state === "scheduled"
          ? "Already scheduled"
          : state === "sent_to_device"
            ? "Already sent to device"
            : state === "syncing"
              ? "Syncing"
              : "Send to Garmin";

  return (
    <section className="tv-card border-[rgba(215,255,47,0.3)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Garmin</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Structured run delivery</h2>
        </div>
        <span
          className={`inline-flex min-h-9 items-center gap-2 rounded-sm border px-3 text-xs font-black uppercase ${stateClasses(state)}`}
          aria-live="polite"
        >
          {state === "syncing" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : state === "scheduled" || state === "sent_to_device" ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : state === "error" ? (
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Watch className="h-4 w-4" aria-hidden="true" />
          )}
          {stateLabels[state]}
        </span>
      </div>

      {!scheduledDate ? (
        <p className="mt-3 text-sm font-bold text-amber-200">
          Schedule this session on the Plan calendar before sending it.
        </p>
      ) : null}

      {!hasPrescription ? (
        <p className="mt-3 text-sm font-bold text-amber-200">
          This session has no explicit Garmin steps. Add a structured warm-up,
          work/repeat, recovery, and cooldown prescription; TrainVault will not
          guess intervals from free text.
        </p>
      ) : (
        <p className="mt-3 text-sm font-bold text-[var(--muted)]">
          {structuredWorkout?.steps.length} structured element
          {structuredWorkout?.steps.length === 1 ? "" : "s"} will be uploaded
          and scheduled for {scheduledDate}.
        </p>
      )}

      {scheduleChanged ? (
        <div className="mt-3 rounded-md border border-amber-300/45 bg-amber-300/10 p-3 text-sm font-bold text-amber-100" role="alert">
          <p>
            TrainVault moved this session to {scheduledDate}, but Garmin still
            has the previous calendar entry for {record?.scheduledDate}.
          </p>
          <p className="mt-2 text-xs text-amber-100/80">
            Reschedule Garmin will replace the old calendar entry rather than creating a duplicate workout.
          </p>
        </div>
      ) : null}

      {hasPrescription && !prescriptionMatchesStructuredWorkout ? (
        <div className="mt-3 rounded-md border border-amber-300/45 bg-amber-300/10 p-3 text-sm font-bold text-amber-100" role="alert">
          <p>
            TrainVault cannot prove that the selected prescription and the stored
            structured Garmin steps are identical. Review the Garmin-ready steps
            shown immediately above before sending them.
          </p>
          {!hasExistingScheduledWorkout ? (
            <p className="mt-2 text-xs text-amber-100/80">
              This no longer blocks a first send. TrainVault will ask you to confirm
              the displayed work order before Garmin receives it.
            </p>
          ) : needsReplacement ? (
            <p className="mt-2 text-xs text-amber-100/80">
              Garmin already has an older scheduled version. Update Garmin will
              replace that calendar entry instead of silently creating another one.
            </p>
          ) : syncedSignature === currentSignature ? (
            <p className="mt-2 text-xs text-amber-100/80">
              This exact structured version has already been synced to Garmin.
            </p>
          ) : null}
        </div>
      ) : null}

      {state === "scheduled" && !needsReplacement ? (
        <p className="mt-3 rounded-md border border-[var(--border)] bg-black/50 p-3 text-xs font-bold text-[var(--muted)]">
          This workout is already in Garmin Connect. To send it directly to your
          watch now, tick <span className="text-[var(--text)]">Also push to a device</span> below.
        </p>
      ) : null}

      <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] bg-black px-3 text-sm font-black uppercase">
        <input
          type="checkbox"
          checked={pushToDevice}
          onChange={(event) => {
            const checked = event.target.checked;
            setPushToDevice(checked);
            if (checked) void loadDevices();
          }}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Also push to a device
      </label>

      {pushToDevice ? (
        <div className="mt-3 grid gap-2">
          <label className="grid gap-2">
            <span className="tv-label">Garmin device</span>
            <select
              className="tv-input"
              value={selectedDeviceId}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
              disabled={devicesLoading}
            >
              <option value="">
                {devicesLoading ? "Loading devices…" : "Garmin last-used device"}
              </option>
              {devices.map((device) =>
                device.userDeviceId ? (
                  <option key={device.userDeviceId} value={device.userDeviceId}>
                    {device.displayName || device.model || `Device ${device.userDeviceId}`}
                    {device.primary ? " · primary" : ""}
                  </option>
                ) : null,
              )}
            </select>
          </label>
          {deviceError ? (
            <p className="text-xs font-bold text-amber-200">
              {deviceError} You can still use Garmin&apos;s last-used device.
            </p>
          ) : null}
        </div>
      ) : null}

      {record?.error ? (
        <p className="mt-3 rounded-md border border-red-400/35 bg-red-400/10 p-3 text-sm font-bold text-red-200" role="alert">
          {record.error}
          {record.garminWorkoutId ? (
            <span className="mt-1 block text-xs text-red-100/70">
              The captured Garmin workout ID is retained for a safe retry.
            </span>
          ) : null}
        </p>
      ) : null}

      {operationNotice ? (
        <p className="mt-3 rounded-md border border-[rgba(215,255,47,0.35)] bg-[rgba(215,255,47,0.08)] p-3 text-xs font-bold text-[var(--text)]">
          {operationNotice}
        </p>
      ) : null}

      {staleSyncing ? (
        <p className="mt-3 rounded-md border border-amber-300/45 bg-amber-300/10 p-3 text-sm font-bold text-amber-100" role="alert">
          The previous Garmin request was interrupted before TrainVault received a
          final result. Retry is available; any captured Garmin IDs will be reused.
        </p>
      ) : null}

      {record?.garminWorkoutId ? (
        <p className="mt-3 text-xs font-bold text-[var(--muted)]">
          Garmin workout {record.garminWorkoutId}
          {record.workoutScheduleId ? ` · schedule ${record.workoutScheduleId}` : ""}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={!canSend}
        className="tv-button-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
      >
        {state === "syncing" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : needsReplacement ? (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Send className="h-4 w-4" aria-hidden="true" />
        )}
        {buttonLabel}
      </button>
    </section>
  );
}
