"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ClipboardPaste,
  Dumbbell,
  TriangleAlert,
} from "lucide-react";
import { parseManualHawkeyeText } from "@/lib/athlete/hawkeye";
import {
  createManualSession,
  saveManualSession,
  type AthleteSessionType,
} from "@/lib/planning-storage";
import { saveSessionLog, useNow } from "@/lib/storage";
import type { BlockResult, WorkoutIntensity } from "@/lib/types";

type ManualCategory = "crossfit" | "strength" | "conditioning" | "custom";

const exampleSession = `Back squat 5x5
then
20 min AMRAP
15 wall balls
10 box jumps
5 cleans`;

const categoryOptions: Array<{
  value: ManualCategory;
  label: string;
  sessionType: AthleteSessionType;
}> = [
  { value: "crossfit", label: "Hawkeye / CrossFit", sessionType: "crossfit" },
  { value: "strength", label: "Strength", sessionType: "strength" },
  {
    value: "conditioning",
    label: "Conditioning",
    sessionType: "conditioning",
  },
  { value: "custom", label: "Custom", sessionType: "custom" },
];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function intensityFromRpe(rpe: number): WorkoutIntensity {
  if (rpe <= 4) return "easy";
  if (rpe >= 8) return "hard";
  return "moderate";
}

export default function ManualTrainingLogPage() {
  const router = useRouter();
  const now = useNow();
  const [category, setCategory] = useState<ManualCategory>("crossfit");
  const [title, setTitle] = useState("Hawkeye session");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState("60");
  const [rpe, setRpe] = useState(7);
  const [rawText, setRawText] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const effectiveDate = date || (now ? localDateKey(new Date(now)) : "");
  const parsedDuration = Number(duration);
  const draft = useMemo(
    () =>
      rawText.trim()
        ? parseManualHawkeyeText(rawText, {
            title: title.trim() || undefined,
            category,
            durationMinutes:
              Number.isFinite(parsedDuration) && parsedDuration > 0
                ? parsedDuration
                : undefined,
            rpe,
          })
        : null,
    [rawText, title, category, parsedDuration, rpe],
  );
  const selectedCategory = categoryOptions.find(
    (option) => option.value === category,
  )!;
  const loadSignals = draft
    ? Object.entries(draft.load.scores)
        .filter(([, value]) => value > 0)
        .sort((first, second) => second[1] - first[1])
        .slice(0, 5)
    : [];

  function saveManualLog(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (
      !draft ||
      !effectiveDate ||
      !Number.isFinite(parsedDuration) ||
      parsedDuration < 1
    ) {
      setError(
        "Add the session text, date, and a valid duration before saving.",
      );
      return;
    }

    const manual = createManualSession({
      title: title.trim() || draft.title,
      type: selectedCategory.sessionType,
      scheduledDate: effectiveDate,
      durationMinutes: parsedDuration,
      intensity: intensityFromRpe(rpe),
      prescription: rawText.trim(),
      targetStimulus:
        "Completed manual session; preserve the original pasted prescription.",
    });
    const completedAt =
      effectiveDate === localDateKey(new Date(now || Date.now()))
        ? new Date(now || Date.now()).toISOString()
        : new Date(`${effectiveDate}T12:00:00`).toISOString();
    const blockResults: BlockResult[] = draft.blocks.map((block) => ({
      blockKey: block.id,
      blockName: block.name,
      blockType: block.type,
      blockItems: block.items,
      status: "done",
      result: block.items.join(" · "),
    }));

    saveManualSession(manual);
    saveSessionLog({
      id: `${manual.id}-${Date.now()}`,
      workoutId: manual.id,
      workoutTitle: manual.originalWorkout.title,
      workoutCategory: manual.originalWorkout.category,
      workoutSessionType: manual.originalWorkout.sessionType,
      workoutDate: effectiveDate,
      completedAt,
      rpe,
      actualDurationMinutes: parsedDuration,
      notes: notes.trim() || undefined,
      result: draft.metcon,
      blockResults,
    });
    router.push("/log");
  }

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Training log
        </button>
        <p className="tv-label mt-3 text-[var(--accent)]">
          Fast manual capture
        </p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-5xl">
          Log Hawkeye / CrossFit
        </h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-[var(--muted)]">
          Paste what you did. TrainVault parses lifts, metcon, movements, and
          training cost locally; you can verify the structure before it is
          saved.
        </p>
      </header>

      <form
        onSubmit={saveManualLog}
        className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]"
      >
        <section className="tv-card p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="tv-label">Type</span>
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as ManualCategory)
                }
                className="tv-input"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Date</span>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(event) => setDate(event.target.value)}
                className="tv-input"
              />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={180}
                className="tv-input"
              />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Duration minutes</span>
              <input
                type="number"
                min="1"
                max="1440"
                inputMode="numeric"
                required
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="tv-input"
              />
            </label>
          </div>

          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="manual-session-text" className="tv-label">
                Session text
              </label>
              <button
                type="button"
                onClick={() => setRawText(exampleSession)}
                className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"
              >
                <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
                Load example
              </button>
            </div>
            <textarea
              id="manual-session-text"
              required
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              maxLength={8_000}
              rows={12}
              className="tv-input mt-2 min-h-72 resize-y py-3 font-mono text-sm"
              placeholder={exampleSession}
            />
          </div>

          <div className="mt-5">
            <p className="tv-label">Session RPE</p>
            <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRpe(value)}
                    aria-pressed={rpe === value}
                    className={`min-h-11 rounded-sm border text-sm font-black ${
                      rpe === value
                        ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                        : "border-[var(--border)] bg-black text-[var(--text)]"
                    }`}
                  >
                    {value}
                  </button>
                ),
              )}
            </div>
          </div>

          <label className="mt-5 grid gap-2">
            <span className="tv-label">Field notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2_000}
              rows={4}
              className="tv-input resize-y py-3"
              placeholder="Loads, score, limiter, pain-free or anything to remember."
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 text-sm font-bold text-[var(--muted)]"
            >
              <TriangleAlert
                className="h-5 w-5 shrink-0 text-[var(--accent)]"
                aria-hidden="true"
              />
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!draft || now === 0}
            className="tv-button-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Save completed session
          </button>
        </section>

        <aside className="grid content-start gap-4">
          <section className="tv-card border-[rgba(215,255,47,0.34)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="tv-label text-[var(--accent)]">Local parse</p>
                <h2 className="mt-1 text-xl font-black uppercase">
                  Verify before saving
                </h2>
              </div>
              <Dumbbell
                className="h-5 w-5 text-[var(--accent)]"
                aria-hidden="true"
              />
            </div>

            {draft ? (
              <>
                <div className="mt-4 grid gap-3">
                  {draft.blocks.map((block) => (
                    <article
                      key={block.id}
                      className="border border-[var(--border)] bg-black p-3"
                    >
                      <p className="text-xs font-black uppercase text-[var(--accent)]">
                        {block.name}
                      </p>
                      <ul className="mt-2 grid gap-1 text-sm font-bold text-[var(--muted)]">
                        {block.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>

                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <p className="tv-label">
                    Training cost · {draft.load.confidence} confidence
                  </p>
                  <p className="mt-2 text-3xl font-black text-[var(--accent)]">
                    {draft.load.plannedCost}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {loadSignals.map(([axis, value]) => (
                      <span
                        key={axis}
                        className="tv-chip border-[var(--border)] bg-black text-[var(--muted)]"
                      >
                        {axis.replace(/([A-Z])/g, " $1")} {value}
                      </span>
                    ))}
                  </div>
                </div>

                {draft.parseWarnings.length > 0 ? (
                  <div className="mt-4 border-t border-[var(--border)] pt-3">
                    {draft.parseWarnings.map((warning) => (
                      <p
                        key={warning}
                        className="text-xs font-bold text-[var(--muted)]"
                      >
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-4 text-sm font-bold text-[var(--muted)]">
                Paste the session to see the deterministic structure. No
                external service is required.
              </p>
            )}
          </section>
        </aside>
      </form>
    </div>
  );
}

