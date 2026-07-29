"use client";

import { Footprints, Repeat2 } from "lucide-react";
import { describeRunningStep } from "@/lib/structured-running";
import { useStructuredRunningWorkout } from "@/lib/structured-running-storage";

export default function StructuredRunningPrescription({
  sessionId,
}: {
  sessionId: string;
}) {
  const workout = useStructuredRunningWorkout(sessionId);

  if (!workout) return null;

  return (
    <section className="tv-card border-[rgba(215,255,47,0.34)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">
            Structured running prescription
          </p>
          <h2 className="mt-1 text-2xl font-black uppercase">
            Garmin-ready work order
          </h2>
        </div>
        <span className="tv-chip border-[var(--accent)] bg-[rgba(215,255,47,0.1)] text-[var(--accent)]">
          <Footprints className="h-4 w-4" aria-hidden="true" />
          Explicit steps
        </span>
      </div>

      <ol className="mt-4 grid gap-2">
        {workout.steps.map((element, index) =>
          element.kind === "repeat" ? (
            <li
              key={`repeat-${index}`}
              className="border border-[var(--border)] bg-black p-3"
            >
              <p className="flex items-center gap-2 text-sm font-black uppercase text-[var(--accent)]">
                <Repeat2 className="h-4 w-4" aria-hidden="true" />
                {element.repetitions} rounds
              </p>
              <ol className="mt-2 grid gap-2">
                {element.steps.map((step, stepIndex) => (
                  <li
                    key={`${step.phase}-${stepIndex}`}
                    className="border-l-2 border-[var(--accent)] pl-3 text-sm font-bold text-[var(--muted)]"
                  >
                    {describeRunningStep(step)}
                  </li>
                ))}
              </ol>
            </li>
          ) : (
            <li
              key={`${element.phase}-${index}`}
              className="grid grid-cols-[2rem_minmax(0,1fr)] border border-[var(--border)] bg-black"
            >
              <span className="grid place-items-center border-r border-[var(--border)] text-xs font-black text-[var(--accent)]">
                {index + 1}
              </span>
              <span className="p-3 text-sm font-bold text-[var(--muted)]">
                {describeRunningStep(element)}
              </span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

