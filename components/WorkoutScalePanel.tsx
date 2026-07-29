"use client";

import { useState } from "react";
import { ArrowUpRight, BatteryLow, Clock3, Dumbbell, Pencil } from "lucide-react";
import { getWorkoutOverride, saveWorkoutOverride } from "@/lib/storage";
import type { Workout } from "@/lib/types";

type WorkoutScalePanelProps = {
  workout: Workout;
  sourceWorkout: Workout;
  onEditSession: () => void;
};

function saveScaleDecision(sourceWorkout: Workout, changes: {
  durationMinutes?: number;
  scalingNotes: string;
  modificationReason: string;
}) {
  const current = getWorkoutOverride(sourceWorkout.id);

  saveWorkoutOverride({
    ...(current ?? { workoutId: sourceWorkout.id, updatedAt: "" }),
    workoutId: sourceWorkout.id,
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

export default function WorkoutScalePanel({ workout, sourceWorkout, onEditSession }: WorkoutScalePanelProps) {
  const [showEquipmentSwap, setShowEquipmentSwap] = useState(false);
  const [swapText, setSwapText] = useState("");
  const timePoorNote =
    "Minimum version selected. Prioritise warm-up, main stimulus, and first scored piece.";
  const fatigueNote =
    "Scale-down selected. Reduce load/rounds and keep movement quality high.";
  const scaleUpNote =
    "Scale-up selected. Add accessory work or increase load only if main stimulus is preserved.";

  function handleEquipmentSave() {
    const note = swapText.trim();

    if (!note) {
      return;
    }

    saveScaleDecision(sourceWorkout, {
      scalingNotes: note,
      modificationReason: `Equipment busy: ${note}`,
    });
    setSwapText("");
    setShowEquipmentSwap(false);
  }

  return (
    <section className="tv-card border-[rgba(215,255,47,0.28)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Scale / Swap</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Adjust for today</h2>
        </div>
        <button type="button" onClick={onEditSession} className="tv-button-ghost">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit blocks
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() =>
            saveScaleDecision(sourceWorkout, {
              durationMinutes: workout.minimumMinutes ?? workout.durationMinutes,
              scalingNotes: timePoorNote,
              modificationReason: "Time poor",
            })
          }
          className="tv-button-primary justify-start"
        >
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          Time poor
        </button>
        <button
          type="button"
          onClick={() => setShowEquipmentSwap((current) => !current)}
          className="tv-button-ghost justify-start"
        >
          <Dumbbell className="h-4 w-4" aria-hidden="true" />
          Equipment busy
        </button>
        <button
          type="button"
          onClick={() =>
            saveScaleDecision(sourceWorkout, {
              scalingNotes: fatigueNote,
              modificationReason: "Fatigue scale-down",
            })
          }
          className="tv-button-ghost justify-start"
        >
          <BatteryLow className="h-4 w-4" aria-hidden="true" />
          Fatigue scale-down
        </button>
        <button
          type="button"
          onClick={() =>
            saveScaleDecision(sourceWorkout, {
              scalingNotes: scaleUpNote,
              modificationReason: "Scale up",
            })
          }
          className="tv-button-ghost justify-start"
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          Scale up
        </button>
      </div>

      {showEquipmentSwap ? (
        <div className="mt-4 rounded-md border border-[var(--border)] bg-black/65 p-3">
          <label className="grid gap-2">
            <span className="tv-label">What did you swap?</span>
            <textarea
              className="tv-input min-h-28 resize-y py-3"
              value={swapText}
              onChange={(event) => setSwapText(event.target.value)}
              placeholder="Rower unavailable -> bike cals. Barbell unavailable -> DB cleans."
            />
          </label>
          <button
            type="button"
            onClick={handleEquipmentSave}
            disabled={!swapText.trim()}
            className="tv-button-primary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            Save swap
          </button>
        </div>
      ) : null}
    </section>
  );
}
