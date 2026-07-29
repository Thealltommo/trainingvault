"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  Award,
  Clock3,
  Dumbbell,
  History,
  Medal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Timer,
  Trophy,
} from "lucide-react";
import {
  isPersonalRecordImprovement,
  type AthleteEventType,
  type PersonalRecord,
} from "@/lib/athlete";
import {
  archivePersonalRecord,
  correctPersonalRecord,
  createPersonalRecord,
  restorePersonalRecord,
  useAthleteRecordsStore,
  type PersonalRecordDraft,
  type StoredPersonalRecord,
} from "@/lib/athlete-records-storage";

type RecordKind = PersonalRecord["kind"];
type RecordFilter = "all" | RecordKind;

const EVENT_OPTIONS: Array<{
  value: AthleteEventType;
  label: string;
}> = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half_marathon", label: "Half marathon" },
  { value: "marathon", label: "Marathon" },
  { value: "crossfit_competition", label: "CrossFit competition" },
  { value: "hyrox", label: "HYROX" },
  { value: "spartan_sprint", label: "Spartan Sprint" },
  { value: "spartan_super", label: "Spartan Super" },
  { value: "spartan_beast", label: "Spartan Beast" },
  { value: "spartan_weekend", label: "Spartan weekend" },
  { value: "fell_race", label: "Fell race" },
  { value: "custom", label: "Custom" },
];

const RUNNING_DISTANCE_OPTIONS = [
  { value: "1k", label: "1 km" },
  { value: "1_mile", label: "1 mile" },
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half_marathon", label: "Half marathon" },
] as const;

type RecordForm = {
  kind: RecordKind;
  date: string;
  time: string;
  notes: string;
  runningDistance: "1k" | "1_mile" | "5k" | "10k" | "half_marathon";
  sourceActivityId: string;
  movement: string;
  load: string;
  unit: "kg" | "lb";
  reps: string;
  benchmarkName: string;
  benchmarkScore: string;
  eventType: AthleteEventType;
  eventName: string;
  placing: string;
};

const EMPTY_FORM: RecordForm = {
  kind: "running",
  date: "",
  time: "",
  notes: "",
  runningDistance: "5k",
  sourceActivityId: "",
  movement: "",
  load: "",
  unit: "kg",
  reps: "",
  benchmarkName: "",
  benchmarkScore: "",
  eventType: "custom",
  eventName: "",
  placing: "",
};

function parseDuration(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return undefined;

  const parts = cleaned.split(":");
  if (
    parts.length > 3 ||
    parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))
  ) {
    return undefined;
  }

  const numbers = parts.map(Number);
  let seconds = 0;

  if (numbers.length === 3) {
    seconds = numbers[0] * 3_600 + numbers[1] * 60 + numbers[2];
  } else if (numbers.length === 2) {
    seconds = numbers[0] * 60 + numbers[1];
  } else {
    seconds = numbers[0];
  }

  return Number.isFinite(seconds) && seconds > 0
    ? Math.round(seconds)
    : undefined;
}

function formatDuration(totalSeconds: number | undefined) {
  if (totalSeconds === undefined) return "No time recorded";

  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function eventTypeLabel(type: AthleteEventType) {
  return (
    EVENT_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
}

function runningDistanceLabel(
  distance: "1k" | "1_mile" | "5k" | "10k" | "half_marathon",
) {
  return (
    RUNNING_DISTANCE_OPTIONS.find((option) => option.value === distance)
      ?.label ?? distance
  );
}

function recordSnapshot(record: StoredPersonalRecord): PersonalRecord {
  if (record.kind === "running") {
    return {
      id: record.id,
      kind: "running",
      date: record.date,
      distance: record.distance,
      timeSeconds: record.timeSeconds,
      sourceActivityId: record.sourceActivityId,
      notes: record.notes,
    };
  }

  if (record.kind === "strength") {
    return {
      id: record.id,
      kind: "strength",
      date: record.date,
      movement: record.movement,
      load: record.load,
      unit: record.unit,
      reps: record.reps,
      notes: record.notes,
    };
  }

  if (record.kind === "benchmark") {
    return {
      id: record.id,
      kind: "benchmark",
      date: record.date,
      name: record.name,
      score: record.score,
      timeSeconds: record.timeSeconds,
      notes: record.notes,
    };
  }

  return {
    id: record.id,
    kind: "event",
    date: record.date,
    eventType: record.eventType,
    name: record.name,
    timeSeconds: record.timeSeconds,
    placing: record.placing,
    notes: record.notes,
  };
}

function recordTitle(record: PersonalRecord) {
  if (record.kind === "running") {
    return `${runningDistanceLabel(record.distance)} best`;
  }
  if (record.kind === "strength") return record.movement;
  if (record.kind === "benchmark") return record.name;
  return record.name;
}

function recordResult(record: PersonalRecord) {
  if (record.kind === "running") {
    return formatDuration(record.timeSeconds);
  }
  if (record.kind === "strength") {
    return `${record.load.toLocaleString("en-GB")} ${record.unit} × ${record.reps}`;
  }
  if (record.kind === "benchmark") {
    return record.timeSeconds
      ? `${record.score} · ${formatDuration(record.timeSeconds)}`
      : record.score;
  }

  const pieces = [
    record.timeSeconds ? formatDuration(record.timeSeconds) : null,
    record.placing ? `Place ${record.placing}` : null,
  ].filter(Boolean);
  return pieces.join(" · ") || "Result recorded";
}

function kindLabel(kind: RecordKind) {
  if (kind === "running") return "Running";
  if (kind === "strength") return "Strength";
  if (kind === "benchmark") return "Benchmark";
  return "Event result";
}

function formFromRecord(record: StoredPersonalRecord): RecordForm {
  const base: RecordForm = {
    ...EMPTY_FORM,
    kind: record.kind,
    date: record.date,
    notes: record.notes ?? "",
  };

  if (record.kind === "running") {
    return {
      ...base,
      runningDistance: record.distance,
      time: formatDuration(record.timeSeconds),
      sourceActivityId: record.sourceActivityId ?? "",
    };
  }

  if (record.kind === "strength") {
    return {
      ...base,
      movement: record.movement,
      load: String(record.load),
      unit: record.unit,
      reps: String(record.reps),
    };
  }

  if (record.kind === "benchmark") {
    return {
      ...base,
      benchmarkName: record.name,
      benchmarkScore: record.score,
      time: record.timeSeconds
        ? formatDuration(record.timeSeconds)
        : "",
    };
  }

  return {
    ...base,
    eventType: record.eventType,
    eventName: record.name,
    time: record.timeSeconds ? formatDuration(record.timeSeconds) : "",
    placing: record.placing ? String(record.placing) : "",
  };
}

function toDraft(form: RecordForm): PersonalRecordDraft | null {
  const notes = form.notes || undefined;
  const timeSeconds = parseDuration(form.time);

  if (form.time.trim() && timeSeconds === undefined) {
    return null;
  }

  if (form.kind === "running") {
    if (!timeSeconds) return null;
    return {
      kind: "running",
      date: form.date,
      distance: form.runningDistance,
      timeSeconds,
      sourceActivityId: form.sourceActivityId || undefined,
      notes,
    };
  }

  if (form.kind === "strength") {
    const load = Number(form.load);
    const reps = Number(form.reps);
    if (
      !form.movement.trim() ||
      !Number.isFinite(load) ||
      load < 0 ||
      !Number.isInteger(reps) ||
      reps < 1
    ) {
      return null;
    }
    return {
      kind: "strength",
      date: form.date,
      movement: form.movement,
      load,
      unit: form.unit,
      reps,
      notes,
    };
  }

  if (form.kind === "benchmark") {
    if (!form.benchmarkName.trim() || !form.benchmarkScore.trim()) {
      return null;
    }
    return {
      kind: "benchmark",
      date: form.date,
      name: form.benchmarkName,
      score: form.benchmarkScore,
      timeSeconds,
      notes,
    };
  }

  const placing = form.placing ? Number(form.placing) : undefined;
  if (
    !form.eventName.trim() ||
    (placing !== undefined &&
      (!Number.isInteger(placing) || placing < 1))
  ) {
    return null;
  }
  return {
    kind: "event",
    date: form.date,
    eventType: form.eventType,
    name: form.eventName,
    timeSeconds,
    placing,
    notes,
  };
}

function recordIcon(kind: RecordKind) {
  if (kind === "running") return Timer;
  if (kind === "strength") return Dumbbell;
  if (kind === "benchmark") return Trophy;
  return Medal;
}

export default function RecordsPage() {
  const store = useAthleteRecordsStore();
  const [form, setForm] = useState<RecordForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RecordFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const records = useMemo(
    () =>
      store.personalRecords.filter(
        (record) =>
          (showArchived || !record.archivedAt) &&
          (filter === "all" || record.kind === filter),
      ),
    [filter, showArchived, store.personalRecords],
  );
  const activeRecords = useMemo(
    () => store.personalRecords.filter((record) => !record.archivedAt),
    [store.personalRecords],
  );

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function beginEdit(record: StoredPersonalRecord) {
    setForm(formFromRecord(record));
    setEditingId(record.id);
    setFeedback("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setError("");

    const draft = toDraft(form);
    if (!draft || !form.date) {
      setError(
        "Check the required fields and use h:mm:ss or mm:ss for times.",
      );
      return;
    }

    const result = editingId
      ? correctPersonalRecord(editingId, draft)
      : createPersonalRecord(draft);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setFeedback(
      editingId
        ? "Correction saved. The prior value remains in history."
        : "Performance record saved locally.",
    );
    resetForm();
  }

  function handleArchive(record: StoredPersonalRecord) {
    if (
      !window.confirm(
        `Archive ${recordTitle(record)}? Its values and correction history will remain recoverable.`,
      )
    ) {
      return;
    }

    const result = archivePersonalRecord(record.id);
    setError(result.ok ? "" : result.error);
    setFeedback(
      result.ok
        ? "Record archived. Enable archived records to restore it."
        : "",
    );
    if (editingId === record.id) resetForm();
  }

  function handleRestore(record: StoredPersonalRecord) {
    const result = restorePersonalRecord(record.id);
    setError(result.ok ? "" : result.error);
    setFeedback(result.ok ? "Record restored." : "");
  }

  function isCurrentBest(record: StoredPersonalRecord) {
    const snapshot = recordSnapshot(record);
    const comparableByDefinition =
      snapshot.kind === "running" ||
      snapshot.kind === "strength" ||
      (snapshot.kind === "benchmark" &&
        snapshot.timeSeconds !== undefined) ||
      (snapshot.kind === "event" && snapshot.timeSeconds !== undefined);
    const comparableResults = activeRecords
      .filter((candidate) => candidate.id !== record.id)
      .map((candidate) =>
        isPersonalRecordImprovement(
          recordSnapshot(candidate),
          snapshot,
        ),
      )
      .filter((result): result is boolean => result !== undefined);

    if (!comparableByDefinition && comparableResults.length === 0) {
      return null;
    }

    return !comparableResults.some(Boolean);
  }

  const correctionHistory = historyId
    ? store.personalRecordHistory.filter(
        (revision) => revision.recordId === historyId,
      )
    : [];

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <Link
          href="/insights"
          className="inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Insights
        </Link>
        <p className="tv-label mt-3 text-[var(--accent)]">
          Personal records
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black uppercase leading-none sm:text-5xl">
              Evidence of progress
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
              Record running times, strength performances, named benchmarks,
              and event results. Manual corrections retain the prior value.
            </p>
          </div>
          <span className="tv-chip border-[rgba(215,255,47,0.4)] text-[var(--accent)]">
            {activeRecords.length} active records
          </span>
        </div>
      </header>

      <section className="tv-card border-[rgba(215,255,47,0.3)] p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-sm bg-[var(--accent)] text-black">
            {editingId ? (
              <Pencil className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Plus className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="tv-label text-[var(--accent)]">
              {editingId ? "Manual correction" : "New evidence"}
            </p>
            <h2 className="text-2xl font-black uppercase">
              {editingId ? "Correct record" : "Add performance"}
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1.5">
              <span className="tv-label">Record type *</span>
              <select
                value={form.kind}
                onChange={(event) =>
                  setForm((current) => ({
                    ...EMPTY_FORM,
                    kind: event.target.value as RecordKind,
                    date: current.date,
                    notes: current.notes,
                  }))
                }
                className="tv-input"
              >
                <option value="running">Running</option>
                <option value="strength">Strength</option>
                <option value="benchmark">Benchmark</option>
                <option value="event">Event result</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="tv-label">Date *</span>
              <input
                required
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                className="tv-input"
              />
            </label>
            {(form.kind === "running" ||
              form.kind === "benchmark" ||
              form.kind === "event") && (
              <label className="grid gap-1.5">
                <span className="tv-label">
                  Time {form.kind === "running" ? "*" : "(optional)"}
                </span>
                <input
                  required={form.kind === "running"}
                  value={form.time}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      time: event.target.value,
                    }))
                  }
                  className="tv-input"
                  inputMode="decimal"
                  placeholder="h:mm:ss or mm:ss"
                />
              </label>
            )}
          </div>

          {form.kind === "running" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="tv-label">Distance *</span>
                <select
                  value={form.runningDistance}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      runningDistance: event.target
                        .value as RecordForm["runningDistance"],
                    }))
                  }
                  className="tv-input"
                >
                  {RUNNING_DISTANCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="tv-label">Source activity ID</span>
                <input
                  value={form.sourceActivityId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sourceActivityId: event.target.value,
                    }))
                  }
                  className="tv-input"
                  placeholder="Optional Garmin or import reference"
                  maxLength={160}
                />
              </label>
            </div>
          ) : null}

          {form.kind === "strength" ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="tv-label">Movement *</span>
                <input
                  required
                  value={form.movement}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      movement: event.target.value,
                    }))
                  }
                  className="tv-input"
                  placeholder="Back squat, deadlift, strict press…"
                  maxLength={120}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="tv-label">Load *</span>
                <input
                  required
                  type="number"
                  min="0"
                  max="10000"
                  step="0.01"
                  inputMode="decimal"
                  value={form.load}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      load: event.target.value,
                    }))
                  }
                  className="tv-input"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1.5">
                  <span className="tv-label">Unit *</span>
                  <select
                    value={form.unit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        unit: event.target.value as "kg" | "lb",
                      }))
                    }
                    className="tv-input"
                  >
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="tv-label">Reps *</span>
                  <input
                    required
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    inputMode="numeric"
                    value={form.reps}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        reps: event.target.value,
                      }))
                    }
                    className="tv-input"
                  />
                </label>
              </div>
            </div>
          ) : null}

          {form.kind === "benchmark" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="tv-label">Benchmark name *</span>
                <input
                  required
                  value={form.benchmarkName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      benchmarkName: event.target.value,
                    }))
                  }
                  className="tv-input"
                  placeholder="Fran, Murph, 2K row…"
                  maxLength={120}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="tv-label">Score *</span>
                <input
                  required
                  value={form.benchmarkScore}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      benchmarkScore: event.target.value,
                    }))
                  }
                  className="tv-input"
                  placeholder="Rounds, reps, calories or result"
                  maxLength={240}
                />
              </label>
            </div>
          ) : null}

          {form.kind === "event" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1.5">
                <span className="tv-label">Event type *</span>
                <select
                  value={form.eventType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      eventType: event.target.value as AthleteEventType,
                    }))
                  }
                  className="tv-input"
                >
                  {EVENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="tv-label">Event name *</span>
                <input
                  required
                  value={form.eventName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      eventName: event.target.value,
                    }))
                  }
                  className="tv-input"
                  placeholder="Race or competition name"
                  maxLength={120}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="tv-label">Placing</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.placing}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      placing: event.target.value,
                    }))
                  }
                  className="tv-input"
                  placeholder="Optional"
                />
              </label>
            </div>
          ) : null}

          <label className="grid gap-1.5">
            <span className="tv-label">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              className="tv-input min-h-24 resize-y"
              placeholder="Conditions, standards, equipment or useful context"
              maxLength={2000}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="tv-button-primary">
              <Save className="h-4 w-4" aria-hidden="true" />
              {editingId ? "Save correction" : "Save record"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="tv-button-ghost"
              >
                Cancel
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-sm font-bold text-red-300">
              {error}
            </p>
          ) : null}
          {feedback ? (
            <p className="border-l-2 border-[var(--accent)] pl-3 text-sm font-bold">
              {feedback}
            </p>
          ) : null}
        </form>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">
              Performance ledger
            </p>
            <h2 className="mt-1 text-2xl font-black uppercase">
              Manual and attributable
            </h2>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Show archived
          </label>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ["all", "All"],
              ["running", "Running"],
              ["strength", "Strength"],
              ["benchmark", "Benchmarks"],
              ["event", "Events"],
            ] as Array<[RecordFilter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`min-h-11 shrink-0 rounded-sm border px-3 text-xs font-black uppercase ${
                filter === value
                  ? "border-[var(--accent)] bg-[rgba(215,255,47,0.12)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {records.length === 0 ? (
          <div className="tv-card border-dashed p-8 text-center">
            <Award
              className="mx-auto h-8 w-8 text-[var(--accent)]"
              aria-hidden="true"
            />
            <h3 className="mt-3 text-xl font-black uppercase">
              No records in this view
            </h3>
            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              TrainVault starts empty and only reflects performances you log.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {records.map((record) => {
              const Icon = recordIcon(record.kind);
              const currentBest = isCurrentBest(record);
              const historyCount = store.personalRecordHistory.filter(
                (revision) => revision.recordId === record.id,
              ).length;

              return (
                <article
                  key={record.id}
                  className={`tv-card p-4 ${
                    record.archivedAt ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-[rgba(215,255,47,0.35)] text-[var(--accent)]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tv-chip">
                          {kindLabel(record.kind)}
                        </span>
                        {currentBest === true && !record.archivedAt ? (
                          <span className="tv-chip border-[rgba(215,255,47,0.4)] text-[var(--accent)]">
                            Current best
                          </span>
                        ) : null}
                        {record.archivedAt ? (
                          <span className="tv-chip">Archived</span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 truncate text-xl font-black uppercase">
                        {recordTitle(record)}
                      </h3>
                      <p className="mt-1 text-3xl font-black text-[var(--accent)]">
                        {recordResult(record)}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-black uppercase text-[var(--muted)]">
                        <Clock3
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        {dateLabel(record.date)}
                        {record.kind === "event"
                          ? ` · ${eventTypeLabel(record.eventType)}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {record.notes ? (
                    <p className="mt-4 whitespace-pre-wrap border-l-2 border-[var(--border)] pl-3 text-sm font-bold text-[var(--muted)]">
                      {record.notes}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                    {record.archivedAt ? (
                      <button
                        type="button"
                        onClick={() => handleRestore(record)}
                        className="tv-button-ghost"
                      >
                        <RotateCcw
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        Restore
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => beginEdit(record)}
                          className="tv-button-ghost"
                        >
                          <Pencil
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          Correct
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(record)}
                          className="tv-button-ghost"
                        >
                          <Archive
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          Archive
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setHistoryId((current) =>
                          current === record.id ? null : record.id,
                        )
                      }
                      className="tv-button-ghost"
                    >
                      <History
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                      History ({historyCount})
                    </button>
                  </div>

                  {historyId === record.id ? (
                    <div className="mt-3 grid gap-2 border border-[var(--border)] bg-black/40 p-3">
                      <p className="tv-label text-[var(--accent)]">
                        Retained revisions
                      </p>
                      {correctionHistory.length ? (
                        correctionHistory.map((revision) => (
                          <div
                            key={revision.id}
                            className="border-t border-[var(--border)] pt-2 text-xs font-bold"
                          >
                            <div className="flex flex-wrap justify-between gap-2">
                              <span className="font-black uppercase">
                                {revision.reason}
                              </span>
                              <span className="text-[var(--muted)]">
                                {new Intl.DateTimeFormat("en-GB", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(revision.changedAt))}
                              </span>
                            </div>
                            <p className="mt-1 text-[var(--muted)]">
                              {recordTitle(revision.snapshot)} ·{" "}
                              {recordResult(revision.snapshot)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs font-bold text-[var(--muted)]">
                          No retained revisions were found for this imported record.
                        </p>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
