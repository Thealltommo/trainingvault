"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, CheckCircle, Clock, Gauge, Pencil, Pin, RotateCcw } from "lucide-react";
import HeroImagePanel from "@/components/HeroImagePanel";
import SessionCompleteForm from "@/components/SessionCompleteForm";
import WorkoutEditPanel from "@/components/WorkoutEditPanel";
import WorkoutMovePanel from "@/components/WorkoutMovePanel";
import WorkoutScalePanel from "@/components/WorkoutScalePanel";
import { getHeroImageForWorkout } from "@/lib/hero-images";
import { normalizeLimiter } from "@/lib/session-log";
import {
  applyWorkoutOverride,
  deleteWorkoutOverride,
  getAllWorkouts,
  saveWorkoutBlockResult,
  setTodayWorkoutOverride,
  setWorkoutBlockStatus,
  useActiveProgrammeOptional,
  useSessionLogs,
  useTodayWorkoutOverride,
  useWorkoutBlockProgress,
  useWorkoutBlockResults,
  useWorkoutOverrides,
} from "@/lib/storage";
import type { BlockResult, BlockStatus, ProgrammeGuideItem, Workout, WorkoutBlock } from "@/lib/types";

function formatAttemptDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSessionDate(value: string | undefined) {
  if (!value) {
    return "No date";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function getPriorityClasses(priority: Workout["priority"]) {
  switch (priority) {
    case "High":
      return "border-[var(--accent)] bg-[var(--accent)] text-black";
    case "Target":
      return "border-[var(--accent)] bg-[rgba(215,255,47,0.18)] text-[var(--accent)] shadow-[0_0_24px_rgba(215,255,47,0.16)]";
    case "Medium":
    case "Primer":
      return "border-[rgba(215,255,47,0.35)] bg-black text-[var(--text)]";
    case "Recovery":
    case "Optional":
    case "Low":
      return "border-[var(--border)] bg-black text-[var(--muted)]";
    default:
      return "border-[var(--border)] bg-black text-[var(--muted)]";
  }
}

function shouldShowHandstandGuide(workout: Workout) {
  const signal = `${workout.title} ${workout.category} ${workout.sessionType ?? ""} ${workout.focus.join(" ")}`.toLowerCase();
  return signal.includes("handstand") || signal.includes("skill");
}

function isGenericGuideLabel(value: string | undefined) {
  return Boolean(value && /^guide item \d+$/i.test(value.trim()));
}

function getGuideLines(item: ProgrammeGuideItem) {
  return [...(item.items ?? []), ...(item.drills ?? []), ...(item.cues ?? [])].filter((line) => line.trim().length > 0);
}

function isMeaningfulGuideItem(item: ProgrammeGuideItem) {
  const heading = item.level ?? item.title ?? item.name;
  const body = item.description ?? item.details;
  const lines = getGuideLines(item);

  return Boolean((heading && !isGenericGuideLabel(heading)) || (body && body.trim().length > 0) || lines.length > 0);
}

function getGuideHeading(item: ProgrammeGuideItem) {
  const heading = item.level ?? item.title ?? item.name;
  return heading && !isGenericGuideLabel(heading) ? heading : null;
}

function getBlockId(block: WorkoutBlock, index: number) {
  const slug = block.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${index}-${slug || block.type}`;
}

function getBlockCardClass(status: BlockStatus) {
  if (status === "done") {
    return "border-[rgba(215,255,47,0.45)] [box-shadow:inset_3px_0_0_var(--accent)]";
  }

  if (status === "skipped") {
    return "border-[rgba(255,255,255,0.16)] opacity-95 [box-shadow:inset_3px_0_0_rgba(163,163,163,0.65)]";
  }

  return "[box-shadow:inset_3px_0_0_rgba(255,255,255,0.10)]";
}

function BlockStatusControls({
  status,
  onDone,
  onSkip,
  onUndo,
}: {
  status: BlockStatus;
  onDone: () => void;
  onSkip: () => void;
  onUndo: () => void;
}) {
  if (status === "done") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-3 text-xs font-black uppercase text-[var(--accent)]">
          <Check className="h-4 w-4" aria-hidden="true" />
          Done
        </span>
        <button type="button" onClick={onUndo} className="tv-button-ghost min-h-9 px-3 py-1 text-xs">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Undo
        </button>
      </div>
    );
  }

  if (status === "skipped") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-9 items-center rounded-sm border border-[var(--border)] bg-black px-3 text-xs font-black uppercase text-[var(--muted)]">
          Skipped
        </span>
        <button type="button" onClick={onUndo} className="tv-button-ghost min-h-9 px-3 py-1 text-xs">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onDone} className="tv-button-primary min-h-9 px-3 py-1 text-xs">
        Mark done
      </button>
      <button type="button" onClick={onSkip} className="tv-button-ghost min-h-9 px-3 py-1 text-xs">
        Skip
      </button>
    </div>
  );
}

const blockResultFields: Array<{
  key: keyof Pick<BlockResult, "result" | "load" | "reps" | "time" | "calories" | "distance">;
  label: string;
}> = [
  { key: "result", label: "Result / score" },
  { key: "load", label: "Load" },
  { key: "reps", label: "Reps" },
  { key: "time", label: "Time" },
  { key: "calories", label: "Calories" },
  { key: "distance", label: "Distance" },
];

function getBlockResultPlaceholder(blockType: string, field: string) {
  if (field !== "result") {
    return "";
  }

  switch (blockType) {
    case "conditioning":
      return "Rounds, reps, cals, time";
    case "strength":
      return "Top set, load, reps";
    case "intervals":
      return "Splits, pace, total time";
    case "skill":
      return "Quality, attempts, best set";
    case "accessory":
      return "Completed, load, notes";
    default:
      return "Score, completion, or key note";
  }
}

function hasBlockResultDetails(result: BlockResult | undefined) {
  return Boolean(
    result &&
      [result.result, result.load, result.reps, result.time, result.calories, result.distance, result.notes].some(
        (value) => value && value.trim().length > 0,
      ),
  );
}

function getBlockResultSummary(result: BlockResult) {
  const parts = [
    result.result,
    result.calories ? `${result.calories} cals` : null,
    result.load,
    result.reps ? `${result.reps} reps` : null,
    result.time,
    result.distance,
    result.notes,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return result.status === "skipped" ? "skipped" : result.status ?? "todo";
}

function createBlockResult(
  block: WorkoutBlock,
  blockId: string,
  status: BlockStatus,
  existing?: BlockResult,
): BlockResult {
  return {
    blockKey: blockId,
    blockName: block.name,
    blockType: block.type,
    blockItems: [...block.items],
    status,
    result: existing?.result,
    load: existing?.load,
    reps: existing?.reps,
    time: existing?.time,
    calories: existing?.calories,
    distance: existing?.distance,
    notes: existing?.notes,
  };
}

function scrollToLogForm() {
  document.getElementById("session-log-form")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const selectedTodayWorkoutId = useTodayWorkoutOverride();
  const workoutOverrides = useWorkoutOverrides();
  const [showMobileLogCta, setShowMobileLogCta] = useState(true);
  const [openResultBlocks, setOpenResultBlocks] = useState<Record<string, boolean>>({});
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  const sourceWorkout = useMemo(() => {
    return programme ? getAllWorkouts(programme).find((candidate) => candidate.id === params.id) ?? null : null;
  }, [params.id, programme]);
  const workoutOverride = sourceWorkout ? workoutOverrides[sourceWorkout.id] ?? null : null;
  const workout = useMemo(() => {
    return sourceWorkout ? applyWorkoutOverride(sourceWorkout, workoutOverride) : null;
  }, [sourceWorkout, workoutOverride]);
  const blockProgress = useWorkoutBlockProgress(workout?.id ?? "");
  const savedBlockResults = useWorkoutBlockResults(workout?.id ?? "");

  const attempts = useMemo(
    () =>
      logs
        .filter((log) => log.workoutId === params.id)
        .sort((first, second) => new Date(second.completedAt).getTime() - new Date(first.completedAt).getTime()),
    [logs, params.id],
  );
  const blockSummaries = useMemo(() => {
    if (!workout) {
      return [];
    }

    return workout.blocks.map((block, index) => {
      const blockId = getBlockId(block, index);
      return {
        block,
        blockId,
        status: blockProgress?.blocks[blockId] ?? "todo",
      };
    });
  }, [blockProgress, workout]);

  useEffect(() => {
    const target = document.getElementById("session-log-form");

    if (!target || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowMobileLogCta(!entry.isIntersecting);
      },
      {
        rootMargin: "0px 0px -18% 0px",
        threshold: 0.05,
      },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [workout?.id]);

  if (!workout || !sourceWorkout) {
    return (
      <section className="tv-card p-5">
        <p className="tv-label">Session</p>
        <h1 className="mt-2 text-3xl font-black uppercase">Session not found</h1>
        <Link href="/program" className="tv-button-primary mt-5">
          Back to program
        </Link>
      </section>
    );
  }

  const originalWorkout = sourceWorkout;
  const workoutId = workout.id;
  const substitutions = workout.substitutions ?? workout.alternatives ?? [];
  const isCompleted = attempts.length > 0;
  const isSelectedToday = selectedTodayWorkoutId === workout.id;
  const isMoved = (workout.date ?? "") !== (originalWorkout.date ?? "");
  const sessionHeroSrc = getHeroImageForWorkout(workout);
  const handstandGuide = programme?.handstandGuide ?? [];
  const meaningfulHandstandGuide = handstandGuide.filter(isMeaningfulGuideItem);
  const showHandstandGuide = meaningfulHandstandGuide.length > 0 && shouldShowHandstandGuide(workout);
  const doneBlocks = blockSummaries.filter((item) => item.status === "done").length;
  const skippedBlocks = blockSummaries.filter((item) => item.status === "skipped").length;
  const remainingBlocks = blockSummaries.length - doneBlocks - skippedBlocks;
  const nonSkippedBlocks = blockSummaries.length - skippedBlocks;
  const allNonSkippedBlocksDone = nonSkippedBlocks > 0 && doneBlocks === nonSkippedBlocks;
  const finalBlockResults = blockSummaries.map(({ block, blockId, status }) =>
    createBlockResult(block, blockId, status, savedBlockResults[blockId]),
  );

  function handleResetSessionOverride() {
    const confirmed = window.confirm("Reset session to the original imported plan?");

    if (!confirmed) {
      return;
    }

    deleteWorkoutOverride(originalWorkout.id);
    setEditPanelOpen(false);
  }

  function handleBlockResultChange(
    block: WorkoutBlock,
    blockId: string,
    status: BlockStatus,
    field: keyof Pick<BlockResult, "result" | "load" | "reps" | "time" | "calories" | "distance" | "notes">,
    value: string,
  ) {
    const next = createBlockResult(block, blockId, status, savedBlockResults[blockId]);
    next[field] = value;
    saveWorkoutBlockResult(workoutId, blockId, next);
  }

  return (
    <div className="grid gap-5 pb-24 md:pb-0">
      <Link href="/program" className="inline-flex min-h-11 items-center gap-2 text-sm font-black uppercase text-[var(--muted)] hover:text-[var(--accent)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Program
      </Link>

      <HeroImagePanel src={sessionHeroSrc} title={workout.title} kicker={workout.category} className="hero-media-large">
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
          <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--border)] bg-black px-3 text-[var(--muted)]">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Full {workout.durationMinutes} min
          </span>
          {workout.minimumMinutes ? (
            <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--border)] bg-black px-3 text-[var(--muted)]">
              Minimum {workout.minimumMinutes} min
            </span>
          ) : null}
          {workout.date ? (
            <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--border)] bg-black px-3 text-[var(--muted)]">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {formatSessionDate(workout.date)}
            </span>
          ) : null}
          {workoutOverride ? (
            <span className="inline-flex min-h-9 items-center rounded-sm border border-[rgba(215,255,47,0.42)] bg-black px-3 uppercase text-[var(--accent)]">
              Modified
            </span>
          ) : null}
          {isMoved ? (
            <span className="inline-flex min-h-9 items-center rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-3 uppercase text-[var(--accent)]">
              Moved
            </span>
          ) : null}
          <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-3 uppercase text-[var(--accent)]">
            <Gauge className="h-4 w-4" aria-hidden="true" />
            {workout.intensity}
          </span>
          {workout.sessionType ? (
            <span className="inline-flex min-h-9 items-center rounded-sm border border-[var(--border)] bg-black px-3 uppercase text-[var(--text)]">
              {workout.sessionType}
            </span>
          ) : null}
          {workout.phase ? (
            <span className="inline-flex min-h-9 items-center rounded-sm border border-[var(--border)] bg-black px-3 uppercase text-[var(--muted)]">
              Phase: {workout.phase}
            </span>
          ) : null}
          {workout.priority ? (
            <span className={`inline-flex min-h-9 items-center rounded-sm px-3 uppercase ${getPriorityClasses(workout.priority)}`}>
              {workout.priority}
            </span>
          ) : null}
          {isCompleted ? (
            <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-3 uppercase text-[var(--accent)]">
              <Check className="h-4 w-4" aria-hidden="true" />
              Completed
            </span>
          ) : null}
          {isSelectedToday ? (
            <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--accent)] bg-black px-3 uppercase text-[var(--accent)]">
              <Pin className="h-4 w-4" aria-hidden="true" />
              Today
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={scrollToLogForm} className="tv-button-primary">
            Complete Session
          </button>
          <button type="button" onClick={() => setEditPanelOpen((current) => !current)} className="tv-button-ghost">
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit session
          </button>
          <WorkoutMovePanel workout={workout} sourceWorkout={originalWorkout} triggerClassName="tv-button-ghost" />
          <button type="button" onClick={scrollToLogForm} className="tv-button-ghost">
            Jump to log
          </button>
          <button type="button" onClick={() => setTodayWorkoutOverride(workout.id)} className="tv-button-primary">
            <Pin className="h-4 w-4" aria-hidden="true" />
            Set as today&apos;s session
          </button>
          {isSelectedToday ? (
            <button type="button" onClick={() => setTodayWorkoutOverride(null)} className="tv-button-ghost">
              Clear today
            </button>
          ) : null}
        </div>
      </HeroImagePanel>

      {workoutOverride ? (
        <section className="tv-card border-[rgba(215,255,47,0.35)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Live Adjustments</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Override active</h2>
            </div>
            <button type="button" onClick={handleResetSessionOverride} className="tv-button-ghost">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset session to original plan
            </button>
          </div>
          <div className="mt-3 grid gap-2 text-sm font-bold text-[var(--muted)]">
            {isMoved ? (
              <p className="break-words">
                Moved from <span className="text-[var(--text)]">{formatSessionDate(originalWorkout.date)}</span> to{" "}
                <span className="text-[var(--accent)]">{formatSessionDate(workout.date)}</span>.
              </p>
            ) : null}
            {workoutOverride.modificationReason ? (
              <p className="break-words">
                Reason: <span className="text-[var(--text)]">{workoutOverride.modificationReason}</span>
              </p>
            ) : null}
            {workoutOverride.scalingNotes ? (
              <p className="break-words">
                Scaling: <span className="text-[var(--text)]">{workoutOverride.scalingNotes}</span>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {editPanelOpen ? (
        <WorkoutEditPanel
          workout={workout}
          sourceWorkout={originalWorkout}
          onClose={() => setEditPanelOpen(false)}
        />
      ) : null}

      <section className="tv-card border-[rgba(215,255,47,0.28)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Session Progress</p>
            <h2 className="mt-1 text-2xl font-black uppercase">
              {doneBlocks} / {blockSummaries.length} blocks done
            </h2>
            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              {doneBlocks} done / {skippedBlocks} skipped / {remainingBlocks} remaining
            </p>
          </div>
          <button type="button" onClick={scrollToLogForm} className={allNonSkippedBlocksDone ? "tv-button-primary" : "tv-button-ghost"}>
            {allNonSkippedBlocksDone ? "Lock score" : "Jump to log"}
          </button>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-sm bg-black">
          <div
            className="h-full bg-[var(--accent)] transition-[width]"
            style={{
              width: `${blockSummaries.length > 0 ? Math.round((doneBlocks / blockSummaries.length) * 100) : 0}%`,
            }}
          />
        </div>
        <p className="mt-3 text-sm font-bold text-[var(--muted)]">
          {allNonSkippedBlocksDone ? "All blocks checked. Lock in your score." : "Mark blocks as done or skipped as you work through the session."}
        </p>
      </section>

      {(workout.targetStimulus || workout.prescribedLoadsOrPace || workout.scalingNotes) ? (
        <section className="grid gap-3 md:grid-cols-3">
          {workout.targetStimulus ? (
            <article className="tv-card border-[rgba(215,255,47,0.35)] p-4">
              <p className="tv-label text-[var(--accent)]">Target Stimulus</p>
              <p className="mt-2 break-words text-sm font-bold text-[var(--text)]">{workout.targetStimulus}</p>
            </article>
          ) : null}
          {workout.prescribedLoadsOrPace ? (
            <article className="tv-card p-4">
              <p className="tv-label">Prescribed Loads / Pace</p>
              <p className="mt-2 break-words text-sm font-bold text-[var(--text)]">{workout.prescribedLoadsOrPace}</p>
            </article>
          ) : null}
          {workout.scalingNotes ? (
            <article className="tv-card p-4">
              <p className="tv-label">Scaling / Minimum Version</p>
              <p className="mt-2 break-words text-sm font-bold text-[var(--text)]">{workout.scalingNotes}</p>
            </article>
          ) : null}
        </section>
      ) : null}

      <WorkoutScalePanel
        workout={workout}
        sourceWorkout={originalWorkout}
        onEditSession={() => setEditPanelOpen(true)}
      />

      <section className="grid gap-3 md:grid-cols-2">
        <article className="tv-card p-4">
          <p className="tv-label">Focus</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {workout.focus.map((focus) => (
              <span key={focus} className="max-w-full break-words rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-xs font-black uppercase text-[var(--text)]">
                {focus}
              </span>
            ))}
          </div>
        </article>
        <article className="tv-card p-4">
          <p className="tv-label">Equipment</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {workout.equipment.map((item) => (
              <span key={item} className="max-w-full break-words rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-xs font-black uppercase text-[var(--text)]">
                {item}
              </span>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-3">
        <div>
          <p className="tv-label">Blocks</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Work order</h2>
        </div>

        {blockSummaries.map(({ block, blockId, status }) => {
          const blockResult = savedBlockResults[blockId];
          const resultIsOpen = openResultBlocks[blockId] ?? false;
          const hasResult = hasBlockResultDetails(blockResult);

          return (
            <article key={blockId} className={`tv-card min-w-0 p-4 ${getBlockCardClass(status)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="tv-label">{block.type}</p>
                  <h3 className="mt-1 break-words text-xl font-black uppercase">{block.name}</h3>
                  {hasResult ? (
                    <p className="mt-1 text-xs font-black uppercase text-[var(--accent)]">
                      Result saved
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {block.durationMinutes ? (
                    <span className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-xs font-black uppercase text-[var(--muted)]">
                      {block.durationMinutes} min
                    </span>
                  ) : null}
                  <BlockStatusControls
                    status={status}
                    onDone={() => setWorkoutBlockStatus(workout.id, blockId, "done")}
                    onSkip={() => setWorkoutBlockStatus(workout.id, blockId, "skipped")}
                    onUndo={() => setWorkoutBlockStatus(workout.id, blockId, "todo")}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setOpenResultBlocks((current) => ({
                        ...current,
                        [blockId]: !current[blockId],
                      }))
                    }
                    className="tv-button-ghost min-h-9 px-3 py-1 text-xs"
                  >
                    {hasResult ? "Edit result" : "Add result"}
                  </button>
                </div>
              </div>
              <ol className="mt-4 grid gap-2 text-sm font-bold text-[var(--text)]">
                {block.items.map((item, itemIndex) => (
                  <li key={`${blockId}-${itemIndex}`} className="grid grid-cols-[2rem_minmax(0,1fr)] border-l-2 border-[var(--accent)] bg-black/50">
                    <span className="grid place-items-center border-r border-[var(--border)] text-xs font-black text-[var(--accent)]">
                      {itemIndex + 1}
                    </span>
                    <span className="min-w-0 break-words px-3 py-2">{item}</span>
                  </li>
                ))}
              </ol>
              {resultIsOpen ? (
                <div className="mt-4 rounded-md border border-[var(--border)] bg-black/65 p-3">
                  <p className="tv-label text-[var(--accent)]">Block Result</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {blockResultFields.map((field) => (
                      <label key={field.key} className="grid gap-2">
                        <span className="tv-label">{field.label}</span>
                        <input
                          className="tv-input"
                          value={blockResult?.[field.key] ?? ""}
                          onChange={(event) => handleBlockResultChange(block, blockId, status, field.key, event.target.value)}
                          placeholder={getBlockResultPlaceholder(block.type, field.key)}
                        />
                      </label>
                    ))}
                    <label className="grid gap-2 sm:col-span-2 lg:col-span-3">
                      <span className="tv-label">Notes</span>
                      <textarea
                        className="tv-input min-h-24 resize-y py-3"
                        value={blockResult?.notes ?? ""}
                        onChange={(event) => handleBlockResultChange(block, blockId, status, "notes", event.target.value)}
                        placeholder="Context, scaling, misses, or why this block was skipped"
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      {workout.coachNotes ? (
        <aside className="tv-card border-[rgba(215,255,47,0.35)] p-4">
          <p className="tv-label text-[var(--accent)]">Coach Notes</p>
          <p className="mt-2 break-words text-sm font-bold text-[var(--text)]">{workout.coachNotes}</p>
        </aside>
      ) : null}

      {substitutions.length > 0 ? (
        <aside className="tv-card p-4">
          <p className="tv-label text-[var(--accent)]">Alternatives</p>
          <ul className="mt-3 grid gap-2 text-sm font-bold text-[var(--text)]">
            {substitutions.map((substitution) => (
              <li key={substitution} className="flex gap-2 border-t border-[var(--border)] pt-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <span className="min-w-0 break-words">{substitution}</span>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {showHandstandGuide ? (
        <aside className="tv-card border-[rgba(215,255,47,0.35)] p-4">
          <p className="tv-label text-[var(--accent)]">Handstand Guide</p>
          <div className="mt-3 grid gap-3">
            {meaningfulHandstandGuide.map((item, index) => {
              const lines = getGuideLines(item);
              const heading = getGuideHeading(item);

              return (
                <article key={`${heading ?? lines[0] ?? item.description ?? item.details ?? index}-${index}`} className="border-t border-[var(--border)] pt-3">
                  {heading ? <h3 className="text-sm font-black uppercase text-[var(--text)]">{heading}</h3> : null}
                  {item.description ? <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{item.description}</p> : null}
                  {item.details ? <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{item.details}</p> : null}
                  {lines.length > 0 ? (
                    <ul className="mt-2 grid gap-1 text-sm font-bold text-[var(--text)]">
                      {lines.map((line) => (
                        <li key={line} className="break-words border-l-2 border-[var(--accent)] pl-2">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {item.note ? <p className="mt-2 break-words text-sm font-bold text-[var(--muted)]">{item.note}</p> : null}
                </article>
              );
            })}
          </div>
        </aside>
      ) : null}

      <section className="tv-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="tv-label">Previous Attempts</p>
            <h2 className="mt-1 text-2xl font-black uppercase">{attempts.length} logged</h2>
          </div>
          {isCompleted ? (
            <span className="rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-2 py-1 text-xs font-black uppercase text-[var(--accent)]">
              Completed
            </span>
          ) : null}
        </div>
        {attempts.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {attempts.map((attempt) => {
              const loggedLimiter = normalizeLimiter(attempt.limiter);

              return (
                <article key={attempt.id} className="rounded-md border border-[var(--border)] bg-black/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
                    <span className="text-[var(--text)]">{formatAttemptDate(attempt.completedAt)}</span>
                    <span className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-xs font-black uppercase text-[var(--accent)]">
                      RPE {attempt.rpe}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-black uppercase">
                    {attempt.actualDurationMinutes ? (
                      <span className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-[var(--muted)]">
                        {attempt.actualDurationMinutes} min
                      </span>
                    ) : null}
                    {loggedLimiter ? (
                      <span className="rounded-sm border border-[rgba(215,255,47,0.35)] bg-black px-2 py-1 text-[var(--accent)]">
                        Limiter: {loggedLimiter}
                      </span>
                    ) : null}
                  </div>
                  {attempt.score ?? attempt.result ? (
                    <p className="mt-2 break-words text-sm font-bold text-[var(--text)]">
                      <span className="text-[var(--muted)]">Overall: </span>
                      {attempt.score ?? attempt.result}
                    </p>
                  ) : null}
                  {attempt.blockResults && attempt.blockResults.length > 0 ? (
                    <div className="mt-3 rounded-md border border-[var(--border)] bg-black/60 p-3">
                      <p className="tv-label text-[var(--accent)]">Block results</p>
                      <div className="mt-2 grid gap-2 text-sm font-bold">
                        {attempt.blockResults.map((blockResult) => (
                          <div key={blockResult.blockKey} className="grid gap-1 border-t border-[var(--border)] pt-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                            <span className="break-words font-black uppercase text-[var(--text)]">{blockResult.blockName}</span>
                            <span className="break-words text-[var(--muted)]">{getBlockResultSummary(blockResult)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {attempt.notes ? <p className="mt-2 break-words text-sm font-bold text-[var(--muted)]">{attempt.notes}</p> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm font-bold text-[var(--muted)]">No attempts logged yet. The form below can be used now and again later.</p>
        )}
      </section>

      <SessionCompleteForm
        workout={workout}
        workoutModified={Boolean(workoutOverride)}
        readyToLog={allNonSkippedBlocksDone}
        blockResults={finalBlockResults}
      />

      {showMobileLogCta ? (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden">
          <div className="mx-auto w-full max-w-6xl">
            <button
              type="button"
              onClick={scrollToLogForm}
              className="tv-button-primary min-h-14 w-full shadow-[0_10px_40px_rgba(0,0,0,0.55)]"
            >
              {allNonSkippedBlocksDone ? "Lock in score" : "Complete Session"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
