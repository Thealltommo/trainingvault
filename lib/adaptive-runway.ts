import type { ReadinessRecommendation } from "@/lib/athlete";
import type { CalendarSession } from "@/lib/planning-storage";

export type AdaptiveRunwayProposal = {
  id: string;
  kind: "select_variant" | "reschedule" | "protect";
  severity: "info" | "attention" | "strong";
  sessionId: string;
  sessionTitle: string;
  currentDate: string;
  newDate: string | null;
  variant: "adjusted" | "minimum" | null;
  reason: string;
};

export type AdaptiveRunwayDecision = {
  headline: string;
  summary: string;
  proposals: AdaptiveRunwayProposal[];
  warnings: string[];
  protectedSessionIds: string[];
};

const LOWER_BODY_TYPES = new Set([
  "run",
  "fell-trail",
  "race",
  "crossfit",
  "strength",
  "conditioning",
  "hyrox",
]);
const RUNNING_TYPES = new Set(["run", "fell-trail", "race"]);
const GYM_TYPES = new Set(["crossfit", "strength", "conditioning", "hyrox"]);

function dayNumber(date: string) {
  const parsed = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : null;
}

function addDays(date: string, amount: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(first: string, second: string) {
  const a = dayNumber(first);
  const b = dayNumber(second);
  return a == null || b == null ? null : b - a;
}

function isIncomplete(session: CalendarSession) {
  return session.status !== "completed" && session.status !== "skipped";
}

function isHardLowerBody(session: CalendarSession) {
  return LOWER_BODY_TYPES.has(session.type) && session.workout.intensity === "hard";
}

function isLongMountainAnchor(session: CalendarSession) {
  return (
    session.type === "fell-trail" &&
    session.workout.durationMinutes >= 90 &&
    isIncomplete(session)
  );
}

function findOpenDate(
  fromDate: string,
  occupied: Set<string>,
  latestDate: string,
) {
  for (let offset = 1; offset <= 3; offset += 1) {
    const candidate = addDays(fromDate, offset);
    if (candidate > latestDate) return null;
    if (!occupied.has(candidate)) return candidate;
  }
  return null;
}

export function deriveAdaptiveRunway(input: {
  today: string;
  readiness: ReadinessRecommendation | null;
  sessions: CalendarSession[];
  windowDays?: number;
}): AdaptiveRunwayDecision {
  const windowDays = Math.max(2, Math.min(14, input.windowDays ?? 7));
  const endDate = addDays(input.today, windowDays - 1);
  const runway = input.sessions
    .filter(
      (session) =>
        session.scheduledDate >= input.today &&
        session.scheduledDate <= endDate &&
        session.status !== "skipped",
    )
    .sort((a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) || a.id.localeCompare(b.id),
    );
  const occupied = new Set(
    runway.filter(isIncomplete).map((session) => session.scheduledDate),
  );
  const proposals: AdaptiveRunwayProposal[] = [];
  const warnings: string[] = [];
  const protectedSessionIds = runway.filter(isLongMountainAnchor).map((session) => session.id);
  const proposedSessionIds = new Set<string>();
  const todaySession = runway.find(
    (session) => session.scheduledDate === input.today && isIncomplete(session),
  );

  function pushProposal(proposal: AdaptiveRunwayProposal) {
    if (proposedSessionIds.has(proposal.sessionId) && proposal.kind !== "protect") return;
    proposals.push(proposal);
    if (proposal.kind !== "protect") proposedSessionIds.add(proposal.sessionId);
  }

  if (todaySession && input.readiness === "adjusted" && todaySession.selectedVariant === "full") {
    pushProposal({
      id: `readiness-adjusted:${todaySession.id}:${input.today}`,
      kind: "select_variant",
      severity: "attention",
      sessionId: todaySession.id,
      sessionTitle: todaySession.workout.title,
      currentDate: todaySession.scheduledDate,
      newDate: null,
      variant: "adjusted",
      reason: "Today is an AMBER-style training call. Preserve the planned stimulus while trimming volume or density.",
    });
  }

  if (todaySession && input.readiness === "minimum" && todaySession.selectedVariant !== "minimum") {
    pushProposal({
      id: `readiness-minimum:${todaySession.id}:${input.today}`,
      kind: "select_variant",
      severity: "strong",
      sessionId: todaySession.id,
      sessionTitle: todaySession.workout.title,
      currentDate: todaySession.scheduledDate,
      newDate: null,
      variant: "minimum",
      reason: "Recovery supports only the minimum useful dose today. Protect the next quality opportunity.",
    });
  }

  if (todaySession && input.readiness === "rest") {
    const openDate = findOpenDate(todaySession.scheduledDate, occupied, endDate);
    if (openDate) {
      pushProposal({
        id: `readiness-rest:${todaySession.id}:${input.today}`,
        kind: "reschedule",
        severity: "strong",
        sessionId: todaySession.id,
        sessionTitle: todaySession.workout.title,
        currentDate: todaySession.scheduledDate,
        newDate: openDate,
        variant: null,
        reason: "Deterministic recovery rules favour rest today. This is the nearest open runway date, not an automatic move.",
      });
    } else {
      warnings.push("Recovery rules favour rest today, but the next three runway days are already occupied. Review the week before moving anything.");
    }
  }

  const hardLower = runway.filter((session) => isIncomplete(session) && isHardLowerBody(session));
  for (let index = 1; index < hardLower.length; index += 1) {
    const first = hardLower[index - 1];
    const second = hardLower[index];
    const gap = daysBetween(first.scheduledDate, second.scheduledDate);
    if (gap == null || gap > 1) continue;

    warnings.push(
      `Hard lower-body density: ${first.workout.title} (${first.scheduledDate}) runs directly into ${second.workout.title} (${second.scheduledDate}).`,
    );

    if (!proposedSessionIds.has(second.id)) {
      const openDate = findOpenDate(second.scheduledDate, occupied, endDate);
      if (openDate && !protectedSessionIds.includes(second.id)) {
        pushProposal({
          id: `density:${second.id}:${second.scheduledDate}`,
          kind: "reschedule",
          severity: "attention",
          sessionId: second.id,
          sessionTitle: second.workout.title,
          currentDate: second.scheduledDate,
          newDate: openDate,
          variant: null,
          reason: "Two hard lower-body sessions are stacked without a clear recovery day. The open date reduces interference while preserving both sessions.",
        });
      }
    }
  }

  for (const session of runway.filter(isLongMountainAnchor)) {
    pushProposal({
      id: `protect:${session.id}:${session.scheduledDate}`,
      kind: "protect",
      severity: "info",
      sessionId: session.id,
      sessionTitle: session.workout.title,
      currentDate: session.scheduledDate,
      newDate: null,
      variant: null,
      reason: "Long fell/trail work is treated as a major endurance and eccentric-load anchor rather than disposable easy mileage.",
    });

    const adjacentHard = runway.filter((candidate) => {
      if (!isIncomplete(candidate) || candidate.id === session.id || !isHardLowerBody(candidate)) return false;
      const gap = Math.abs(daysBetween(session.scheduledDate, candidate.scheduledDate) ?? 99);
      return gap <= 1;
    });
    if (adjacentHard.length > 0) {
      warnings.push(
        `${session.workout.title} is a protected mountain-load anchor with hard lower-body work within 24 hours. Expect elevated eccentric fatigue.`,
      );
    }
  }

  const interferencePairs = runway.flatMap((session, index) => {
    if (!isIncomplete(session) || !GYM_TYPES.has(session.type) || session.workout.intensity !== "hard") return [];
    const next = runway[index + 1];
    if (
      !next ||
      !isIncomplete(next) ||
      !RUNNING_TYPES.has(next.type) ||
      next.workout.intensity !== "hard" ||
      daysBetween(session.scheduledDate, next.scheduledDate) !== 1
    ) {
      return [];
    }
    return [[session, next] as const];
  });

  for (const [gym, run] of interferencePairs) {
    warnings.push(
      `Running-quality interference: ${run.workout.title} follows hard ${gym.type} work by one day. Compare actual pace/HR once enough matched runs exist.`,
    );
  }

  const actionable = proposals.filter((proposal) => proposal.kind !== "protect");
  const headline =
    actionable.length > 0
      ? `${actionable.length} change${actionable.length === 1 ? "" : "s"} worth reviewing`
      : warnings.length > 0
        ? "No forced move, but load density needs attention"
        : "Runway is internally coherent";

  const summary =
    actionable.length > 0
      ? "These are deterministic, reversible proposals. Nothing changes until the athlete confirms a move or variant."
      : warnings.length > 0
        ? "TrainVault found interference risk but not enough justification to rewrite the calendar automatically."
        : runway.length === 0
          ? "There is no committed work in the current runway. TrainVault will not manufacture sessions just to populate the week."
          : "Current sequencing does not trigger a deterministic readiness or interference rule.";

  return {
    headline,
    summary,
    proposals,
    warnings: Array.from(new Set(warnings)).slice(0, 8),
    protectedSessionIds,
  };
}
