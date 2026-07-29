import { useSyncExternalStore } from "react";
import type {
  BlockResult,
  BlockStatus,
  Programme,
  SessionLog,
  TrainVaultBackup,
  TrainVaultSnapshot,
  Workout,
  WorkoutBlockProgress,
  WorkoutOverride,
} from "./types";

const PROGRAMME_KEY = "trainvault_active_programme";
const LOGS_KEY = "trainvault_session_logs";
const WORKOUT_OVERRIDES_KEY = "trainvault_workout_overrides";
const TODAY_OVERRIDE_KEY = "selectedTodayWorkoutId";
const LEGACY_TODAY_OVERRIDE_KEY = "trainvault_today_workout_id";
const STORAGE_CHANGE_EVENT = "trainvault:storage-change";
const EMPTY_BLOCK_RESULTS: Record<string, BlockResult> = {};
const EMPTY_WORKOUT_OVERRIDES: Record<string, WorkoutOverride> = {};
let currentNowSnapshot = 0;
let programmeSnapshotRaw: string | null | undefined;
let programmeSnapshotValue: Programme | null = null;
let logsSnapshotRaw: string | null | undefined;
let logsSnapshotValue: SessionLog[] = [];
let workoutOverridesSnapshotRaw: string | null | undefined;
let workoutOverridesSnapshotValue: Record<string, WorkoutOverride> = EMPTY_WORKOUT_OVERRIDES;
let todayOverrideSnapshotRaw: string | null | undefined;
let todayOverrideSnapshotValue: string | null = null;
const blockProgressSnapshots = new Map<
  string,
  {
    raw: string | null | undefined;
    value: WorkoutBlockProgress | null;
  }
>();
const blockResultSnapshots = new Map<
  string,
  {
    raw: string | null | undefined;
    value: Record<string, BlockResult>;
  }
>();

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

function removeStorageKey(key: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(key);
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

function subscribeStorage(callback: () => void) {
  if (!canUseStorage()) {
    return () => {};
  }

  window.addEventListener(STORAGE_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(STORAGE_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getProgrammeSnapshot(fallback: Programme): Programme {
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(PROGRAMME_KEY);

    if (raw === programmeSnapshotRaw) {
      return programmeSnapshotValue ?? fallback;
    }

    programmeSnapshotRaw = raw;
    programmeSnapshotValue = raw ? (JSON.parse(raw) as Programme) : null;
    return programmeSnapshotValue ?? fallback;
  } catch {
    return fallback;
  }
}

function getOptionalProgrammeSnapshot(): Programme | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PROGRAMME_KEY);

    if (raw === programmeSnapshotRaw) {
      return programmeSnapshotValue;
    }

    programmeSnapshotRaw = raw;
    programmeSnapshotValue = raw ? (JSON.parse(raw) as Programme) : null;
    return programmeSnapshotValue;
  } catch {
    return null;
  }
}

function getLogsSnapshot(): SessionLog[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOGS_KEY);

    if (raw === logsSnapshotRaw) {
      return logsSnapshotValue;
    }

    logsSnapshotRaw = raw;
    logsSnapshotValue = raw ? (JSON.parse(raw) as SessionLog[]) : [];
    return logsSnapshotValue;
  } catch {
    return [];
  }
}

function getWorkoutOverridesSnapshot(): Record<string, WorkoutOverride> {
  if (!canUseStorage()) {
    return EMPTY_WORKOUT_OVERRIDES;
  }

  try {
    const raw = window.localStorage.getItem(WORKOUT_OVERRIDES_KEY);

    if (raw === workoutOverridesSnapshotRaw) {
      return workoutOverridesSnapshotValue;
    }

    workoutOverridesSnapshotRaw = raw;
    workoutOverridesSnapshotValue = raw ? (JSON.parse(raw) as Record<string, WorkoutOverride>) : EMPTY_WORKOUT_OVERRIDES;
    return workoutOverridesSnapshotValue;
  } catch {
    workoutOverridesSnapshotRaw = null;
    workoutOverridesSnapshotValue = EMPTY_WORKOUT_OVERRIDES;
    return EMPTY_WORKOUT_OVERRIDES;
  }
}

function getTodayOverrideSnapshot(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(TODAY_OVERRIDE_KEY) ?? window.localStorage.getItem(LEGACY_TODAY_OVERRIDE_KEY);

  if (raw === todayOverrideSnapshotRaw) {
    return todayOverrideSnapshotValue;
  }

  todayOverrideSnapshotRaw = raw;
  todayOverrideSnapshotValue = raw;

  return todayOverrideSnapshotValue;
}

function getBlockProgressKey(workoutId: string) {
  return `trainvault_block_progress_${workoutId}`;
}

function getBlockResultsKey(workoutId: string) {
  return `trainvault_block_results_${workoutId}`;
}

function getWorkoutIdFromPrefixedKey(key: string, prefix: string) {
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

function getWorkoutBlockProgressSnapshot(workoutId: string): WorkoutBlockProgress | null {
  if (!canUseStorage() || !workoutId) {
    return null;
  }

  const key = getBlockProgressKey(workoutId);

  try {
    const raw = window.localStorage.getItem(key);
    const cached = blockProgressSnapshots.get(key);

    if (cached && cached.raw === raw) {
      return cached.value;
    }

    const value = raw ? (JSON.parse(raw) as WorkoutBlockProgress) : null;
    blockProgressSnapshots.set(key, { raw, value });
    return value;
  } catch {
    blockProgressSnapshots.set(key, { raw: null, value: null });
    return null;
  }
}

function getWorkoutBlockResultsSnapshot(workoutId: string): Record<string, BlockResult> {
  if (!canUseStorage() || !workoutId) {
    return EMPTY_BLOCK_RESULTS;
  }

  const key = getBlockResultsKey(workoutId);

  try {
    const raw = window.localStorage.getItem(key);
    const cached = blockResultSnapshots.get(key);

    if (cached && cached.raw === raw) {
      return cached.value;
    }

    const value = raw ? (JSON.parse(raw) as Record<string, BlockResult>) : {};
    blockResultSnapshots.set(key, { raw, value });
    return value;
  } catch {
    blockResultSnapshots.set(key, { raw: null, value: EMPTY_BLOCK_RESULTS });
    return EMPTY_BLOCK_RESULTS;
  }
}

export function getActiveProgramme(): Programme | null {
  return readJson<Programme | null>(PROGRAMME_KEY, null);
}

export function useActiveProgramme(fallback: Programme): Programme {
  return useSyncExternalStore(
    subscribeStorage,
    () => getProgrammeSnapshot(fallback),
    () => fallback,
  );
}

export function useActiveProgrammeOptional(): Programme | null {
  return useSyncExternalStore(subscribeStorage, getOptionalProgrammeSnapshot, () => null);
}

export function saveActiveProgramme(programme: Programme) {
  writeJson(PROGRAMME_KEY, programme);
}

export function clearSelectedTodayWorkout() {
  setTodayWorkoutOverride(null);
}

export function clearActiveProgramme() {
  removeStorageKey(PROGRAMME_KEY);
  clearSelectedTodayWorkout();
}

export function updateProgrammeStartDate(startDate: string | null) {
  const programme = getActiveProgramme();

  if (!programme) {
    return;
  }

  saveActiveProgramme({
    ...programme,
    startDate,
  });
}

export function clearProgrammeAnchor() {
  updateProgrammeStartDate(null);
}

export function getSessionLogs(): SessionLog[] {
  return readJson<SessionLog[]>(LOGS_KEY, []);
}

export function useSessionLogs(): SessionLog[] {
  return useSyncExternalStore(subscribeStorage, getLogsSnapshot, () => []);
}

export function getWorkoutOverrides(): Record<string, WorkoutOverride> {
  return readJson<Record<string, WorkoutOverride>>(WORKOUT_OVERRIDES_KEY, {});
}

export function useWorkoutOverrides(): Record<string, WorkoutOverride> {
  return useSyncExternalStore(subscribeStorage, getWorkoutOverridesSnapshot, () => EMPTY_WORKOUT_OVERRIDES);
}

export function saveWorkoutOverrides(overrides: Record<string, WorkoutOverride>) {
  writeJson(WORKOUT_OVERRIDES_KEY, overrides);
}

export function saveWorkoutOverride(override: WorkoutOverride) {
  if (!override.workoutId) {
    return;
  }

  saveWorkoutOverrides({
    ...getWorkoutOverrides(),
    [override.workoutId]: {
      ...override,
      updatedAt: override.updatedAt || new Date().toISOString(),
    },
  });
}

export function getWorkoutOverride(workoutId: string): WorkoutOverride | null {
  if (!workoutId) {
    return null;
  }

  return getWorkoutOverrides()[workoutId] ?? null;
}

export function deleteWorkoutOverride(workoutId: string) {
  if (!workoutId) {
    return;
  }

  const overrides = getWorkoutOverrides();

  if (!overrides[workoutId]) {
    return;
  }

  const next = { ...overrides };
  delete next[workoutId];
  saveWorkoutOverrides(next);
}

export function clearAllWorkoutOverrides() {
  removeStorageKey(WORKOUT_OVERRIDES_KEY);
}

export function clearWorkoutOverridesForProgramme(programme: Programme) {
  if (!programme) {
    return;
  }

  const workoutIds = new Set(getAllWorkouts(programme).map((workout) => workout.id));
  const next = Object.fromEntries(
    Object.entries(getWorkoutOverrides()).filter(([workoutId]) => !workoutIds.has(workoutId)),
  );

  if (Object.keys(next).length > 0) {
    saveWorkoutOverrides(next);
  } else {
    clearAllWorkoutOverrides();
  }
}

function cloneWorkoutBlocks(blocks: Workout["blocks"]): Workout["blocks"] {
  return blocks.map((block) => ({
    ...block,
    items: [...block.items],
  }));
}

export function applyWorkoutOverride(workout: Workout, override?: WorkoutOverride | null): Workout {
  if (!override) {
    return workout;
  }

  return {
    ...workout,
    title: override.title !== undefined ? override.title : workout.title,
    date: override.date !== undefined ? override.date : workout.date,
    durationMinutes:
      override.durationMinutes !== undefined ? override.durationMinutes : workout.durationMinutes,
    minimumMinutes:
      override.minimumMinutes !== undefined ? override.minimumMinutes : workout.minimumMinutes,
    intensity: override.intensity !== undefined ? override.intensity : workout.intensity,
    focus: override.focus !== undefined ? [...override.focus] : workout.focus,
    equipment: override.equipment !== undefined ? [...override.equipment] : workout.equipment,
    blocks: override.blocks !== undefined ? cloneWorkoutBlocks(override.blocks) : workout.blocks,
    prescribedLoadsOrPace:
      override.prescribedLoadsOrPace !== undefined
        ? override.prescribedLoadsOrPace
        : workout.prescribedLoadsOrPace,
    targetStimulus:
      override.targetStimulus !== undefined ? override.targetStimulus : workout.targetStimulus,
    scalingNotes: override.scalingNotes !== undefined ? override.scalingNotes : workout.scalingNotes,
  };
}

export function getEffectiveWorkout(workout: Workout): Workout {
  return applyWorkoutOverride(workout, getWorkoutOverride(workout.id));
}

export function getEffectiveProgramme(
  programme: Programme,
  overrides: Record<string, WorkoutOverride> = getWorkoutOverrides(),
): Programme {
  return {
    ...programme,
    weeks: programme.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        workout: applyWorkoutOverride(day.workout, overrides[day.workout.id]),
      })),
    })),
  };
}

export function useTodayWorkoutOverride(): string | null {
  return useSyncExternalStore(subscribeStorage, getTodayOverrideSnapshot, () => null);
}

export function useWorkoutBlockProgress(workoutId: string): WorkoutBlockProgress | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => getWorkoutBlockProgressSnapshot(workoutId),
    () => null,
  );
}

export function useWorkoutBlockResults(workoutId: string): Record<string, BlockResult> {
  return useSyncExternalStore(
    subscribeStorage,
    () => getWorkoutBlockResultsSnapshot(workoutId),
    () => EMPTY_BLOCK_RESULTS,
  );
}

export function useClientReady(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useNow(): number {
  return useSyncExternalStore(
    () => () => {},
    () => {
      if (currentNowSnapshot === 0) {
        currentNowSnapshot = Date.now();
      }

      return currentNowSnapshot;
    },
    () => 0,
  );
}

export function saveSessionLog(log: SessionLog) {
  const logs = getSessionLogs().filter((existing) => existing.id !== log.id);
  writeJson(LOGS_KEY, [log, ...logs]);
}

export function saveSessionLogs(logs: SessionLog[]) {
  writeJson(LOGS_KEY, logs);
}

export function clearSessionLogs() {
  removeStorageKey(LOGS_KEY);
}

export function deleteSessionLog(id: string) {
  writeJson(
    LOGS_KEY,
    getSessionLogs().filter((log) => log.id !== id),
  );
}

export function getTodayWorkoutOverride(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(TODAY_OVERRIDE_KEY) ?? window.localStorage.getItem(LEGACY_TODAY_OVERRIDE_KEY);
}

export function setTodayWorkoutOverride(workoutId: string | null) {
  if (!canUseStorage()) {
    return;
  }

  if (workoutId) {
    window.localStorage.setItem(TODAY_OVERRIDE_KEY, workoutId);
  } else {
    window.localStorage.removeItem(TODAY_OVERRIDE_KEY);
    window.localStorage.removeItem(LEGACY_TODAY_OVERRIDE_KEY);
  }

  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

export function getWorkoutBlockProgress(workoutId: string): WorkoutBlockProgress | null {
  return readJson<WorkoutBlockProgress | null>(getBlockProgressKey(workoutId), null);
}

export function saveWorkoutBlockProgress(progress: WorkoutBlockProgress) {
  writeJson(getBlockProgressKey(progress.workoutId), progress);
}

export function setWorkoutBlockStatus(workoutId: string, blockId: string, status: BlockStatus) {
  if (!workoutId || !blockId) {
    return;
  }

  const current = getWorkoutBlockProgress(workoutId) ?? {
    workoutId,
    updatedAt: new Date().toISOString(),
    blocks: {},
  };
  const blocks = {
    ...current.blocks,
  };

  if (status === "todo") {
    delete blocks[blockId];
  } else {
    blocks[blockId] = status;
  }

  saveWorkoutBlockProgress({
    workoutId,
    updatedAt: new Date().toISOString(),
    blocks,
  });
}

export function getWorkoutBlockResults(workoutId: string): Record<string, BlockResult> {
  return readJson<Record<string, BlockResult>>(getBlockResultsKey(workoutId), {});
}

export function saveWorkoutBlockResult(workoutId: string, blockKey: string, result: BlockResult) {
  if (!workoutId || !blockKey) {
    return;
  }

  const current = getWorkoutBlockResults(workoutId);
  writeJson(getBlockResultsKey(workoutId), {
    ...current,
    [blockKey]: result,
  });
}

export function clearWorkoutBlockResults(workoutId: string) {
  if (!canUseStorage() || !workoutId) {
    return;
  }

  window.localStorage.removeItem(getBlockResultsKey(workoutId));
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

export function clearWorkoutBlockProgressForProgramme(programme: Programme) {
  if (!canUseStorage()) {
    return;
  }

  getAllWorkouts(programme).forEach((workout) => {
    window.localStorage.removeItem(getBlockProgressKey(workout.id));
  });
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

export function clearWorkoutBlockResultsForProgramme(programme: Programme) {
  if (!canUseStorage()) {
    return;
  }

  getAllWorkouts(programme).forEach((workout) => {
    window.localStorage.removeItem(getBlockResultsKey(workout.id));
  });
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

export function getTrainVaultBackup(): TrainVaultBackup | null {
  const programme = getActiveProgramme();

  if (!programme) {
    return null;
  }

  return {
    programme,
    logs: getSessionLogs(),
    workoutOverrides: getWorkoutOverrides(),
  };
}

export function restoreTrainVaultBackup(backup: TrainVaultBackup) {
  saveActiveProgramme(backup.programme);
  saveSessionLogs(backup.logs);
  saveWorkoutOverrides(backup.workoutOverrides ?? {});
}

export function getTrainVaultSnapshot(): TrainVaultSnapshot {
  const programme = getActiveProgramme();
  const blockProgress: Record<string, WorkoutBlockProgress> = {};
  const blockResults: Record<string, Record<string, BlockResult>> = {};

  if (canUseStorage()) {
    const progressPrefix = getBlockProgressKey("");
    const resultsPrefix = getBlockResultsKey("");

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (!key) {
        continue;
      }

      const progressWorkoutId = getWorkoutIdFromPrefixedKey(key, progressPrefix);
      const resultsWorkoutId = getWorkoutIdFromPrefixedKey(key, resultsPrefix);

      if (progressWorkoutId) {
        const progress = readJson<WorkoutBlockProgress | null>(key, null);

        if (progress) {
          blockProgress[progressWorkoutId] = progress;
        }
      }

      if (resultsWorkoutId) {
        const results = readJson<Record<string, BlockResult>>(key, {});
        blockResults[resultsWorkoutId] = results;
      }
    }
  }

  return {
    version: 2,
    programme,
    logs: getSessionLogs(),
    selectedTodayWorkoutId: getTodayWorkoutOverride(),
    programmeAnchor: programme?.startDate ?? null,
    programmeStartDate: programme?.startDate ?? null,
    blockProgress,
    blockResults,
    workoutOverrides: getWorkoutOverrides(),
    exportedAt: new Date().toISOString(),
  };
}

export function restoreTrainVaultSnapshot(snapshot: TrainVaultSnapshot) {
  if (!canUseStorage()) {
    return;
  }

  const progressPrefix = getBlockProgressKey("");
  const resultsPrefix = getBlockResultsKey("");
  const keysToRemove: string[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (key?.startsWith(progressPrefix) || key?.startsWith(resultsPrefix)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key));

  if (snapshot.programme) {
    const anchoredProgramme = {
      ...snapshot.programme,
      startDate: snapshot.programmeAnchor ?? snapshot.programmeStartDate ?? snapshot.programme.startDate ?? null,
    };
    window.localStorage.setItem(PROGRAMME_KEY, JSON.stringify(anchoredProgramme));
  } else {
    window.localStorage.removeItem(PROGRAMME_KEY);
  }

  window.localStorage.setItem(LOGS_KEY, JSON.stringify(Array.isArray(snapshot.logs) ? snapshot.logs : []));
  window.localStorage.setItem(
    WORKOUT_OVERRIDES_KEY,
    JSON.stringify(snapshot.workoutOverrides && typeof snapshot.workoutOverrides === "object" ? snapshot.workoutOverrides : {}),
  );

  if (snapshot.selectedTodayWorkoutId) {
    window.localStorage.setItem(TODAY_OVERRIDE_KEY, snapshot.selectedTodayWorkoutId);
  } else {
    window.localStorage.removeItem(TODAY_OVERRIDE_KEY);
    window.localStorage.removeItem(LEGACY_TODAY_OVERRIDE_KEY);
  }

  Object.entries(snapshot.blockProgress ?? {}).forEach(([workoutId, progress]) => {
    window.localStorage.setItem(getBlockProgressKey(workoutId), JSON.stringify(progress));
  });

  Object.entries(snapshot.blockResults ?? {}).forEach(([workoutId, results]) => {
    window.localStorage.setItem(getBlockResultsKey(workoutId), JSON.stringify(results));
  });

  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

export function getAllWorkouts(programme: Programme): Workout[] {
  return programme.weeks.flatMap((week) => week.days.map((day) => day.workout));
}

function getDateKeyFromTimestamp(timestamp?: number) {
  const date = timestamp ? new Date(timestamp) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setHours(0, 0, 0, 0);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getWorkoutDateTime(workout: Workout) {
  if (!workout.date) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = new Date(`${workout.date}T00:00:00`).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function getNextIncompleteWorkout(
  programme: Programme,
  logs: SessionLog[] = [],
  fromWorkoutId?: string,
): Workout | null {
  const sourceWorkouts = getAllWorkouts(programme);
  const workouts = sourceWorkouts
    .map((workout, index) => ({
      source: workout,
      effective: getEffectiveWorkout(workout),
      index,
    }))
    .sort((first, second) => {
      const firstDate = getWorkoutDateTime(first.effective);
      const secondDate = getWorkoutDateTime(second.effective);

      if (firstDate !== secondDate) {
        return firstDate - secondDate;
      }

      return first.index - second.index;
    });
  const completedWorkoutIds = new Set(logs.map((log) => log.workoutId));

  if (workouts.length === 0) {
    return null;
  }

  if (fromWorkoutId) {
    const fromIndex = workouts.findIndex(({ source }) => source.id === fromWorkoutId);

    if (fromIndex >= 0) {
      return workouts.slice(fromIndex + 1).find(({ source }) => !completedWorkoutIds.has(source.id))?.effective ?? null;
    }
  }

  return workouts.find(({ source }) => !completedWorkoutIds.has(source.id))?.effective ?? null;
}

export function getTodaysWorkout(programme: Programme, logs: SessionLog[] = [], todayTimestamp?: number): Workout | null {
  const workouts = getAllWorkouts(programme);

  if (workouts.length === 0) {
    return null;
  }

  const overrideId = getTodayWorkoutOverride();
  const overrideWorkout = overrideId ? workouts.find((workout) => workout.id === overrideId) : null;

  if (overrideWorkout) {
    return getEffectiveWorkout(overrideWorkout);
  }

  const todayKey = getDateKeyFromTimestamp(todayTimestamp);
  const effectiveDateMatch = todayKey
    ? workouts.find((workout) => getEffectiveWorkout(workout).date === todayKey)
    : null;

  if (effectiveDateMatch) {
    return getEffectiveWorkout(effectiveDateMatch);
  }

  if (programme.startDate) {
    const start = new Date(`${programme.startDate}T00:00:00`);
    const today = todayTimestamp ? new Date(todayTimestamp) : new Date();
    start.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
    const totalDays = programme.durationWeeks * 7;

    if (diffDays >= 0 && diffDays < totalDays) {
      const weekIndex = Math.floor(diffDays / 7);
      const dayNumber = (diffDays % 7) + 1;
      const week = programme.weeks[weekIndex];
      const exactDay = week?.days.find((day) => day.dayNumber === dayNumber);
      const nextDay = week?.days.find((day) => day.dayNumber >= dayNumber);
      const candidate = exactDay?.workout ?? nextDay?.workout ?? programme.weeks[weekIndex + 1]?.days[0]?.workout ?? workouts[0];
      const candidateOverride = getWorkoutOverride(candidate.id);

      if (todayKey && candidateOverride?.date && candidateOverride.date !== todayKey) {
        return getNextIncompleteWorkout(programme, logs) ?? getEffectiveWorkout(workouts[0]);
      }

      return getEffectiveWorkout(candidate);
    }
  }

  return getNextIncompleteWorkout(programme, logs) ?? getEffectiveWorkout(workouts[0]);
}
