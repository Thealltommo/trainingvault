"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Flag,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Target,
} from "lucide-react";
import {
  daysUntilEvent,
  nextPriorityEvent,
  type AthleteEventType,
} from "@/lib/athlete";
import {
  archiveAthleteEvent,
  createAthleteEvent,
  restoreAthleteEvent,
  updateAthleteEvent,
  useAthleteRecordsStore,
  type AthleteEventDraft,
  type StoredAthleteEvent,
} from "@/lib/athlete-records-storage";

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

type EventForm = {
  name: string;
  type: AthleteEventType;
  date: string;
  priority: "A" | "B" | "C";
  location: string;
  distanceKm: string;
  elevationGainMeters: string;
  goal: string;
  notes: string;
};

const EMPTY_FORM: EventForm = {
  name: "",
  type: "custom",
  date: "",
  priority: "B",
  location: "",
  distanceKm: "",
  elevationGainMeters: "",
  goal: "",
  notes: "",
};

function eventTypeLabel(type: AthleteEventType) {
  return (
    EVENT_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formFromEvent(event: StoredAthleteEvent): EventForm {
  return {
    name: event.name,
    type: event.type,
    date: event.date,
    priority: event.priority,
    location: event.location ?? "",
    distanceKm:
      event.distanceMeters === undefined
        ? ""
        : String(event.distanceMeters / 1_000),
    elevationGainMeters:
      event.elevationGainMeters === undefined
        ? ""
        : String(event.elevationGainMeters),
    goal: event.goal ?? "",
    notes: event.notes ?? "",
  };
}

function toDraft(form: EventForm): AthleteEventDraft {
  const distanceKm = Number(form.distanceKm);
  const elevation = Number(form.elevationGainMeters);

  return {
    name: form.name,
    type: form.type,
    date: form.date,
    priority: form.priority,
    location: form.location || undefined,
    distanceMeters:
      form.distanceKm && Number.isFinite(distanceKm)
        ? Math.round(distanceKm * 1_000)
        : undefined,
    elevationGainMeters:
      form.elevationGainMeters && Number.isFinite(elevation)
        ? Math.round(elevation)
        : undefined,
    goal: form.goal || undefined,
    notes: form.notes || undefined,
  };
}

export default function EventsPage() {
  const store = useAthleteRecordsStore();
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const events = useMemo(
    () =>
      store.events
        .filter((event) => showArchived || !event.archivedAt)
        .sort((first, second) => {
          if (Boolean(first.archivedAt) !== Boolean(second.archivedAt)) {
            return first.archivedAt ? 1 : -1;
          }
          return first.date.localeCompare(second.date);
        }),
    [showArchived, store.events],
  );
  const activeEvents = store.events.filter((event) => !event.archivedAt);
  const today = localDateKey();
  const upcomingCount = activeEvents.filter(
    (event) => event.date >= today,
  ).length;
  const nextEvent = nextPriorityEvent(activeEvents, today);
  const nextEventDays = nextEvent
    ? daysUntilEvent(nextEvent, today)
    : undefined;

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function beginEdit(event: StoredAthleteEvent) {
    setForm(formFromEvent(event));
    setEditingId(event.id);
    setFeedback("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setError("");

    const result = editingId
      ? updateAthleteEvent(editingId, toDraft(form))
      : createAthleteEvent(toDraft(form));

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setFeedback(
      editingId
        ? "Event corrected. The previous version remains in local history."
        : "Event added to your athlete calendar.",
    );
    resetForm();
  }

  function handleArchive(event: StoredAthleteEvent) {
    if (
      !window.confirm(
        `Archive ${event.name}? It will remain recoverable and no history will be deleted.`,
      )
    ) {
      return;
    }

    const result = archiveAthleteEvent(event.id);
    setError(result.ok ? "" : result.error);
    setFeedback(
      result.ok ? "Event archived. You can restore it at any time." : "",
    );

    if (editingId === event.id) resetForm();
  }

  function handleRestore(event: StoredAthleteEvent) {
    const result = restoreAthleteEvent(event.id);
    setError(result.ok ? "" : result.error);
    setFeedback(result.ok ? "Event restored." : "");
  }

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
        <p className="tv-label mt-3 text-[var(--accent)]">Events</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black uppercase leading-none sm:text-5xl">
              What are you training for?
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
              Build the race and competition horizon that should shape your plan.
              Corrections are versioned; archive never destroys the original.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="tv-chip">{activeEvents.length} active</span>
            <span className="tv-chip border-[rgba(215,255,47,0.4)] text-[var(--accent)]">
              {upcomingCount} upcoming
            </span>
            {nextEvent && nextEventDays !== undefined ? (
              <span className="tv-chip">
                Next · {nextEventDays === 0 ? "today" : `${nextEventDays}d`}
              </span>
            ) : null}
          </div>
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
              {editingId ? "Safe correction" : "New target"}
            </p>
            <h2 className="text-2xl font-black uppercase">
              {editingId ? "Edit event" : "Add event"}
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1.5 sm:col-span-2">
              <span className="tv-label">Event name *</span>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="tv-input"
                placeholder="The event on your horizon"
                maxLength={120}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="tv-label">Type *</span>
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as AthleteEventType,
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1.5">
              <span className="tv-label">Priority *</span>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value as "A" | "B" | "C",
                  }))
                }
                className="tv-input"
              >
                <option value="A">A — primary goal</option>
                <option value="B">B — important</option>
                <option value="C">C — supporting</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="tv-label">Location</span>
              <input
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    location: event.target.value,
                  }))
                }
                className="tv-input"
                placeholder="Town, venue or route"
                maxLength={180}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="tv-label">Distance (km)</span>
              <input
                type="number"
                min="0.001"
                max="1000"
                step="0.01"
                inputMode="decimal"
                value={form.distanceKm}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    distanceKm: event.target.value,
                  }))
                }
                className="tv-input"
                placeholder="Optional"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="tv-label">Elevation (m)</span>
              <input
                type="number"
                min="0"
                max="100000"
                step="1"
                inputMode="numeric"
                value={form.elevationGainMeters}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    elevationGainMeters: event.target.value,
                  }))
                }
                className="tv-input"
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="tv-label">Goal</span>
              <textarea
                value={form.goal}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    goal: event.target.value,
                  }))
                }
                className="tv-input min-h-24 resize-y"
                placeholder="Outcome, time, placing, experience or execution goal"
                maxLength={500}
              />
            </label>
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
                placeholder="Terrain, travel, qualification or other context"
                maxLength={2000}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="tv-button-primary">
              <Save className="h-4 w-4" aria-hidden="true" />
              {editingId ? "Save correction" : "Add event"}
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
            <p className="tv-label text-[var(--accent)]">Event horizon</p>
            <h2 className="mt-1 text-2xl font-black uppercase">
              Targets and context
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

        {events.length === 0 ? (
          <div className="tv-card border-dashed p-8 text-center">
            <Flag
              className="mx-auto h-8 w-8 text-[var(--accent)]"
              aria-hidden="true"
            />
            <h3 className="mt-3 text-xl font-black uppercase">
              No events saved
            </h3>
            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              Add the first real target when you are ready. TrainVault will not invent one.
            </p>
          </div>
        ) : (
          events.map((event) => {
            const historyCount = store.eventHistory.filter(
              (revision) => revision.eventId === event.id,
            ).length;

            return (
              <article
                key={event.id}
                className={`tv-card p-4 sm:p-5 ${
                  event.archivedAt ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-8 min-w-8 place-items-center rounded-sm bg-[var(--accent)] px-2 text-sm font-black text-black">
                        {event.priority}
                      </span>
                      <span className="tv-chip">
                        {eventTypeLabel(event.type)}
                      </span>
                      {event.archivedAt ? (
                        <span className="tv-chip">Archived</span>
                      ) : event.date < today ? (
                        <span className="tv-chip">Past</span>
                      ) : (
                        <span className="tv-chip border-[rgba(215,255,47,0.4)] text-[var(--accent)]">
                          Upcoming
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-2xl font-black uppercase">
                      {event.name}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold text-[var(--muted)]">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        {dateLabel(event.date)}
                      </span>
                      {event.location ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          {event.location}
                        </span>
                      ) : null}
                      {event.distanceMeters !== undefined ? (
                        <span>
                          {(event.distanceMeters / 1_000).toLocaleString(
                            "en-GB",
                            { maximumFractionDigits: 2 },
                          )}{" "}
                          km
                        </span>
                      ) : null}
                      {event.elevationGainMeters !== undefined ? (
                        <span>
                          {event.elevationGainMeters.toLocaleString("en-GB")} m+
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {event.archivedAt ? (
                      <button
                        type="button"
                        onClick={() => handleRestore(event)}
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
                          onClick={() => beginEdit(event)}
                          className="tv-button-ghost"
                        >
                          <Pencil
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(event)}
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
                  </div>
                </div>

                {event.goal || event.notes ? (
                  <div className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
                    {event.goal ? (
                      <div>
                        <p className="tv-label inline-flex items-center gap-1.5 text-[var(--accent)]">
                          <Target
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          Goal
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm font-bold">
                          {event.goal}
                        </p>
                      </div>
                    ) : null}
                    {event.notes ? (
                      <div>
                        <p className="tv-label">Context</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm font-bold text-[var(--muted)]">
                          {event.notes}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <p className="mt-4 text-[11px] font-black uppercase tracking-wide text-[var(--muted)]">
                  Revision {event.revision} · {historyCount} retained history{" "}
                  {historyCount === 1 ? "entry" : "entries"}
                </p>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
