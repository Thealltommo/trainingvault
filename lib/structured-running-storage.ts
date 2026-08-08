"use client";

import { useSyncExternalStore } from "react";
import type { StructuredRunningWorkout } from "@/lib/garmin/types";
import { applyDerivedPaceTargets } from "@/lib/run-pace-targets";

const STORAGE_KEY = "trainvault_structured_running_workouts_v1";
const CHANGE_EVENT = "trainvault:structured-running-change";
const EMPTY: Record<string, StructuredRunningWorkout> = {};
let cachedRaw: string | null | undefined;
let cachedValue: Record<string, StructuredRunningWorkout> = EMPTY;

function canUseStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function hydrateWorkout(workout: StructuredRunningWorkout) {
  return applyDerivedPaceTargets(workout);
}

function hydrateWorkouts(workouts: Record<string, StructuredRunningWorkout>) {
  return Object.fromEntries(
    Object.entries(workouts).map(([sessionId, workout]) => [
      sessionId,
      hydrateWorkout(workout),
    ]),
  );
}

function readSnapshot() {
  if (!canUseStorage()) return EMPTY;

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (raw === cachedRaw) return cachedValue;

  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    cachedValue =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? hydrateWorkouts(parsed as Record<string, StructuredRunningWorkout>)
        : EMPTY;
  } catch {
    cachedValue = EMPTY;
  }

  cachedRaw = raw;
  return cachedValue;
}

function writeSnapshot(
  workouts: Record<string, StructuredRunningWorkout>,
) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
  cachedRaw = undefined;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  if (!canUseStorage()) return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function getStructuredRunningWorkouts() {
  return readSnapshot();
}

export function getStructuredRunningWorkout(sessionId: string) {
  return readSnapshot()[sessionId] ?? null;
}

export function useStructuredRunningWorkouts() {
  return useSyncExternalStore(subscribe, readSnapshot, () => EMPTY);
}

export function useStructuredRunningWorkout(sessionId: string) {
  const workouts = useStructuredRunningWorkouts();
  return workouts[sessionId] ?? null;
}

export function saveStructuredRunningWorkout(
  workout: StructuredRunningWorkout,
) {
  const raw = canUseStorage() ? window.localStorage.getItem(STORAGE_KEY) : null;
  let existing: Record<string, StructuredRunningWorkout> = {};

  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    existing =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, StructuredRunningWorkout>)
        : {};
  } catch {
    existing = {};
  }

  writeSnapshot({
    ...existing,
    [workout.id]: workout,
  });
}

export function updateStructuredRunningWorkoutDate(
  sessionId: string,
  date: string,
) {
  const workout = getStructuredRunningWorkout(sessionId);

  if (!workout || !date) return;

  saveStructuredRunningWorkout({
    ...workout,
    date,
  });
}
