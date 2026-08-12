"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { deleteWorkoutOverride, getWorkoutOverride, saveWorkoutOverride } from "@/lib/storage";
import { getStructuredRunningWorkout, saveStructuredRunningWorkout } from "@/lib/structured-running-storage";
import type {
  RunningStepTarget,
  StructuredRunningElement,
  StructuredRunningWorkout,
} from "@/lib/garmin/types";
import type { Workout, WorkoutBlock, WorkoutBlockType } from "@/lib/types";

type WorkoutEditPanelProps = {
  workout: Workout;
  sourceWorkout: Workout;
  onClose: () => void;
};

type EditableBlock = {
  key: string;
  name: string;
  type: WorkoutBlockType;
  durationMinutes: string;
  itemsText: string;
};

type RunTargetMode = "auto" | "open" | "pace" | "heart_rate";

const blockTypes: WorkoutBlockType[] = [
  "warmup",
  "strength",
  "skill",
  "conditioning",
  "intervals",
  "accessory",
  "cooldown",
];

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePace(value: string) {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatPace(secondsPerKm: number) {
  const rounded = Math.max(1, Math.round(secondsPerKm));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function isTerrainRunSignal(value: string) {
  return /\b(fell|trail|mountain|hill|hilly|off[- ]?road)\b/i.test(value);
}

function toEditableBlock(block: WorkoutBlock, index: number): EditableBlock {
  return {
    key: `${index}-${block.name}-${block.type}`,
    name: block.name,
    type: block.type,
    durationMinutes: block.durationMinutes ? String(block.durationMinutes) : "",
    itemsText: block.items.join("\n"),
  };
}

function toWorkoutBlock(block: EditableBlock): WorkoutBlock {
  return {
    name: block.name.trim() || "Block",
    type: block.type,
    durationMinutes: parsePositiveNumber(block.durationMinutes),
    items: block.itemsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function findFirstWorkTarget(workout: StructuredRunningWorkout | null): RunningStepTarget | null {
  if (!workout) return null;

  for (const element of workout.steps) {
    if (element.kind === "repeat") {
      const match = element.steps.find((step) => step.phase === "work");
      if (match) return match.target;
    } else if (element.phase === "work") {
      return element.target;
    }
  }

  return null;
}

function rewriteWorkTargets(
  workout: StructuredRunningWorkout,
  target: RunningStepTarget,
  name: string,
) {
  const rewriteStep = (
    step: Extract<StructuredRunningElement, { kind: "step" }>,
  ) => {
    if (step.phase !== "work") return step;

    const descriptionBase = (step.description ?? "Work interval")
      .replace(/\s*[·-]\s*target\s+[^·]+$/i, "")
      .trim();
    const targetDescription =
      target.type === "pace"
        ? ` · target ${formatPace(target.fastestSecondsPerKm)}–${formatPace(target.slowestSecondsPerKm)}/km`
        : target.type === "heart_rate"
          ? ` · target ${target.minimumBpm}–${target.maximumBpm} bpm`
          : "";

    return {
      ...step,
      target,
      description: `${descriptionBase}${targetDescription}`,
    };
  };

  return {
    ...workout,
    name,
    steps: workout.steps.map((element) =>
      element.kind === "repeat"
        ? { ...element, steps: element.steps.map(rewriteStep) }
        : rewriteStep(element),
    ),
  };
}

function inferInitialTargetMode(
  workout: Workout,
  structuredWorkout: StructuredRunningWorkout | null,
): RunTargetMode {
  const terrainSignal = `${workout.title} ${workout.focus.join(" ")} ${workout.targetStimulus ?? ""}`;
  if (isTerrainRunSignal(terrainSignal)) return "open";

  const target = findFirstWorkTarget(structuredWorkout);
  if (target?.type === "pace") return "pace";
  if (target?.type === "heart_rate") return "heart_rate";
  return "auto";
}

export default function WorkoutEditPanel({ workout, sourceWorkout, onClose }: WorkoutEditPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const structuredWorkout = getStructuredRunningWorkout(sourceWorkout.id);
  const initialWorkTarget = findFirstWorkTarget(structuredWorkout);
  const [title, setTitle] = useState(workout.title);
  const [durationMinutes, setDurationMinutes] = useState(String(workout.durationMinutes));
  const [minimumMinutes, setMinimumMinutes] = useState(workout.minimumMinutes ? String(workout.minimumMinutes) : "");
  const [prescribedLoadsOrPace, setPrescribedLoadsOrPace] = useState(workout.prescribedLoadsOrPace ?? "");
  const [targetStimulus, setTargetStimulus] = useState(workout.targetStimulus ?? "");
  const [scalingNotes, setScalingNotes] = useState(workout.scalingNotes ?? "");
  const [equipmentText, setEquipmentText] = useState(workout.equipment.join(", "));
  const [focusText, setFocusText] = useState(workout.focus.join(", "));
  const [blocks, setBlocks] = useState<EditableBlock[]>(workout.blocks.map(toEditableBlock));
  const [runTargetMode, setRunTargetMode] = useState<RunTargetMode>(() =>
    inferInitialTargetMode(workout, structuredWorkout),
  );
  const [targetModeTouched, setTargetModeTouched] = useState(false);
  const [fastestPace, setFastestPace] = useState(
    initialWorkTarget?.type === "pace" ? formatPace(initialWorkTarget.fastestSecondsPerKm) : "",
  );
  const [slowestPace, setSlowestPace] = useState(
    initialWorkTarget?.type === "pace" ? formatPace(initialWorkTarget.slowestSecondsPerKm) : "",
  );
  const [minimumHeartRate, setMinimumHeartRate] = useState(
    initialWorkTarget?.type === "heart_rate" ? String(initialWorkTarget.minimumBpm) : "",
  );
  const [maximumHeartRate, setMaximumHeartRate] = useState(
    initialWorkTarget?.type === "heart_rate" ? String(initialWorkTarget.maximumBpm) : "",
  );
  const [saved, setSaved] = useState(false);
  const isRunningSession = Boolean(structuredWorkout);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  function updateBlock(index: number, update: Partial<EditableBlock>) {
    setBlocks((current) =>
      current.map((block, blockIndex) => (blockIndex === index ? { ...block, ...update } : block)),
    );
    setSaved(false);
  }

  function addBlock() {
    setBlocks((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        name: "New block",
        type: "conditioning",
        durationMinutes: "",
        itemsText: "",
      },
    ]);
    setSaved(false);
  }

  function removeBlock(index: number) {
    setBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index));
    setSaved(false);
  }

  function maybeDefaultTerrainToOpen(nextTitle = title, nextFocus = focusText) {
    if (targetModeTouched) return;
    if (isTerrainRunSignal(`${nextTitle} ${nextFocus} ${targetStimulus}`)) {
      setRunTargetMode("open");
    }
  }

  function handleSave() {
    const current = getWorkoutOverride(sourceWorkout.id);
    const parsedDuration = parsePositiveNumber(durationMinutes) ?? sourceWorkout.durationMinutes;
    const nextTitle = title.trim() || sourceWorkout.title;

    saveWorkoutOverride({
      ...(current ?? { workoutId: sourceWorkout.id, updatedAt: "" }),
      workoutId: sourceWorkout.id,
      title: nextTitle,
      durationMinutes: parsedDuration,
      minimumMinutes: parsePositiveNumber(minimumMinutes),
      prescribedLoadsOrPace: prescribedLoadsOrPace.trim(),
      targetStimulus: targetStimulus.trim(),
      scalingNotes: scalingNotes.trim(),
      equipment: splitCommaList(equipmentText),
      focus: splitCommaList(focusText),
      blocks: blocks.map(toWorkoutBlock),
      modificationReason: current?.modificationReason ?? "Manual session edit",
      updatedAt: new Date().toISOString(),
    });

    const currentStructuredWorkout = getStructuredRunningWorkout(sourceWorkout.id);
    if (currentStructuredWorkout) {
      let nextStructuredWorkout: StructuredRunningWorkout = {
        ...currentStructuredWorkout,
        name: nextTitle,
      };

      const terrainSignal = `${nextTitle} ${focusText} ${targetStimulus}`;
      const effectiveMode =
        runTargetMode === "auto" && isTerrainRunSignal(terrainSignal)
          ? "open"
          : runTargetMode;

      if (effectiveMode === "open") {
        nextStructuredWorkout = rewriteWorkTargets(
          nextStructuredWorkout,
          { type: "open" },
          nextTitle,
        );
      } else if (effectiveMode === "pace") {
        const first = parsePace(fastestPace);
        const second = parsePace(slowestPace);
        if (first != null && second != null) {
          nextStructuredWorkout = rewriteWorkTargets(
            nextStructuredWorkout,
            {
              type: "pace",
              fastestSecondsPerKm: Math.min(first, second),
              slowestSecondsPerKm: Math.max(first, second),
            },
            nextTitle,
          );
        }
      } else if (effectiveMode === "heart_rate") {
        const minimumBpm = parsePositiveNumber(minimumHeartRate);
        const maximumBpm = parsePositiveNumber(maximumHeartRate);
        if (minimumBpm && maximumBpm) {
          nextStructuredWorkout = rewriteWorkTargets(
            nextStructuredWorkout,
            {
              type: "heart_rate",
              minimumBpm: Math.round(Math.min(minimumBpm, maximumBpm)),
              maximumBpm: Math.round(Math.max(minimumBpm, maximumBpm)),
            },
            nextTitle,
          );
        }
      }

      saveStructuredRunningWorkout(nextStructuredWorkout);
    }

    setSaved(true);
  }

  function handleReset() {
    const confirmed = window.confirm("Reset this session to the original imported plan?");

    if (!confirmed) {
      return;
    }

    deleteWorkoutOverride(sourceWorkout.id);
    setSaved(false);
    onClose();
  }

  return (
    <section
      ref={panelRef}
      id="session-edit-panel"
      className="tv-card scroll-mt-24 border-[rgba(215,255,47,0.35)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Edit Session</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Live plan changes</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {saved ? (
            <span className="inline-flex min-h-11 items-center rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-3 text-xs font-black uppercase text-[var(--accent)]">
              Saved
            </span>
          ) : null}
          <button type="button" onClick={onClose} className="tv-button-ghost">
            <X className="h-4 w-4" aria-hidden="true" />
            Close
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 md:col-span-2">
          <span className="tv-label">Title</span>
          <input
            className="tv-input"
            value={title}
            onChange={(event) => {
              const next = event.target.value;
              setTitle(next);
              maybeDefaultTerrainToOpen(next, focusText);
              setSaved(false);
            }}
          />
        </label>

        <label className="grid gap-2">
          <span className="tv-label">Duration Minutes</span>
          <input
            className="tv-input"
            type="number"
            min="1"
            inputMode="numeric"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
        </label>

        <label className="grid gap-2">
          <span className="tv-label">Minimum Minutes</span>
          <input
            className="tv-input"
            type="number"
            min="1"
            inputMode="numeric"
            value={minimumMinutes}
            onChange={(event) => setMinimumMinutes(event.target.value)}
            placeholder="Not set"
          />
        </label>

        <label className="grid gap-2 md:col-span-2">
          <span className="tv-label">Prescribed Loads / Pace</span>
          <textarea
            className="tv-input min-h-24 resize-y py-3"
            value={prescribedLoadsOrPace}
            onChange={(event) => setPrescribedLoadsOrPace(event.target.value)}
          />
        </label>

        {isRunningSession ? (
          <div className="grid gap-3 rounded-md border border-[rgba(215,255,47,0.22)] bg-black/45 p-3 md:col-span-2">
            <div>
              <p className="tv-label text-[var(--accent)]">Watch target</p>
              <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                Fell, trail and mountain runs default to effort/open. Pick a pace or heart-rate target only when it genuinely helps the session.
              </p>
            </div>

            <label className="grid gap-2">
              <span className="tv-label">Target mode</span>
              <select
                className="tv-input"
                value={runTargetMode}
                onChange={(event) => {
                  setRunTargetMode(event.target.value as RunTargetMode);
                  setTargetModeTouched(true);
                  setSaved(false);
                }}
              >
                <option value="auto">Auto from plan</option>
                <option value="open">Effort / open — no pace alerts</option>
                <option value="pace">Pace band</option>
                <option value="heart_rate">Heart-rate band</option>
              </select>
            </label>

            {runTargetMode === "pace" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="tv-label">Fastest pace /km</span>
                  <input
                    className="tv-input"
                    inputMode="numeric"
                    value={fastestPace}
                    onChange={(event) => {
                      setFastestPace(event.target.value);
                      setSaved(false);
                    }}
                    placeholder="5:20"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="tv-label">Slowest pace /km</span>
                  <input
                    className="tv-input"
                    inputMode="numeric"
                    value={slowestPace}
                    onChange={(event) => {
                      setSlowestPace(event.target.value);
                      setSaved(false);
                    }}
                    placeholder="6:00"
                  />
                </label>
              </div>
            ) : null}

            {runTargetMode === "heart_rate" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="tv-label">Minimum HR</span>
                  <input
                    className="tv-input"
                    type="number"
                    min="60"
                    max="230"
                    inputMode="numeric"
                    value={minimumHeartRate}
                    onChange={(event) => {
                      setMinimumHeartRate(event.target.value);
                      setSaved(false);
                    }}
                    placeholder="135"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="tv-label">Maximum HR</span>
                  <input
                    className="tv-input"
                    type="number"
                    min="60"
                    max="230"
                    inputMode="numeric"
                    value={maximumHeartRate}
                    onChange={(event) => {
                      setMaximumHeartRate(event.target.value);
                      setSaved(false);
                    }}
                    placeholder="155"
                  />
                </label>
              </div>
            ) : null}

            <p className="text-xs font-bold text-[var(--muted)]">
              This changes the structured Garmin work step too — not just the text shown in TrainVault.
            </p>
          </div>
        ) : null}

        <label className="grid gap-2 md:col-span-2">
          <span className="tv-label">Target Stimulus</span>
          <textarea
            className="tv-input min-h-24 resize-y py-3"
            value={targetStimulus}
            onChange={(event) => setTargetStimulus(event.target.value)}
          />
        </label>

        <label className="grid gap-2 md:col-span-2">
          <span className="tv-label">Scaling Notes</span>
          <textarea
            className="tv-input min-h-28 resize-y py-3"
            value={scalingNotes}
            onChange={(event) => setScalingNotes(event.target.value)}
          />
        </label>

        <label className="grid gap-2">
          <span className="tv-label">Equipment</span>
          <textarea
            className="tv-input min-h-24 resize-y py-3"
            value={equipmentText}
            onChange={(event) => setEquipmentText(event.target.value)}
            placeholder="rower, barbell, rings"
          />
        </label>

        <label className="grid gap-2">
          <span className="tv-label">Focus</span>
          <textarea
            className="tv-input min-h-24 resize-y py-3"
            value={focusText}
            onChange={(event) => {
              const next = event.target.value;
              setFocusText(next);
              maybeDefaultTerrainToOpen(title, next);
              setSaved(false);
            }}
            placeholder="engine, skill, pacing"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Blocks</p>
          <h3 className="mt-1 text-xl font-black uppercase">Edit work order</h3>
        </div>
        <button type="button" onClick={addBlock} className="tv-button-ghost">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add block
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        {blocks.map((block, index) => (
          <article key={block.key} className="rounded-md border border-[var(--border)] bg-black/60 p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <label className="grid gap-2">
                <span className="tv-label">Name</span>
                <input
                  className="tv-input"
                  value={block.name}
                  onChange={(event) => updateBlock(index, { name: event.target.value })}
                />
              </label>
              <label className="grid gap-2">
                <span className="tv-label">Type</span>
                <select
                  className="tv-input"
                  value={block.type}
                  onChange={(event) => updateBlock(index, { type: event.target.value as WorkoutBlockType })}
                >
                  {blockTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <label className="grid gap-2">
                <span className="tv-label">Minutes</span>
                <input
                  className="tv-input"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={block.durationMinutes}
                  onChange={(event) => updateBlock(index, { durationMinutes: event.target.value })}
                  placeholder="None"
                />
              </label>
              <label className="grid gap-2">
                <span className="tv-label">Items</span>
                <textarea
                  className="tv-input min-h-32 resize-y py-3"
                  value={block.itemsText}
                  onChange={(event) => updateBlock(index, { itemsText: event.target.value })}
                  placeholder="One item per line"
                />
              </label>
            </div>
            <button type="button" onClick={() => removeBlock(index)} className="tv-button-ghost mt-3">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove block
            </button>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={handleSave} className="tv-button-primary">
          <Save className="h-4 w-4" aria-hidden="true" />
          Save changes
        </button>
        <button type="button" onClick={handleReset} className="tv-button-ghost">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset to original
        </button>
      </div>
    </section>
  );
}
