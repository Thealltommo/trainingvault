"use client";

import { useSyncExternalStore } from "react";
import {
  applyWorkoutOverride,
  deleteWorkoutOverride,
  getAllWorkouts,
  getWorkoutOverride,
  saveWorkoutOverride,
} from "@/lib/storage";
import type {
  Programme,
  SessionLog,
  Workout,
  WorkoutIntensity,
  WorkoutOverride,
} from "@/lib/types";
import {
  getStructuredRunningWorkout,
  saveStructuredRunningWorkout,
  updateStructuredRunningWorkoutDate,
} from "@/lib/structured-running-storage";

export const athleteSessionTypes = [
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
] as const;

export type AthleteSessionType = (typeof athleteSessionTypes)[number];
export type SessionVariantId = "full" | "adjusted" | "minimum";
export type SessionDisplayStatus = "planned" | "completed" | "skipped" | "modified";

export type SessionVariantRecord = {
  id: SessionVariantId;
  label: string;
  reason: string;
  prescription: Workout;
};

export type ManualSessionRecord = {
  id: string;
  type: AthleteSessionType;
  scheduledDate: string;
  originalWorkout: Workout;
  variants: Record<SessionVariantId, SessionVariantRecord>;
  selectedVariant: SessionVariantId;
  createdAt: string;
  updatedAt: string;
};

export type SessionLifecycleOverride = {
  status: "skipped" | "deleted";
  reason?: string;
  updatedAt: string;
};

export type CalendarSession = {
  id: string;
  source: "programme" | "manual";
  type: AthleteSessionType;
  scheduledDate: string;
  status: SessionDisplayStatus;
  workout: Workout;
  originalWorkout: Workout;
  selectedVariant: SessionVariantId;
  modificationReason?: string;
};

type ManualSessionInput = {
  title: string;
  type: AthleteSessionType;
  scheduledDate: string;
  durationMinutes: number;
  minimumMinutes?: number;
  intensity: WorkoutIntensity;
  prescription: string;
  targetStimulus?: string;
};

const MANUAL_SESSIONS_KEY = "trainvault_manual_sessions_v1";
const LIFECYCLE_KEY = "trainvault_session_lifecycle_v1";
const PLANNING_CHANGE_EVENT = "trainvault:planning-change";
const EMPTY_MANUAL_SESSIONS: ManualSessionRecord[] = [];
const EMPTY_LIFECYCLE: Record<string, SessionLifecycleOverride> = {};
let manualRaw: string | null | undefined;
let manualSnapshot: ManualSessionRecord[] = EMPTY_MANUAL_SESSIONS;
let lifecycleRaw: string | null | undefined;
let lifecycleSnapshot: Record<string, SessionLifecycleOverride> = EMPTY_LIFECYCLE;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function notifyPlanningChange() {
  window.dispatchEvent(new Event(PLANNING_CHANGE_EVENT));
}

function subscribePlanning(callback: () => void) {
  if (!canUseStorage()) {
    return () => {};
  }

  window.addEventListener(PLANNING_CHANGE_EVENT, callback);
  window.addEventListener("trainvault:storage-change", callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(PLANNING_CHANGE_EVENT, callback);
    window.removeEventListener("trainvault:storage-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function readManualSessionSnapshot() {
  if (!canUseStorage()) {
    return EMPTY_MANUAL_SESSIONS;
  }

  const raw = window.localStorage.getItem(MANUAL_SESSIONS_KEY);

  if (raw === manualRaw) {
    return manualSnapshot;
  }

  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    manualSnapshot = Array.isArray(parsed) ? (parsed as ManualSessionRecord[]) : EMPTY_MANUAL_SESSIONS;
  } catch {
    manualSnapshot = EMPTY_MANUAL_SESSIONS;
  }

  manualRaw = raw;
  return manualSnapshot;
}

function readLifecycleSnapshot() {
  if (!canUseStorage()) {
    return EMPTY_LIFECYCLE;
  }

  const raw = window.localStorage.getItem(LIFECYCLE_KEY);

  if (raw === lifecycleRaw) {
    return lifecycleSnapshot;
  }

  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    lifecycleSnapshot =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, SessionLifecycleOverride>)
        : EMPTY_LIFECYCLE;
  } catch {
    lifecycleSnapshot = EMPTY_LIFECYCLE;
  }

  lifecycleRaw = raw;
  return lifecycleSnapshot;
}

function writeManualSessions(sessions: ManualSessionRecord[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(MANUAL_SESSIONS_KEY, JSON.stringify(sessions));
  notifyPlanningChange();
}

function writeLifecycle(overrides: Record<string, SessionLifecycleOverride>) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LIFECYCLE_KEY, JSON.stringify(overrides));
  notifyPlanningChange();
}

function cloneWorkout(workout: Workout): Workout {
  return {
    ...workout,
    focus: [...workout.focus],
    equipment: [...workout.equipment],
    blocks: workout.blocks.map((block) => ({
      ...block,
      items: [...block.items],
    })),
  };
}

function athleteTypeToLegacyCategory(type: AthleteSessionType): Workout["category"] {
  switch (type) {
    case "strength":
      return "strength";
    case "run":
    case "fell-trail":
    case "hike":
    case "race":
      return "track";
    case "mobility":
    case "recovery":
    case "rest":
      return "recovery";
    case "crossfit":
    case "hyrox":
      return "hybrid";
    case "conditioning":
      return "conditioning";
    default:
      return "hybrid";
  }
}

function legacyWorkoutToAthleteType(workout: Workout): AthleteSessionType {
  const signal = `${workout.sessionType ?? ""} ${workout.title} ${workout.focus.join(" ")}`.toLowerCase();

  if (signal.includes("hyrox")) return "hyrox";
  if (signal.includes("hawkeye") || signal.includes("crossfit") || signal.includes("metcon")) return "crossfit";
  if (signal.includes("fell") || signal.includes("trail") || signal.includes("mountain")) return "fell-trail";
  if (signal.includes("hike") || signal.includes("walk")) return "hike";
  if (signal.includes("race") || signal.includes("spartan")) return "race";
  if (signal.includes("mobility")) return "mobility";
  if (signal.includes("rest")) return "rest";
  if (workout.category === "track" || signal.includes("run") || signal.includes("tempo") || signal.includes("threshold")) {
    return "run";
  }
  if (workout.category === "strength") return "strength";
  if (workout.category === "conditioning") return "conditioning";
  if (workout.category === "recovery") return "recovery";

  return "custom";
}

function buildVariants(workout: Workout): Record<SessionVariantId, SessionVariantRecord> {
  const full = cloneWorkout(workout);
  const adjustedMinutes = Math.max(
    workout.minimumMinutes ?? 15,
    Math.round(workout.durationMinutes * 0.75),
  );
  const minimumMinutes = Math.max(
    10,
    Math.min(workout.minimumMinutes ?? Math.round(workout.durationMinutes * 0.5), workout.durationMinutes),
  );
  const adjusted = {
    ...cloneWorkout(workout),
    durationMinutes: adjustedMinutes,
    scalingNotes:
      workout.scalingNotes ||
      "Reduce volume while preserving the planned movement quality and primary stimulus.",
  };
  const minimum = {
    ...cloneWorkout(workout),
    durationMinutes: minimumMinutes,
    minimumMinutes,
    scalingNotes:
      workout.scalingNotes ||
      "Complete the warm-up and smallest useful dose of the primary stimulus. Stop if symptoms worsen.",
  };

  return {
    full: {
      id: "full",
      label: "Full",
      reason: "Normal intended training stimulus.",
      prescription: full,
    },
    adjusted: {
      id: "adjusted",
      label: "Adjusted",
      reason: "Preserves the intent with lower training cost.",
      prescription: adjusted,
    },
    minimum: {
      id: "minimum",
      label: "Minimum",
      reason: "Smallest useful version for low recovery or limited time.",
      prescription: minimum,
    },
  };
}

export function createManualSession(input: ManualSessionInput): ManualSessionRecord {
  const now = new Date().toISOString();
  const id = `manual-${crypto.randomUUID()}`;
  const items = input.prescription
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const workout: Workout = {
    id,
    title: input.title.trim() || "Manual session",
    category: athleteTypeToLegacyCategory(input.type),
    durationMinutes: Math.max(1, Math.round(input.durationMinutes)),
    minimumMinutes: input.minimumMinutes,
    intensity: input.intensity,
    sessionType: input.type,
    date: input.scheduledDate,
    prescribedLoadsOrPace: input.prescription.trim() || undefined,
    targetStimulus: input.targetStimulus?.trim() || undefined,
    focus: [input.type],
    equipment: [],
    blocks: [
      {
        name: input.type === "rest" ? "Recovery" : "Main session",
        type:
          input.type === "run" || input.type === "fell-trail" || input.type === "race"
            ? "intervals"
            : input.type === "strength"
              ? "strength"
              : input.type === "mobility" || input.type === "recovery" || input.type === "rest"
                ? "cooldown"
                : "conditioning",
        durationMinutes: Math.max(1, Math.round(input.durationMinutes)),
        items: items.length > 0 ? items : [input.type === "rest" ? "Rest day" : "Add session details"],
      },
    ],
  };

  return {
    id,
    type: input.type,
    scheduledDate: input.scheduledDate,
    originalWorkout: workout,
    variants: buildVariants(workout),
    selectedVariant: "full",
    createdAt: now,
    updatedAt: now,
  };
}

export function getManualSessions() {
  return readManualSessionSnapshot();
}

export function useManualSessions() {
  return useSyncExternalStore(subscribePlanning, readManualSessionSnapshot, () => EMPTY_MANUAL_SESSIONS);
}

export function useSessionLifecycleOverrides() {
  return useSyncExternalStore(subscribePlanning, readLifecycleSnapshot, () => EMPTY_LIFECYCLE);
}

export function getSessionLifecycleOverrides() {
  return readLifecycleSnapshot();
}

export function saveManualSession(session: ManualSessionRecord) {
  const sessions = getManualSessions().filter((candidate) => candidate.id !== session.id);
  writeManualSessions([{ ...session, updatedAt: new Date().toISOString() }, ...sessions]);
}

export function getManualSession(id: string) {
  return getManualSessions().find((session) => session.id === id) ?? null;
}

export function archiveSession(id: string, reason = "Removed from plan") {
  writeLifecycle({
    ...readLifecycleSnapshot(),
    [id]: {
      status: "deleted",
      reason,
      updatedAt: new Date().toISOString(),
    },
  });
}

export function skipSession(id: string, reason?: string) {
  writeLifecycle({
    ...readLifecycleSnapshot(),
    [id]: {
      status: "skipped",
      reason: reason?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    },
  });
}

export function restoreSessionLifecycle(id: string) {
  const current = readLifecycleSnapshot();

  if (!current[id]) {
    return;
  }

  const next = { ...current };
  delete next[id];
  writeLifecycle(next);
}

export function selectManualSessionVariant(id: string, variant: SessionVariantId, reason: string) {
  const session = getManualSession(id);

  if (!session) {
    return;
  }

  const selected = session.variants[variant];
  saveManualSession({
    ...session,
    selectedVariant: variant,
  });

  if (variant === "full") {
    const current = getWorkoutOverride(id);

    if (current?.date || current?.title || current?.intensity) {
      saveWorkoutOverride({
        workoutId: id,
        date: current.date,
        title: current.title,
        intensity: current.intensity,
        modificationReason: reason,
        updatedAt: new Date().toISOString(),
      });
    } else {
      deleteWorkoutOverride(id);
    }

    return;
  }

  saveWorkoutOverride({
    workoutId: id,
    durationMinutes: selected.prescription.durationMinutes,
    minimumMinutes: selected.prescription.minimumMinutes,
    blocks: selected.prescription.blocks,
    scalingNotes: selected.prescription.scalingNotes,
    modificationReason: reason || selected.reason,
    updatedAt: new Date().toISOString(),
  });
}

export function selectCalendarSessionVariant(
  session: CalendarSession,
  variant: SessionVariantId,
  reason: string,
) {
  if (session.source === "manual") {
    selectManualSessionVariant(session.id, variant, reason);
    return;
  }

  const current = getWorkoutOverride(session.id);

  if (variant === "full") {
    const retained: WorkoutOverride = {
      workoutId: session.id,
      date: current?.date,
      title: current?.title,
      intensity: current?.intensity,
      focus: current?.focus,
      equipment: current?.equipment,
      prescribedLoadsOrPace: current?.prescribedLoadsOrPace,
      targetStimulus: current?.targetStimulus,
      modificationReason: reason,
      updatedAt: new Date().toISOString(),
    };
    const hasRetainedChange = Boolean(
      retained.date ||
        retained.title ||
        retained.intensity ||
        retained.focus ||
        retained.equipment ||
        retained.prescribedLoadsOrPace ||
        retained.targetStimulus,
    );

    if (hasRetainedChange) {
      saveWorkoutOverride(retained);
    } else {
      deleteWorkoutOverride(session.id);
    }

    return;
  }

  const selected = buildVariants(session.originalWorkout)[variant];
  saveWorkoutOverride({
    ...(current ?? { workoutId: session.id, updatedAt: "" }),
    workoutId: session.id,
    durationMinutes: selected.prescription.durationMinutes,
    minimumMinutes: selected.prescription.minimumMinutes,
    blocks: selected.prescription.blocks,
    scalingNotes: selected.prescription.scalingNotes,
    modificationReason: reason || selected.reason,
    updatedAt: new Date().toISOString(),
  });
}

export function rescheduleCalendarSession(session: CalendarSession, scheduledDate: string) {
  if (!scheduledDate) {
    return;
  }

  if (session.source === "manual") {
    const manual = getManualSession(session.id);

    if (!manual) {
      return;
    }

    const originalWorkout = {
      ...manual.originalWorkout,
      date: scheduledDate,
    };
    const variants = buildVariants(originalWorkout);
    saveManualSession({
      ...manual,
      scheduledDate,
      originalWorkout,
      variants,
    });
    updateStructuredRunningWorkoutDate(session.id, scheduledDate);
    return;
  }

  const current = getWorkoutOverride(session.id);
  saveWorkoutOverride({
    ...(current ?? { workoutId: session.id, updatedAt: "" }),
    workoutId: session.id,
    date: scheduledDate,
    modificationReason: current?.modificationReason ?? "Rescheduled in Plan",
    updatedAt: new Date().toISOString(),
  });
  updateStructuredRunningWorkoutDate(session.id, scheduledDate);
}

export function duplicateCalendarSession(session: CalendarSession, scheduledDate = session.scheduledDate) {
  const copy = createManualSession({
    title: `${session.workout.title} copy`,
    type: session.type,
    scheduledDate,
    durationMinutes: session.workout.durationMinutes,
    minimumMinutes: session.workout.minimumMinutes,
    intensity: session.workout.intensity,
    prescription:
      session.workout.prescribedLoadsOrPace ||
      session.workout.blocks.flatMap((block) => block.items).join("\n"),
    targetStimulus: session.workout.targetStimulus,
  });
  saveManualSession(copy);
  const structured = getStructuredRunningWorkout(session.id);

  if (structured) {
    saveStructuredRunningWorkout({
      ...structured,
      id: copy.id,
      name: copy.originalWorkout.title,
      date: scheduledDate,
    });
  }

  return copy;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getProgrammeWorkoutDate(programme: Programme, weekIndex: number, dayNumber: number) {
  if (!programme.startDate) {
    return "";
  }

  const start = new Date(`${programme.startDate}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    return "";
  }

  start.setDate(start.getDate() + weekIndex * 7 + Math.max(0, dayNumber - 1));
  return localDateKey(start);
}

export function getCalendarSessions(
  programme: Programme | null,
  manualSessions: ManualSessionRecord[],
  logs: SessionLog[],
  overrides: Record<string, WorkoutOverride>,
  lifecycle: Record<string, SessionLifecycleOverride>,
) {
  const completedIds = new Set(logs.map((log) => log.workoutId));
  const programmeSessions: CalendarSession[] = [];

  programme?.weeks.forEach((week, weekIndex) => {
    week.days.forEach((day) => {
      const originalWorkout = day.workout;
      const override = overrides[originalWorkout.id];
      const workout = applyWorkoutOverride(originalWorkout, override);
      const lifecycleOverride = lifecycle[workout.id];

      if (lifecycleOverride?.status === "deleted") {
        return;
      }

      programmeSessions.push({
        id: workout.id,
        source: "programme",
        type: legacyWorkoutToAthleteType(workout),
        scheduledDate:
          workout.date || getProgrammeWorkoutDate(programme, weekIndex, day.dayNumber),
        status: completedIds.has(workout.id)
          ? "completed"
          : lifecycleOverride?.status === "skipped"
            ? "skipped"
            : override
              ? "modified"
              : "planned",
        workout,
        originalWorkout,
        selectedVariant:
          override?.minimumMinutes && override.durationMinutes === override.minimumMinutes
            ? "minimum"
            : override
              ? "adjusted"
              : "full",
        modificationReason: override?.modificationReason || lifecycleOverride?.reason,
      });
    });
  });

  const localSessions = manualSessions.flatMap<CalendarSession>((manual) => {
    const lifecycleOverride = lifecycle[manual.id];

    if (lifecycleOverride?.status === "deleted") {
      return [];
    }

    const originalWorkout = manual.variants[manual.selectedVariant]?.prescription ?? manual.originalWorkout;
    const override = overrides[manual.id];
    const workout = applyWorkoutOverride(originalWorkout, override);

    return [
      {
        id: manual.id,
        source: "manual",
        type: manual.type,
        scheduledDate: workout.date || manual.scheduledDate,
        status: completedIds.has(manual.id)
          ? "completed"
          : lifecycleOverride?.status === "skipped"
            ? "skipped"
            : manual.selectedVariant !== "full" || override
              ? "modified"
              : "planned",
        workout,
        originalWorkout: manual.originalWorkout,
        selectedVariant: manual.selectedVariant,
        modificationReason: override?.modificationReason || lifecycleOverride?.reason,
      },
    ];
  });

  return [...programmeSessions, ...localSessions].sort((first, second) => {
    if (!first.scheduledDate) return 1;
    if (!second.scheduledDate) return -1;
    return first.scheduledDate.localeCompare(second.scheduledDate);
  });
}

export function getAllPlanningWorkouts(programme: Programme | null) {
  return [
    ...(programme ? getAllWorkouts(programme) : []),
    ...getManualSessions().map((session) => session.originalWorkout),
  ];
}
