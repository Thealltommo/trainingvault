"use client";

import { ShieldCheck, Trash2 } from "lucide-react";
import {
  archiveSession,
  useManualSessions,
  useSessionLifecycleOverrides,
} from "@/lib/planning-storage";
import {
  clearActiveProgramme,
  useActiveProgrammeOptional,
  useSessionLogs,
} from "@/lib/storage";

function programmeWorkoutIds(programme: ReturnType<typeof useActiveProgrammeOptional>) {
  if (!programme) return [];
  return programme.weeks.flatMap((week) =>
    week.days.map((day) => day.workout.id),
  );
}

export default function PlanManager() {
  const programme = useActiveProgrammeOptional();
  const manualSessions = useManualSessions();
  const lifecycle = useSessionLifecycleOverrides();
  const logs = useSessionLogs();

  const activeManualSessions = manualSessions.filter(
    (session) => lifecycle[session.id]?.status !== "deleted",
  );
  const importedWorkoutIds = programmeWorkoutIds(programme);
  const activeIds = new Set([
    ...activeManualSessions.map((session) => session.id),
    ...importedWorkoutIds,
  ]);
  const completedCount = logs.filter((log) => activeIds.has(log.workoutId)).length;
  const totalSessions = activeManualSessions.length + importedWorkoutIds.length;

  if (totalSessions === 0) return null;

  function removeActivePlan() {
    const detail = [
      `Remove the active plan and ${totalSessions} calendar session${totalSessions === 1 ? "" : "s"}?`,
      "",
      "Completed training logs, Garmin activities and performance history will be kept.",
      "Workouts already sent to Garmin Connect are not deleted from Garmin automatically.",
    ].join("\n");

    if (!window.confirm(detail)) return;

    if (programme) clearActiveProgramme();
    activeManualSessions.forEach((session) =>
      archiveSession(session.id, "Active training plan removed"),
    );
  }

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[rgba(8,11,8,0.72)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.025] text-[var(--muted)]">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="tv-label text-[var(--accent)]">Active plan</p>
          <p className="mt-1 text-sm font-[760] text-[var(--text)]">
            {totalSessions} calendar session{totalSessions === 1 ? "" : "s"}
            {completedCount > 0 ? ` · ${completedCount} completed log${completedCount === 1 ? "" : "s"} protected` : ""}
          </p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--quiet)]">
            Remove the schedule without erasing the training evidence you have already earned.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={removeActivePlan}
        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.045] px-4 text-xs font-[780] text-red-200 transition-colors hover:border-red-300/40 hover:bg-red-400/[0.08]"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Remove active plan
      </button>
    </section>
  );
}
