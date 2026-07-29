"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import type { BlockResult, SessionLog, Workout } from "@/lib/types";
import { normalizeLimiter } from "@/lib/session-log";
import { saveSessionLog } from "@/lib/storage";

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

export default function SessionCompleteForm({
  workout,
  workoutModified = false,
  readyToLog = false,
  blockResults = [],
}: SessionCompleteFormProps) {
  const [rpe, setRpe] = useState(7);
  const [actualDurationMinutes, setActualDurationMinutes] = useState("");
  const [score, setScore] = useState("");
  const [limiter, setLimiter] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const parsedDuration = Number(actualDurationMinutes);
    const cleanedScore = score.trim();
    const log: SessionLog = {
      id: `${workout.id}-${Date.now()}`,
      workoutId: workout.id,
      workoutTitle: workout.title,
      workoutCategory: workout.category,
      workoutSessionType: workout.sessionType,
      workoutDate: workout.date,
      workoutModified,
      completedAt: new Date().toISOString(),
      rpe,
      actualDurationMinutes:
        actualDurationMinutes.trim() && Number.isFinite(parsedDuration) && parsedDuration > 0
          ? parsedDuration
          : undefined,
      score: cleanedScore || undefined,
      limiter: normalizeLimiter(limiter),
      result: cleanedScore || undefined,
      notes: notes.trim() || undefined,
      blockResults,
    };

    saveSessionLog(log);
    setSaved(true);
    setActualDurationMinutes("");
    setScore("");
    setLimiter("");
    setNotes("");
  }

  return (
    <section id="session-log-form" className="tv-card scroll-mt-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="tv-label">Complete Session</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Lock the work in</h2>
          <p className="mt-2 text-sm font-bold text-[var(--muted)]">
            {readyToLog ? "All blocks checked. Lock in your score." : "You can log this session now or after checking off the blocks."}
          </p>
        </div>
        {saved ? (
          <span className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-3 text-sm font-black uppercase text-[var(--accent)]">
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <label className="tv-label" htmlFor="rpe-selector">
          RPE
        </label>
        <div id="rpe-selector" className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setRpe(value);
                setSaved(false);
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

      <div className="mt-5 grid gap-4">
        <label className="grid gap-2">
          <span className="tv-label">Actual Duration Minutes</span>
          <input
            className="tv-input"
            type="number"
            min="1"
            inputMode="numeric"
            value={actualDurationMinutes}
            onChange={(event) => {
              setActualDurationMinutes(event.target.value);
              setSaved(false);
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
              setSaved(false);
            }}
            placeholder="Main score, headline lift, or summary"
          />
        </label>

        <label className="grid gap-2">
          <span className="tv-label">Limiter</span>
          <select
            className="tv-input"
            value={limiter}
            onChange={(event) => {
              setLimiter(event.target.value);
              setSaved(false);
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

        <label className="grid gap-2">
          <span className="tv-label">Notes</span>
          <textarea
            className="tv-input min-h-28 resize-y py-3"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setSaved(false);
            }}
            placeholder="What held, what cracked, what to adjust next time"
          />
        </label>
      </div>

      <button type="button" onClick={handleSave} className="tv-button-primary mt-5 w-full sm:w-auto">
        Save log
      </button>
    </section>
  );
}
