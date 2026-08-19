"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Mountain, Plus, Route, TimerReset } from "lucide-react";
import { saveSessionLog } from "@/lib/storage";
import type { SessionLog } from "@/lib/types";

type RunType = "Easy" | "Threshold" | "Intervals" | "Long" | "Hill / Fell" | "Race" | "Recovery";

const runTypes: RunType[] = ["Easy", "Threshold", "Intervals", "Long", "Hill / Fell", "Race", "Recovery"];
const terrains: Array<NonNullable<SessionLog["terrain"]>> = ["road", "track", "trail", "fell", "treadmill", "mixed"];

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePositive(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePace(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) return undefined;
  return minutes * 60 + seconds;
}

export default function QuickRunLog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [saved, setSaved] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [runType, setRunType] = useState<RunType>("Easy");
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [pace, setPace] = useState("");
  const [elevation, setElevation] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [terrain, setTerrain] = useState<SessionLog["terrain"]>("road");
  const [rpe, setRpe] = useState(5);
  const [notes, setNotes] = useState("");

  const calculatedPace = useMemo(() => {
    const distanceKm = parsePositive(distance);
    const durationMinutes = parsePositive(duration);
    if (!distanceKm || !durationMinutes) return undefined;
    return Math.round((durationMinutes * 60) / distanceKm);
  }, [distance, duration]);

  function formatPace(seconds: number | undefined) {
    if (!seconds) return "—";
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}/km`;
  }

  function save() {
    const distanceKm = parsePositive(distance);
    const durationMinutes = parsePositive(duration);
    if (!distanceKm || !durationMinutes) return;

    const now = new Date();
    const completedAt = date === todayKey() ? now.toISOString() : new Date(`${date}T12:00:00`).toISOString();
    const paceSeconds = parsePace(pace) ?? calculatedPace;
    const id = `manual-run-${Date.now()}`;

    saveSessionLog({
      id,
      workoutId: id,
      workoutTitle: `${runType} Run`,
      workoutCategory: "track",
      workoutSessionType: runType.toLowerCase().replaceAll(" ", "-"),
      workoutDate: date,
      completedAt,
      rpe,
      actualDurationMinutes: durationMinutes,
      distanceKm,
      elevationM: parsePositive(elevation),
      averagePaceSecondsPerKm: paceSeconds,
      averageHeartRate: parsePositive(heartRate),
      terrain,
      notes: notes.trim() || undefined,
    });

    setSaved(true);
    setDistance("");
    setDuration("");
    setPace("");
    setElevation("");
    setHeartRate("");
    setNotes("");
    window.setTimeout(() => setSaved(false), 2800);
  }

  return (
    <section className="tv-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="tv-label text-[var(--accent)]">Quick log</p>
            <p className="mt-0.5 text-sm font-black text-[var(--text)]">Add a run in seconds — no programme required</p>
          </div>
        </div>
        {saved ? <CheckCircle2 className="h-5 w-5 text-[var(--green)]" aria-hidden="true" /> : <ChevronDown className={`h-5 w-5 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />}
      </button>

      {open ? (
        <div className="border-t border-[var(--border)] p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1.5">
              <span className="tv-label">Date</span>
              <input className="tv-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="tv-label">Run type</span>
              <select className="tv-input" value={runType} onChange={(event) => setRunType(event.target.value as RunType)}>
                {runTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="tv-label">Distance km</span>
              <div className="relative">
                <Route className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--accent)]" aria-hidden="true" />
                <input className="tv-input pl-9" inputMode="decimal" type="number" min="0" step="0.01" value={distance} onChange={(event) => setDistance(event.target.value)} placeholder="10.00" />
              </div>
            </label>
            <label className="grid gap-1.5">
              <span className="tv-label">Duration min</span>
              <div className="relative">
                <TimerReset className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--accent)]" aria-hidden="true" />
                <input className="tv-input pl-9" inputMode="decimal" type="number" min="0" step="0.1" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="48" />
              </div>
            </label>
          </div>

          <div className="mt-4">
            <p className="tv-label">RPE</p>
            <div className="mt-2 grid grid-cols-10 gap-1.5">
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRpe(value)}
                  className={`min-h-9 rounded-lg border text-xs font-black ${rpe === value ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted)]"}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <details className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
            <summary className="cursor-pointer text-xs font-black text-[var(--accent)]">More run detail</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1.5">
                <span className="tv-label">Pace / km</span>
                <input className="tv-input" value={pace} onChange={(event) => setPace(event.target.value)} placeholder={formatPace(calculatedPace)} inputMode="decimal" />
              </label>
              <label className="grid gap-1.5">
                <span className="tv-label">Elevation m</span>
                <div className="relative">
                  <Mountain className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--red)]" aria-hidden="true" />
                  <input className="tv-input pl-9" inputMode="numeric" type="number" min="0" value={elevation} onChange={(event) => setElevation(event.target.value)} placeholder="420" />
                </div>
              </label>
              <label className="grid gap-1.5">
                <span className="tv-label">Average HR</span>
                <input className="tv-input" inputMode="numeric" type="number" min="0" value={heartRate} onChange={(event) => setHeartRate(event.target.value)} placeholder="155" />
              </label>
              <label className="grid gap-1.5">
                <span className="tv-label">Terrain</span>
                <select className="tv-input" value={terrain ?? ""} onChange={(event) => setTerrain(event.target.value as SessionLog["terrain"])}>
                  {terrains.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
                <span className="tv-label">Notes</span>
                <textarea className="tv-input min-h-24 resize-y py-3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Felt controlled, calves tight, trail was muddy…" />
              </label>
            </div>
          </details>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-[var(--muted)]">
              {distance && duration ? `Calculated pace: ${formatPace(calculatedPace)}` : "Distance + duration are the only required fields."}
            </p>
            <button type="button" onClick={save} disabled={!parsePositive(distance) || !parsePositive(duration)} className="tv-button-primary min-w-32 disabled:cursor-not-allowed disabled:opacity-45">
              Save run
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
