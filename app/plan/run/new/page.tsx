"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Footprints,
  Repeat2,
  TriangleAlert,
} from "lucide-react";
import {
  createManualSession,
  saveManualSession,
} from "@/lib/planning-storage";
import {
  buildStructuredRunningWorkout,
  describeStructuredRunningWorkout,
} from "@/lib/structured-running";
import { saveStructuredRunningWorkout } from "@/lib/structured-running-storage";
import { useNow } from "@/lib/storage";

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function positiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export default function NewStructuredRunPage() {
  const router = useRouter();
  const now = useNow();
  const [name, setName] = useState("Sunday easy run");
  const [date, setDate] = useState("");
  const [mode, setMode] = useState<"continuous" | "intervals">("continuous");
  const [warmup, setWarmup] = useState("10");
  const [continuous, setContinuous] = useState("30");
  const [repetitions, setRepetitions] = useState("6");
  const [distance, setDistance] = useState("800");
  const [recovery, setRecovery] = useState("120");
  const [cooldown, setCooldown] = useState("5");
  const [fastestPace, setFastestPace] = useState("5:30");
  const [slowestPace, setSlowestPace] = useState("6:00");
  const [description, setDescription] = useState(
    "Easy aerobic development with relaxed mechanics.",
  );
  const [error, setError] = useState("");
  const effectiveDate = date || (now ? localDateKey(new Date(now)) : "");
  const preview = useMemo(() => {
    if (!effectiveDate) return { lines: [], error: "" };

    try {
      const workout = buildStructuredRunningWorkout({
        id: "preview",
        name,
        date: effectiveDate,
        mode,
        warmupMinutes: positiveNumber(warmup),
        cooldownMinutes: positiveNumber(cooldown),
        continuousMinutes: positiveNumber(continuous),
        repetitions: Math.round(positiveNumber(repetitions)),
        workDistanceMeters: positiveNumber(distance),
        recoverySeconds: positiveNumber(recovery),
        fastestPace,
        slowestPace,
        description,
      });
      return {
        lines: describeStructuredRunningWorkout(workout),
        minutes: Math.max(
          1,
          Math.round((workout.estimatedDurationSeconds ?? 0) / 60),
        ),
        error: "",
      };
    } catch (caught) {
      return {
        lines: [],
        minutes: 0,
        error:
          caught instanceof Error
            ? caught.message
            : "The structured run is invalid.",
      };
    }
  }, [
    continuous,
    cooldown,
    description,
    distance,
    effectiveDate,
    fastestPace,
    mode,
    name,
    recovery,
    repetitions,
    slowestPace,
    warmup,
  ]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (preview.error || !effectiveDate || !preview.minutes) {
      setError(preview.error || "Complete the structured prescription.");
      return;
    }

    try {
      const manual = createManualSession({
        title: name,
        type: "run",
        scheduledDate: effectiveDate,
        durationMinutes: preview.minutes,
        minimumMinutes: Math.max(15, Math.round(preview.minutes * 0.6)),
        intensity: mode === "continuous" ? "easy" : "hard",
        prescription: preview.lines.join("\n"),
        targetStimulus: description,
      });
      const structuredWorkout = buildStructuredRunningWorkout({
        id: manual.id,
        name,
        date: effectiveDate,
        mode,
        warmupMinutes: positiveNumber(warmup),
        cooldownMinutes: positiveNumber(cooldown),
        continuousMinutes: positiveNumber(continuous),
        repetitions: Math.round(positiveNumber(repetitions)),
        workDistanceMeters: positiveNumber(distance),
        recoverySeconds: positiveNumber(recovery),
        fastestPace,
        slowestPace,
        description,
      });

      saveManualSession(manual);
      saveStructuredRunningWorkout(structuredWorkout);
      router.push(`/session/${manual.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The run could not be created.",
      );
    }
  }

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <Link
          href="/plan"
          className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Training calendar
        </Link>
        <p className="tv-label mt-3 text-[var(--accent)]">Structured run</p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-5xl">
          Build Garmin-safe steps
        </h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-[var(--muted)]">
          Create explicit time, distance, repeat, recovery, and pace steps.
          TrainVault never guesses Garmin instructions from free text.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
      >
        <section className="tv-card p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 sm:col-span-2">
              <span className="tv-label">Workout name</span>
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="tv-input"
              />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Calendar date</span>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(event) => setDate(event.target.value)}
                className="tv-input"
              />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Session shape</span>
              <select
                value={mode}
                onChange={(event) => {
                  const next = event.target.value as
                    | "continuous"
                    | "intervals";
                  setMode(next);
                  if (next === "intervals" && name === "Sunday easy run") {
                    setName("6 × 800 m");
                    setFastestPace("3:58");
                    setSlowestPace("4:03");
                    setDescription(
                      "Threshold development with controlled, repeatable reps.",
                    );
                  }
                }}
                className="tv-input"
              >
                <option value="continuous">Continuous run</option>
                <option value="intervals">Intervals / repeats</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Warm-up minutes</span>
              <input
                type="number"
                min="0"
                max="240"
                value={warmup}
                onChange={(event) => setWarmup(event.target.value)}
                className="tv-input"
              />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Cool-down minutes</span>
              <input
                type="number"
                min="0"
                max="240"
                value={cooldown}
                onChange={(event) => setCooldown(event.target.value)}
                className="tv-input"
              />
            </label>
          </div>

          {mode === "continuous" ? (
            <label className="mt-4 grid gap-2">
              <span className="tv-label">Continuous work minutes</span>
              <input
                type="number"
                min="1"
                max="1440"
                value={continuous}
                onChange={(event) => setContinuous(event.target.value)}
                className="tv-input"
              />
            </label>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2">
                <span className="tv-label">Repetitions</span>
                <input
                  type="number"
                  min="2"
                  max="99"
                  value={repetitions}
                  onChange={(event) => setRepetitions(event.target.value)}
                  className="tv-input"
                />
              </label>
              <label className="grid gap-2">
                <span className="tv-label">Work metres</span>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={distance}
                  onChange={(event) => setDistance(event.target.value)}
                  className="tv-input"
                />
              </label>
              <label className="grid gap-2">
                <span className="tv-label">Recovery seconds</span>
                <input
                  type="number"
                  min="1"
                  max="86400"
                  value={recovery}
                  onChange={(event) => setRecovery(event.target.value)}
                  className="tv-input"
                />
              </label>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="tv-label">Fastest pace · mm:ss/km</span>
              <input
                inputMode="numeric"
                pattern="\d{1,2}:[0-5]\d"
                value={fastestPace}
                onChange={(event) => setFastestPace(event.target.value)}
                className="tv-input"
                placeholder="Leave both pace fields blank for open target"
              />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Slowest pace · mm:ss/km</span>
              <input
                inputMode="numeric"
                pattern="\d{1,2}:[0-5]\d"
                value={slowestPace}
                onChange={(event) => setSlowestPace(event.target.value)}
                className="tv-input"
              />
            </label>
            <label className="grid gap-2 sm:col-span-2">
              <span className="tv-label">Target stimulus / description</span>
              <textarea
                maxLength={1024}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="tv-input resize-y py-3"
              />
            </label>
          </div>

          {error || preview.error ? (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 text-sm font-bold text-[var(--muted)]"
            >
              <TriangleAlert
                className="h-5 w-5 shrink-0 text-[var(--accent)]"
                aria-hidden="true"
              />
              {error || preview.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={Boolean(preview.error) || now === 0}
            className="tv-button-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Add structured run
          </button>
        </section>

        <aside className="grid content-start gap-4">
          <section className="tv-card border-[rgba(215,255,47,0.34)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="tv-label text-[var(--accent)]">Preview</p>
                <h2 className="mt-1 text-xl font-black uppercase">
                  {preview.minutes ?? 0} min estimated
                </h2>
              </div>
              {mode === "intervals" ? (
                <Repeat2
                  className="h-5 w-5 text-[var(--accent)]"
                  aria-hidden="true"
                />
              ) : (
                <Footprints
                  className="h-5 w-5 text-[var(--accent)]"
                  aria-hidden="true"
                />
              )}
            </div>
            <ol className="mt-4 grid gap-2">
              {preview.lines.map((line, index) => (
                <li
                  key={`${line}-${index}`}
                  className="grid grid-cols-[2rem_minmax(0,1fr)] border border-[var(--border)] bg-black"
                >
                  <span className="grid place-items-center border-r border-[var(--border)] text-xs font-black text-[var(--accent)]">
                    {index + 1}
                  </span>
                  <span className="p-3 text-sm font-bold text-[var(--muted)]">
                    {line}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section className="tv-card p-4">
            <p className="tv-label">Garmin safety boundary</p>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">
              Upload is a separate action on the session page. TrainVault shows
              the real bridge response and never fakes success.
            </p>
          </section>
        </aside>
      </form>
    </div>
  );
}

