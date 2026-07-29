import type {
  CoachDecision,
  CoachProposal,
  CoachRequest,
} from "@/lib/coach-schema";

function isDateWithinPlanningWindow(value: string, today: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const reference = new Date(`${today}T00:00:00Z`);

  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) {
    return false;
  }

  const differenceDays = Math.abs(
    (date.getTime() - reference.getTime()) / 86_400_000,
  );
  return differenceDays <= 366;
}

function proposalIsConsistent(
  proposal: CoachProposal,
  request: CoachRequest,
) {
  const session = request.context.sessions.find(
    (candidate) => candidate.id === proposal.sessionId,
  );

  if (!session || session.status === "completed") {
    return false;
  }

  if (proposal.action === "reschedule") {
    return Boolean(
      proposal.newDate &&
        proposal.variant === null &&
        isDateWithinPlanningWindow(proposal.newDate, request.context.today),
    );
  }

  return proposal.variant !== null && proposal.newDate === null;
}

export function sanitizeCoachDecision(
  decision: CoachDecision,
  request: CoachRequest,
): CoachDecision {
  const seen = new Set<string>();
  const proposedChanges = decision.proposedChanges
    .filter((proposal) => {
      const key = `${proposal.action}:${proposal.sessionId}`;

      if (seen.has(key) || !proposalIsConsistent(proposal, request)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map((proposal) => {
      const session = request.context.sessions.find(
        (candidate) => candidate.id === proposal.sessionId,
      );

      return {
        ...proposal,
        sessionTitle: session?.title ?? proposal.sessionTitle,
        currentDate: session?.date ?? proposal.currentDate,
      };
    });

  return {
    ...decision,
    proposedChanges,
  };
}

export function createCoachFallback(
  request: CoachRequest,
  reason:
    | "not_configured"
    | "temporarily_unavailable"
    | "invalid_response",
): CoachDecision {
  const planned = request.context.sessions.filter(
    (session) =>
      session.status === "planned" || session.status === "modified",
  ).length;
  const recovery =
    request.context.readiness.zone === null
      ? "No current recovery classification was supplied."
      : `Current TrainVault readiness is ${request.context.readiness.zone.toUpperCase()}.`;
  const summary =
    reason === "not_configured"
      ? "The AI Coach is not configured on the server. Your calendar, logging, readiness rules, and manual session controls still work."
      : "The AI Coach is temporarily unavailable. No training changes were made; your existing plan remains available.";

  return {
    summary,
    rationale: [
      `${planned} upcoming or modified sessions were supplied in the bounded coaching context.`,
      recovery,
    ],
    cautions: [
      "TrainVault coaching is training guidance, not medical advice. Stop and seek qualified help for concerning symptoms.",
    ],
    proposedChanges: [],
    confidence: "low",
    dataSummary: [
      `${request.context.recentLogs.length} recent logs`,
      `${request.context.sessions.length} bounded calendar sessions`,
      `${request.context.upcomingEvents.length} upcoming events`,
    ],
  };
}

