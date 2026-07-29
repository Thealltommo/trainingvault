import type { AthleteEvent, PersonalRecord } from "./types";

export function daysUntilEvent(event: AthleteEvent, fromDate: string) {
  const eventTime = new Date(`${event.date}T00:00:00Z`).getTime();
  const fromTime = new Date(`${fromDate}T00:00:00Z`).getTime();

  if (!Number.isFinite(eventTime) || !Number.isFinite(fromTime)) {
    return undefined;
  }

  return Math.ceil((eventTime - fromTime) / 86_400_000);
}

export function nextPriorityEvent(
  events: AthleteEvent[],
  fromDate: string,
): AthleteEvent | undefined {
  return [...events]
    .filter((event) => event.date >= fromDate)
    .sort((first, second) => {
      const dateDifference = first.date.localeCompare(second.date);
      if (dateDifference !== 0) return dateDifference;
      const priorityOrder = { A: 0, B: 1, C: 2 };
      return priorityOrder[first.priority] - priorityOrder[second.priority];
    })[0];
}

export function isPersonalRecordImprovement(
  candidate: PersonalRecord,
  existing: PersonalRecord,
): boolean | undefined {
  if (candidate.kind !== existing.kind) return undefined;

  if (candidate.kind === "running" && existing.kind === "running") {
    if (candidate.distance !== existing.distance) return undefined;
    return candidate.timeSeconds < existing.timeSeconds;
  }

  if (candidate.kind === "strength" && existing.kind === "strength") {
    if (
      candidate.movement.trim().toLowerCase() !==
        existing.movement.trim().toLowerCase() ||
      candidate.unit !== existing.unit ||
      candidate.reps !== existing.reps
    ) {
      return undefined;
    }
    return candidate.load > existing.load;
  }

  if (candidate.kind === "benchmark" && existing.kind === "benchmark") {
    if (
      candidate.name.trim().toLowerCase() !==
      existing.name.trim().toLowerCase()
    ) {
      return undefined;
    }
    if (
      candidate.timeSeconds === undefined ||
      existing.timeSeconds === undefined
    ) {
      return undefined;
    }
    return candidate.timeSeconds < existing.timeSeconds;
  }

  if (candidate.kind === "event" && existing.kind === "event") {
    if (
      candidate.eventType !== existing.eventType ||
      candidate.name.trim().toLowerCase() !==
        existing.name.trim().toLowerCase() ||
      candidate.timeSeconds === undefined ||
      existing.timeSeconds === undefined
    ) {
      return undefined;
    }
    return candidate.timeSeconds < existing.timeSeconds;
  }

  return undefined;
}
