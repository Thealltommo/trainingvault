"use client";

import { useMemo, useState } from "react";
import { CircleCheck, Mountain, Route, TimerReset } from "lucide-react";
import type { BlockResult, SessionLog, Workout } from "@/lib/types";
import { isRunWorkout } from "@/lib/coaching";
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
  "calves",
  "downhill",
  "feet",
  "fueling",
  "skill",
  "recovery",
  "other",
];

const terrainOptions: Array<NonNullable<SessionLog["terrain"]>> = [
  "road",
  "track",
  "trail",
  "fell",
  "treadmill",
  "mixed",
];

function positiveNumber(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePace(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const decimalMinutes = Number(trimmed);
    return Number.isFinite(decimalMinutes) && decimalMinutes > 0 ? Math.round(decimalMinutes * 60) : undefined;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return undefined;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) return undefined;
  return minutes * 60 + seconds;
}

export default function SessionCompleteForm({
  workout,
  workoutModified = false,
  readyToLog = false,
  blockResults = [],
}: SessionCompleteFormProps) {
  const runSession = useMemo(() => isRunWorkout(workout), [workout]);
  const [rpe, setRpe] = useState(7);
  const [actualDurationMinutes, setActualDurationMinutes] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [elevationM, setElevationM] = useState("");
  const [averagePace, setAveragePace] = useState("");
  const [averageHeartRate, setAverageHeartRate] = useState("");
  const [terrain, setTerrain] = useState<SessionLog["terrain"]>();
  const [score, setScore] = useState("");
  const [limiter, setLimiter] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  function handleSave() {
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
      actualDurationMinutes: positiveNumber(actualDurationMinutes),
      distanceKm: runSession ? positiveNumber(distanceKm) : undefined,
      elevationM: runSession ? positiveNumber(elevationM) : undefined,
      averagePaceSecondsPerKm: runSession ? parsePace(averagePace) : undefined,
      averageHeartRate: runSession ? positiveNumber(averageHeartRate) : undefined,
      terrain: runSession ? terrain : undefined,
      score: cleanedScore || undefined,
      limiter: normalizeLimiter(limiter),
      result: cleanedScore || undefined,
      notes: notes.trim() || undefined,
      blockResults,
    };

    saveSessionLog(log);
    setSaved(true);
    setActualDurationMinutes("");
    setDistanceKm("");
    setElevationM("");
    setAveragePace("");
    setAverageHeartRate("");
    setTerrain(undefined);
    setScore("");
    setLimiter("");
    setNotes("");
  }

  return (
    <section id="session-log-form" className="tv-card scroll-mt-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="tv-label">Complete Session</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">Lock the work in</h2>
          <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
            {readyToLog
              ? "All blocks checked. Log what actually happened so the coaching engine can adapt."
              : "You can log now or finish checking off the blocks first."}
          </p>
        </div>
        {saved ? (
          <span className="tv-status tv-status-good">
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <label className="tv-label" htmlFor="rpe-selector">
          Session RPE
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
              className={`min-h-10 rounded-lg border text-sm font-black transition-colors ${
                rpe === value
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text)] hover:border-[var(--accent)]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold text-[var(--muted)]">
          Use the whole session, not the hardest minute. This feeds the workload model.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="tv-label">Actual duration</span>
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
            placeholder={`${workout.minimumMinutes ?? workout.durationMinutes} min`}
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
      </div>

      {runSession ? (
        <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <p className="tv-label text-[var(--accent)]">Run signals</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                These fields turn generic advice into pace, hill and durability coaching.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-2">
              <span className="tv-label">Distance km</span>
              <input
                className="tv-input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={distanceKm}
                onChange={(event) => {
                  setDistanceKm(event.target.value);
                  setSaved(false);
                }}
                placeholder="10.25"
              />
            </label>

            <label className="grid gap-2">
              <span className="tv-label">Average pace / km</span>
              <div className="relative">
                <TimerReset className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
                <input
                  className="tv-input pl-9"
                  value={averagePace}
                  onChange={(event) => {
                    setAveragePace(event.target.value);
                    setSaved(false);
                  }}
                  placeholder="4:05"
                  inputMode="decimal"
                />
              </div>
            </label>

            <label className="grid gap-2">
              <span className="tv-label">Elevation m</span>
              <div className="relative">
                <Mountain className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
                <input
                  className="tv-input pl-9"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={elevationM}
                  onChange={(event) => {
                    setElevationM(event.target.value);
                    setSaved(false);
                  }}
                  placeholder="650"
                />
              </div>
            </label>

            <label className="grid gap-2">
              <span className="tv-label">Average HR</span>
              <input
                className="tv-input"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={averageHeartRate}
                onChange={(event) => {
                  setAverageHeartRate(event.target.value);
                  setSaved(false);
                }}
                placeholder="158"
              />
            </label>

            <label className="grid gap-2 sm:col-span-2">
              <span className="tv-label">Terrain</span>
              <select
                className="tv-input"
                value={terrain ?? ""}
                onChange={(event) => {
                  setTerrain((event.target.value || undefined) as SessionLog["terrain"]);
                  setSaved(false);
                }}
              >
                <option value="">Not set</option>
                {terrainOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      <div className="mt-5 grid gap-4">
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
