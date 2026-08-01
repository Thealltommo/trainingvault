"use client";

import { useMemo, useState } from "react";
import { CircleCheck } from "lucide-react";
import CompletedSessionReview from "@/components/CompletedSessionReview";
import { useGarminLocalState } from "@/lib/garmin-storage";
import { normalizeLimiter } from "@/lib/session-log";
import { saveSessionLog, useSessionLogs } from "@/lib/storage";
import { useStructuredRunningWorkout } from "@/lib/structured-running-storage";
import type {
  BlockResult,
  SessionExecution,
  SessionFeel,
  SessionLog,
  SessionRecoveryConcern,
  Workout,
} from "@/lib/types";

type SessionCompleteFormProps = {
  workout: Workout;
  workoutModified?: boolean;
  readyToLog?: boolean;
  blockResults?: BlockResult[];
};

const limiterOptions = [
  "grip",
  "engine",
  "barbell late",
  "shoulders",
  "pacing",
  "legs",
  "lungs",
  "skill",
  "recovery",
  "other",
];

const executionOptions: Array<{ value: SessionExecution; label: string }> = [
  { value: "as_planned", label: "As planned" },
  { value: "modified", label: "Modified" },
  { value: "cut_short", label: "Cut short" },
];

const feelOptions: Array<{ value: SessionFeel; label: string }> = [
  { value: "strong", label: "Strong" },
  { value: "controlled", label: "Controlled" },
  { value: "struggled", label: "Struggled" },
];

const recoveryOptions: Array<{
  value: SessionRecoveryConcern;
  label: string;
}> = [
  { value: "none", label: "No concern" },
  { value: "monitor", label: "Monitor" },
  { value: "protect_next", label: "Protect next quality" },
];

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="tv-label">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-md border px-2 text-xs font-black uppercase transition-colors ${
              value === option.value
                ? "border-[var(--accent)] bg-[rgba(215,255,47,0.14)] text-[var(--accent)]"
                : "border-[var(--border)] bg-black text-[var(--muted)] hover:border-[rgba(215,255,47,0.45)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SessionCompleteForm({
  workout,
  workoutModified = false,
  readyToLog = false,
  blockResults = [],
}: SessionCompleteFormProps) {
  const logs = useSessionLogs();
  const garmin = useGarminLocalState();
  const structuredWorkout = useStructuredRunningWorkout(workout.id);
  const existingLog = useMemo(
    () =>
      logs
        .filter((log) => log.workoutId === workout.id)
        .sort(
          (first, second) =>
            new Date(second.completedAt).getTime() -
            new Date(first.completedAt).getTime(),
        )[0] ?? null,
    [logs, workout.id],
  );
  const linkedActivityId = Object.values(garmin.activityLinks).find(
    (link) => link.sessionId === workout.id,
  )?.activityId;
  const linkedActivity =
    garmin.activities.find(
      (record) => record.activity.activityId === linkedActivityId,
    )?.activity ?? null;
  const [rpe, setRpe] = useState(existingLog?.rpe ?? 7);
  const [actualDurationMinutes, setActualDurationMinutes] = useState(
    existingLog?.actualDurationMinutes?.toString() ??
      (linkedActivity?.durationSeconds != null
        ? Math.round(linkedActivity.durationSeconds / 60).toString()
        : ""),
  );
  const [score, setScore] = useState(
    existingLog?.score ?? existingLog?.result ?? "",
  );
  const [limiter, setLimiter] = useState(existingLog?.limiter ?? "");
  const [notes, setNotes] = useState(existingLog?.notes ?? "");
  const [execution, setExecution] = useState<SessionExecution>(
    existingLog?.execution ?? (workoutModified ? "modified" : "as_planned"),
  );
  const [sessionFeel, setSessionFeel] = useState<SessionFeel>(
    existingLog?.sessionFeel ?? "controlled",
  );
  const [recoveryConcern, setRecoveryConcern] =
    useState<SessionRecoveryConcern>(
      existingLog?.recoveryConcern ?? "none",
    );
  const [saved, setSaved] = useState(false);

  function markDirty() {
    setSaved(false);
  }

  function handleSave() {
    const parsedDuration = Number(actualDurationMinutes);
    const cleanedScore = score.trim();
    const log: SessionLog = {
      id: existingLog?.id ?? `${workout.id}-${Date.now()}`,
      workoutId: workout.id,
      workoutTitle: workout.title,
      workoutCategory: workout.category,
      workoutSessionType: workout.sessionType,
      workoutDate: workout.date,
      workoutModified: workoutModified || existingLog?.workoutModified,
      completedAt: existingLog?.completedAt ?? new Date().toISOString(),
      rpe,
      actualDurationMinutes:
        actualDurationMinutes.trim() &&
        Number.isFinite(parsedDuration) &&
        parsedDuration > 0
          ? parsedDuration
          : undefined,
      score: cleanedScore || undefined,
      limiter: normalizeLimiter(limiter),
      result: cleanedScore || undefined,
      notes: notes.trim() || undefined,
      execution,
      sessionFeel,
      recoveryConcern,
      blockResults:
        blockResults.length > 0
          ? blockResults
          : existingLog?.blockResults,
    };

    saveSessionLog(log);
    setSaved(true);
  }

  return (
    <div className="grid gap-4">
      {existingLog || linkedActivity ? (
        <CompletedSessionReview
          workout={workout}
          log={existingLog}
          activity={linkedActivity}
          structuredWorkout={structuredWorkout}
        />
      ) : null}

      <section id="session-log-form" className="tv-card scroll-mt-24 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="tv-label">
              {existingLog ? "Athlete feedback" : "Complete session"}
            </p>
            <h2 className="mt-1 text-2xl font-black text-[var(--text)]">
              {existingLog ? "Update the athlete read" : "Close the training loop"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-relaxed text-[var(--muted)]">
              {existingLog
                ? "Your previous result is loaded below. Update it when later context changes the read."
                : readyToLog
                  ? "All blocks are checked. Add subjective cost and outcome so the next training decision has context."
                  : "Record what actually happened, not merely that the session finished."}
            </p>
          </div>
          {saved ? (
            <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-3 text-sm font-black uppercase text-[var(--accent)]">
              <CircleCheck className="h-4 w-4" aria-hidden="true" />
              Updated
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-5">
          <ChoiceGroup
            label="Execution"
            value={execution}
            options={executionOptions}
            onChange={(value) => {
              setExecution(value);
              markDirty();
            }}
          />
          <ChoiceGroup
            label="How did it land?"
            value={sessionFeel}
            options={feelOptions}
            onChange={(value) => {
              setSessionFeel(value);
              markDirty();
            }}
          />
          <ChoiceGroup
            label="Recovery concern"
            value={recoveryConcern}
            options={recoveryOptions}
            onChange={(value) => {
              setRecoveryConcern(value);
              markDirty();
            }}
          />
        </div>

        <div className="mt-5">
          <label className="tv-label" htmlFor="rpe-selector">
            RPE · subjective session cost
          </label>
          <div id="rpe-selector" className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setRpe(value);
                  markDirty();
                }}
                className={`min-h-11 rounded-md border text-sm font-black transition-colors ${
                  rpe === value
                    ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                    : "border-[var(--border)] bg-black text-[var(--text)] hover:border-[var(--accent)]"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="tv-label">Actual duration minutes</span>
            <input
              className="tv-input"
              type="number"
              min="1"
              inputMode="numeric"
              value={actualDurationMinutes}
              onChange={(event) => {
                setActualDurationMinutes(event.target.value);
                markDirty();
              }}
              placeholder={`${workout.minimumMinutes ?? workout.durationMinutes}`}
            />
          </label>

          <label className="grid gap-2">
            <span className="tv-label">Overall result / headline</span>
            <input
              className="tv-input"
              value={score}
              onChange={(event) => {
                setScore(event.target.value);
                markDirty();
              }}
              placeholder="Main score, headline lift, split, or summary"
            />
          </label>

          <label className="grid gap-2">
            <span className="tv-label">Primary limiter</span>
            <select
              className="tv-input"
              value={limiter}
              onChange={(event) => {
                setLimiter(event.target.value);
                markDirty();
              }}
            >
              <option value="">No limiter logged</option>
              {limiterOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 sm:col-span-2">
            <span className="tv-label">Context for the next decision</span>
            <textarea
              className="tv-input min-h-28 resize-y py-3"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                markDirty();
              }}
              placeholder="What held, what cracked, conditions, pain-free limitations, scaling, or what should change next time"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="tv-button-primary mt-5 w-full sm:w-auto"
        >
          {existingLog ? "Update feedback" : "Save feedback"}
        </button>
      </section>
    </div>
  );
}
