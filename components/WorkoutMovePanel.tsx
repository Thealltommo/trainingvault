"use client";

import { useMemo, useState } from "react";
import { CalendarClock, RotateCcw } from "lucide-react";
import {
  applyWorkoutOverride,
  deleteWorkoutOverride,
  getWorkoutOverride,
  saveWorkoutOverride,
  useWorkoutOverrides,
} from "@/lib/storage";
import { updateStructuredRunningWorkoutDate } from "@/lib/structured-running-storage";
import type { Workout, WorkoutOverride } from "@/lib/types";

type WorkoutMovePanelProps = {
  workout: Workout;
  sourceWorkout?: Workout;
  triggerClassName?: string;
};

const structuralOverrideKeys = new Set<keyof WorkoutOverride>(["workoutId", "updatedAt"]);

function localDateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatSessionDate(value: string | undefined) {
  if (!value) return "No date";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function hasOverridePayload(override: WorkoutOverride) {
  return Object.keys(override).some((key) => {
    const overrideKey = key as keyof WorkoutOverride;
    return !structuralOverrideKeys.has(overrideKey) && override[overrideKey] !== undefined;
  });
}

function clearMovedDate(sourceWorkout: Workout) {
  const current = getWorkoutOverride(sourceWorkout.id);

  if (current) {
    const next = {
      ...current,
      updatedAt: new Date().toISOString(),
    };
    delete next.date;

    if (hasOverridePayload(next)) {
      saveWorkoutOverride(next);
    } else {
      deleteWorkoutOverride(sourceWorkout.id);
    }
  }

  if (sourceWorkout.date) {
    updateStructuredRunningWorkoutDate(sourceWorkout.id, sourceWorkout.date);
  }
}

function saveMovedDate(sourceWorkout: Workout, date: string) {
  const current = getWorkoutOverride(sourceWorkout.id);

  if (date === (sourceWorkout.date ?? "")) {
    clearMovedDate(sourceWorkout);
    return;
  }

  saveWorkoutOverride({
    ...(current ?? { workoutId: sourceWorkout.id, updatedAt: "" }),
    workoutId: sourceWorkout.id,
    date,
    updatedAt: new Date().toISOString(),
  });

  // A calendar move changes when Garmin should schedule the work, not the work
  // itself. Keep the stored structured work order on the same effective date so
  // delivery signatures and the visible session stay in one lifecycle.
  updateStructuredRunningWorkoutDate(sourceWorkout.id, date);
}

export default function WorkoutMovePanel({
  workout,
  sourceWorkout,
  triggerClassName = "tv-button-ghost",
}: WorkoutMovePanelProps) {
  const overrides = useWorkoutOverrides();
  const originalWorkout = sourceWorkout ?? workout;
  const override = overrides[originalWorkout.id] ?? null;
  const effectiveWorkout = useMemo(
    () => applyWorkoutOverride(originalWorkout, override),
    [originalWorkout, override],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState(effectiveWorkout.date ?? "");
  const moved = (effectiveWorkout.date ?? "") !== (originalWorkout.date ?? "");

  function handleSavePickedDate() {
    if (!pickedDate) return;
    saveMovedDate(originalWorkout, pickedDate);
    setIsOpen(false);
  }

  function handleMoveTo(offsetDays: number) {
    const date = localDateKey(offsetDays);
    setPickedDate(date);
    saveMovedDate(originalWorkout, date);
    setIsOpen(false);
  }

  return (
    <div className="min-w-0 basis-full sm:basis-auto">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={triggerClassName}
      >
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        Move
      </button>

      {isOpen ? (
        <div className="mt-3 grid min-w-0 gap-3 rounded-md border border-[rgba(215,255,47,0.28)] bg-black/85 p-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Move Session</p>
            <p className="mt-1 break-words text-xs font-bold text-[var(--muted)]">
              {moved
                ? `Moved from ${formatSessionDate(originalWorkout.date)} to ${formatSessionDate(effectiveWorkout.date)}`
                : `Original date: ${formatSessionDate(originalWorkout.date)}`}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => handleMoveTo(0)} className="tv-button-primary">
              Move to today
            </button>
            <button type="button" onClick={() => handleMoveTo(1)} className="tv-button-ghost">
              Move to tomorrow
            </button>
          </div>

          <label className="grid gap-2">
            <span className="tv-label">Pick date</span>
            <input
              className="tv-input"
              type="date"
              value={pickedDate}
              onChange={(event) => setPickedDate(event.target.value)}
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleSavePickedDate}
              disabled={!pickedDate}
              className="tv-button-primary disabled:cursor-not-allowed disabled:opacity-45"
            >
              Save move
            </button>
            <button
              type="button"
              onClick={() => {
                clearMovedDate(originalWorkout);
                setPickedDate(originalWorkout.date ?? "");
                setIsOpen(false);
              }}
              disabled={!moved}
              className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Restore date
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
