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
        proposal.rewriteKind === null &&
        isDateWithinPlanningWindow(proposal.newDate, request.context.today),
    );
  }

  if (proposal.action === "select_variant") {
    return Boolean(
      proposal.variant !== null &&
        proposal.newDate === null &&
        proposal.rewriteKind === null,
    );
  }

  return Boolean(
    proposal.rewriteKind !== null &&
      proposal.variant === null &&
      proposal.newDate === null &&
      ["run", "fell-trail", "race"].includes(session.type),
  );
}

export function sanitizeCoachDecision(
  decision: CoachDecision,
  request: CoachRequest,
): CoachDecision {
  if (request.mode === "advise") {
    return {
      ...decision,
      proposedChanges: [],
      changeStatus: "not_requested",
      blockedReason: null,
    };
  }

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
    .slice(0, 12)
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

  if (proposedChanges.length > 0) {
    return {
      ...decision,
      proposedChanges,
      changeStatus: "proposed",
      blockedReason: null,
    };
  }

  return {
    ...decision,
    proposedChanges: [],
    changeStatus: "blocked",
    blockedReason:
      decision.blockedReason ||
      "No valid reversible calendar changes survived TrainVault validation. The plan was not changed.",
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
    changeStatus: request.mode === "change_plan" ? "blocked" : "not_requested",
    blockedReason:
      request.mode === "change_plan"
        ? "Coach is unavailable, so TrainVault will not manufacture plan changes without a valid structured decision."
        : null,
    confidence: "low",
    dataSummary: [
      `${request.context.recentLogs.length} recent logs`,
      `${request.context.recentActivities.length} recent Garmin activities`,
      `${request.context.sessions.length} bounded calendar sessions`,
      `${request.context.upcomingEvents.length} upcoming events`,
    ],
  };
}
