"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Copy,
  ExternalLink,
  GripVertical,
  RotateCcw,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import {
  archiveSession,
  athleteSessionTypes,
  createManualSession,
  duplicateCalendarSession,
  getCalendarSessions,
  rescheduleCalendarSession,
  restoreSessionLifecycle,
  saveManualSession,
  skipSession,
  useManualSessions,
  useSessionLifecycleOverrides,
  type AthleteSessionType,
  type CalendarSession,
} from "@/lib/planning-storage";
import {
  saveSessionLog,
  useActiveProgrammeOptional,
  useSessionLogs,
  useWorkoutOverrides,
} from "@/lib/storage";
import type { WorkoutIntensity } from "@/lib/types";

type CalendarView = "week" | "month";

const statusClasses = {
  planned: "border-[var(--border)] text-[var(--muted)]",
  completed: "border-[var(--accent)] bg-[rgba(215,255,47,0.12)] text-[var(--accent)]",
  skipped: "border-white/20 bg-white/5 text-[var(--muted)]",
  modified: "border-[rgba(215,255,47,0.48)] bg-black text-[var(--accent)]",
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function getWeekDays(cursor: Date) {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function getMonthDays(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const days: Date[] = [];

  for (let date = start; date <= end; date = addDays(date, 1)) {
    days.push(date);
  }

  return days;
}

function formatRange(view: CalendarView, cursor: Date) {
  if (view === "month") {
    return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
    }).format(cursor);
  }

  const days = getWeekDays(cursor);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${formatter.format(days[0])} – ${formatter.format(days[6])}`;
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
  }).format(date);
}

function SessionCard({
  session,
  onComplete,
  onMove,
}: {
  session: CalendarSession;
  onComplete: (session: CalendarSession) => void;
  onMove: (session: CalendarSession, date: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: session.id,
    data: { session },
    disabled: session.status === "completed",
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.55 : undefined,
  };

  function handleDelete() {
    if (window.confirm("Remove this session from the plan? The original imported data and logs will be preserved.")) {
      archiveSession(session.id);
    }
  }

  function handleSkip() {
    const reason = window.prompt("Why are you skipping this session? (optional)") ?? "";
    skipSession(session.id, reason);
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-[#090909] p-2.5 shadow-[0_14px_36px_rgba(0,0,0,0.28)] ${statusClasses[session.status]}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 grid h-8 w-8 shrink-0 touch-none place-items-center rounded-sm border border-[var(--border)] bg-black text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Move ${session.workout.title}`}
          disabled={session.status === "completed"}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.64rem] font-black uppercase tracking-wide text-[var(--muted)]">
            {session.type} · {session.workout.durationMinutes} min
          </p>
          <h3 className="mt-1 break-words text-sm font-black uppercase leading-tight text-[var(--text)]">
            {session.workout.title}
          </h3>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className={`rounded-sm border px-1.5 py-1 text-[0.6rem] font-black uppercase ${statusClasses[session.status]}`}>
              {session.status}
            </span>
            {session.selectedVariant !== "full" ? (
              <span className="rounded-sm border border-[var(--accent)] px-1.5 py-1 text-[0.6rem] font-black uppercase text-[var(--accent)]">
                {session.selectedVariant}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {session.modificationReason ? (
        <p className="mt-2 line-clamp-2 text-[0.68rem] font-bold text-[var(--muted)]">
          {session.modificationReason}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-1">
        <Link
          href={`/session/${session.id}`}
          className="inline-flex min-h-9 items-center justify-center gap-1 rounded-sm border border-[var(--border)] bg-black px-2 text-[0.65rem] font-black uppercase text-[var(--text)] hover:border-[var(--accent)]"
        >
          Open
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
        {session.status === "completed" ? (
          <span className="inline-flex min-h-9 items-center justify-center gap-1 rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-2 text-[0.65rem] font-black uppercase text-[var(--accent)]">
            <Check className="h-3 w-3" aria-hidden="true" />
            Done
          </span>
        ) : session.status === "skipped" ? (
          <button
            type="button"
            onClick={() => restoreSessionLifecycle(session.id)}
            className="inline-flex min-h-9 items-center justify-center gap-1 rounded-sm border border-[var(--border)] bg-black px-2 text-[0.65rem] font-black uppercase text-[var(--muted)]"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Restore
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onComplete(session)}
            className="inline-flex min-h-9 items-center justify-center gap-1 rounded-sm border border-[var(--accent)] bg-[var(--accent)] px-2 text-[0.65rem] font-black uppercase text-black"
          >
            <Check className="h-3 w-3" aria-hidden="true" />
            Complete
          </button>
        )}
      </div>

      <details className="mt-1">
        <summary className="min-h-8 cursor-pointer list-none rounded-sm border border-transparent px-2 py-2 text-center text-[0.62rem] font-black uppercase text-[var(--muted)] hover:border-[var(--border)]">
          More actions
        </summary>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => duplicateCalendarSession(session)}
            className="grid min-h-9 place-items-center rounded-sm border border-[var(--border)] bg-black text-[var(--muted)]"
            aria-label={`Duplicate ${session.workout.title}`}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={session.status === "completed"}
            className="grid min-h-9 place-items-center rounded-sm border border-[var(--border)] bg-black text-[var(--muted)] disabled:opacity-30"
            aria-label={`Skip ${session.workout.title}`}
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="grid min-h-9 place-items-center rounded-sm border border-[var(--border)] bg-black text-[var(--muted)] hover:border-white/30 hover:text-white"
            aria-label={`Remove ${session.workout.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <label className="mt-1 grid gap-1">
          <span className="sr-only">Move session date</span>
          <input
            type="date"
            className="tv-input min-h-9 px-2 text-xs"
            value={session.scheduledDate}
            onChange={(event) => onMove(session, event.target.value)}
          />
        </label>
      </details>
    </article>
  );
}

function CalendarDay({
  date,
  sessions,
  compact,
  currentMonth,
  onComplete,
  onMove,
}: {
  date: Date;
  sessions: CalendarSession[];
  compact: boolean;
  currentMonth: number;
  onComplete: (session: CalendarSession) => void;
  onMove: (session: CalendarSession, date: string) => void;
}) {
  const dateKey = localDateKey(date);
  const { isOver, setNodeRef } = useDroppable({
    id: `date:${dateKey}`,
    data: { date: dateKey },
  });
  const isToday = dateKey === localDateKey(new Date());
  const outsideMonth = compact && date.getMonth() !== currentMonth;

  return (
    <section
      ref={setNodeRef}
      className={`min-w-0 border-r border-b border-[var(--border)] p-2 transition-colors ${
        compact ? "min-h-40" : "min-h-[28rem]"
      } ${isOver ? "bg-[rgba(215,255,47,0.1)]" : "bg-[rgba(5,5,5,0.72)]"} ${
        outsideMonth ? "opacity-45" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={`text-xs font-black uppercase ${isToday ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
          {compact ? date.getDate() : formatDay(date)}
        </p>
        {isToday ? (
          <span className="rounded-sm bg-[var(--accent)] px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-black">
            Today
          </span>
        ) : null}
      </div>
      <div className="grid gap-2">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onComplete={onComplete}
            onMove={onMove}
          />
        ))}
      </div>
    </section>
  );
}

function AddSessionDialog({
  initialDate,
  onClose,
}: {
  initialDate: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("Easy run");
  const [type, setType] = useState<AthleteSessionType>("run");
  const [scheduledDate, setScheduledDate] = useState(initialDate);
  const [duration, setDuration] = useState("45");
  const [minimum, setMinimum] = useState("25");
  const [intensity, setIntensity] = useState<WorkoutIntensity>("easy");
  const [prescription, setPrescription] = useState("10 min easy warm-up\n25 min conversational running\n10 min easy cool-down");
  const [targetStimulus, setTargetStimulus] = useState("Aerobic development without accumulating fatigue.");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const durationMinutes = Number(duration);

    if (!scheduledDate || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return;
    }

    saveManualSession(
      createManualSession({
        title,
        type,
        scheduledDate,
        durationMinutes,
        minimumMinutes: minimum ? Number(minimum) : undefined,
        intensity,
        prescription,
        targetStimulus,
      }),
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-session-title"
        className="tv-card mx-auto w-full max-w-2xl p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Plan</p>
            <h2 id="add-session-title" className="mt-1 text-2xl font-black uppercase">
              Add manual session
            </h2>
          </div>
          <button type="button" onClick={onClose} className="tv-button-ghost px-3" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 sm:col-span-2">
            <span className="tv-label">Title</span>
            <input className="tv-input" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label className="grid gap-2">
            <span className="tv-label">Type</span>
            <select className="tv-input" value={type} onChange={(event) => setType(event.target.value as AthleteSessionType)}>
              {athleteSessionTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="tv-label">Date</span>
            <input className="tv-input" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required />
          </label>
          <label className="grid gap-2">
            <span className="tv-label">Full minutes</span>
            <input className="tv-input" type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} required />
          </label>
          <label className="grid gap-2">
            <span className="tv-label">Minimum minutes</span>
            <input className="tv-input" type="number" min="1" value={minimum} onChange={(event) => setMinimum(event.target.value)} />
          </label>
          <label className="grid gap-2 sm:col-span-2">
            <span className="tv-label">Intensity</span>
            <select className="tv-input" value={intensity} onChange={(event) => setIntensity(event.target.value as WorkoutIntensity)}>
              <option value="easy">Easy</option>
              <option value="moderate">Moderate</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="grid gap-2 sm:col-span-2">
            <span className="tv-label">Structured prescription</span>
            <textarea className="tv-input min-h-36 resize-y py-3" value={prescription} onChange={(event) => setPrescription(event.target.value)} />
          </label>
          <label className="grid gap-2 sm:col-span-2">
            <span className="tv-label">Target stimulus</span>
            <textarea className="tv-input min-h-24 resize-y py-3" value={targetStimulus} onChange={(event) => setTargetStimulus(event.target.value)} />
          </label>
          <button type="submit" className="tv-button-primary sm:col-span-2">
            Add to plan
          </button>
        </form>
      </section>
    </div>
  );
}

function CompleteSessionDialog({
  session,
  onClose,
}: {
  session: CalendarSession;
  onClose: () => void;
}) {
  const [rpe, setRpe] = useState("5");
  const [duration, setDuration] = useState(String(session.workout.durationMinutes));
  const [notes, setNotes] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedRpe = Number(rpe);
    const parsedDuration = Number(duration);

    if (parsedRpe < 1 || parsedRpe > 10 || parsedDuration <= 0) {
      return;
    }

    saveSessionLog({
      id: `log-${crypto.randomUUID()}`,
      workoutId: session.id,
      workoutTitle: session.workout.title,
      workoutCategory: session.workout.category,
      workoutSessionType: session.workout.sessionType,
      workoutDate: session.scheduledDate,
      workoutModified: session.status === "modified",
      completedAt: new Date().toISOString(),
      rpe: parsedRpe,
      actualDurationMinutes: parsedDuration,
      notes: notes.trim() || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="complete-session-title" className="tv-card w-full max-w-md p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Complete</p>
            <h2 id="complete-session-title" className="mt-1 text-2xl font-black uppercase">
              {session.workout.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="tv-button-ghost px-3" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="tv-label">RPE (1–10)</span>
            <input className="tv-input" type="number" min="1" max="10" value={rpe} onChange={(event) => setRpe(event.target.value)} required />
          </label>
          <label className="grid gap-2">
            <span className="tv-label">Actual minutes</span>
            <input className="tv-input" type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} required />
          </label>
          <label className="grid gap-2">
            <span className="tv-label">Notes</span>
            <textarea className="tv-input min-h-24 resize-y py-3" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button type="submit" className="tv-button-primary">
            Mark completed
          </button>
        </form>
      </section>
    </div>
  );
}

export default function PlanPage() {
  const programme = useActiveProgrammeOptional();
  const manualSessions = useManualSessions();
  const lifecycle = useSessionLifecycleOverrides();
  const logs = useSessionLogs();
  const overrides = useWorkoutOverrides();
  const [view, setView] = useState<CalendarView>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [showAdd, setShowAdd] = useState(false);
  const [completionSession, setCompletionSession] = useState<CalendarSession | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const sessions = useMemo(
    () => getCalendarSessions(programme, manualSessions, logs, overrides, lifecycle),
    [lifecycle, logs, manualSessions, overrides, programme],
  );
  const displayedDays = useMemo(
    () => (view === "week" ? getWeekDays(cursor) : getMonthDays(cursor)),
    [cursor, view],
  );
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, CalendarSession[]>();

    sessions.forEach((session) => {
      if (!session.scheduledDate) {
        return;
      }

      map.set(session.scheduledDate, [...(map.get(session.scheduledDate) ?? []), session]);
    });

    return map;
  }, [sessions]);
  const unscheduled = sessions.filter((session) => !session.scheduledDate);
  const weekKeys = new Set(getWeekDays(cursor).map(localDateKey));
  const thisWeek = sessions.filter((session) => weekKeys.has(session.scheduledDate));
  const completedThisWeek = thisWeek.filter((session) => session.status === "completed").length;
  const modifiedThisWeek = thisWeek.filter((session) => session.status === "modified").length;

  function shiftCursor(direction: -1 | 1) {
    const next = new Date(cursor);

    if (view === "week") {
      next.setDate(next.getDate() + direction * 7);
    } else {
      next.setMonth(next.getMonth() + direction);
    }

    setCursor(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const session = sessions.find((candidate) => candidate.id === String(event.active.id));
    const target = event.over?.data.current?.date;

    if (session && typeof target === "string" && target !== session.scheduledDate) {
      rescheduleCalendarSession(session, target);
    }
  }

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="tv-label text-[var(--accent)]">Plan</p>
            <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-5xl">
              Training calendar
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
              Imported programmes and manual work share one plan. Drag with a mouse or long-press on touch; every card also has a date control.
            </p>
          </div>
          <button type="button" onClick={() => setShowAdd(true)} className="tv-button-primary">
            <CirclePlus className="h-4 w-4" aria-hidden="true" />
            Add session
          </button>
        </div>
      </header>

      <section className="grid gap-2 sm:grid-cols-3">
        <article className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="tv-label">This week</p>
          <p className="mt-1 text-2xl font-black text-[var(--accent)]">{thisWeek.length}</p>
          <p className="text-xs font-bold uppercase text-[var(--muted)]">planned sessions</p>
        </article>
        <article className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="tv-label">Completed</p>
          <p className="mt-1 text-2xl font-black text-[var(--accent)]">{completedThisWeek}</p>
          <p className="text-xs font-bold uppercase text-[var(--muted)]">of {thisWeek.length}</p>
        </article>
        <article className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="tv-label">Changed</p>
          <p className="mt-1 text-2xl font-black text-[var(--accent)]">{modifiedThisWeek}</p>
          <p className="text-xs font-bold uppercase text-[var(--muted)]">prescriptions / dates</p>
        </article>
      </section>

      <section className="tv-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftCursor(-1)} className="tv-button-ghost px-3" aria-label={`Previous ${view}`}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setCursor(new Date())} className="tv-button-ghost">
              Today
            </button>
            <button type="button" onClick={() => shiftCursor(1)} className="tv-button-ghost px-3" aria-label={`Next ${view}`}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="text-center">
            <p className="tv-label">Calendar</p>
            <h2 className="mt-1 text-lg font-black uppercase">{formatRange(view, cursor)}</h2>
          </div>
          <div className="flex rounded-md border border-[var(--border)] bg-black p-1">
            {(["week", "month"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                className={`min-h-10 rounded-sm px-3 text-xs font-black uppercase ${
                  view === item ? "bg-[var(--accent)] text-black" : "text-[var(--muted)]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto">
            <div className={`grid min-w-[70rem] grid-cols-7 ${view === "month" ? "" : ""}`}>
              {view === "month"
                ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="border-r border-b border-[var(--border)] bg-black p-2 text-center text-xs font-black uppercase text-[var(--muted)]">
                      {day}
                    </div>
                  ))
                : null}
              {displayedDays.map((date) => {
                const key = localDateKey(date);
                return (
                  <CalendarDay
                    key={key}
                    date={date}
                    sessions={sessionsByDate.get(key) ?? []}
                    compact={view === "month"}
                    currentMonth={cursor.getMonth()}
                    onComplete={setCompletionSession}
                    onMove={rescheduleCalendarSession}
                  />
                );
              })}
            </div>
          </div>
        </DndContext>
      </section>

      {unscheduled.length > 0 ? (
        <section className="tv-card p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <p className="tv-label text-[var(--accent)]">Unscheduled</p>
              <h2 className="mt-1 text-xl font-black uppercase">{unscheduled.length} sessions need a date</h2>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {unscheduled.map((session) => (
              <SessionCard key={session.id} session={session} onComplete={setCompletionSession} onMove={rescheduleCalendarSession} />
            ))}
          </div>
        </section>
      ) : null}

      {showAdd ? <AddSessionDialog initialDate={localDateKey(new Date())} onClose={() => setShowAdd(false)} /> : null}
      {completionSession ? (
        <CompleteSessionDialog session={completionSession} onClose={() => setCompletionSession(null)} />
      ) : null}
    </div>
  );
}
