import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAuthorizedRequest } from "@/lib/auth";
import {
  recordCanonicalDecision,
  updateCanonicalDecisionStatus,
} from "@/lib/v3-canonical";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const actionSchema = z.object({
  decisionKey: z.string().trim().min(1).max(240),
  proposalId: z.string().trim().min(1).max(240),
  sessionId: z.string().trim().min(1).max(240),
  sessionTitle: z.string().trim().min(1).max(180),
  action: z.enum(["reschedule", "select_variant"]),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  variant: z.enum(["full", "adjusted", "minimum"]).nullable(),
  reason: z.string().trim().min(1).max(1_000),
});

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid decision action" }, { status: 400 });
  }

  const action = parsed.data;

  try {
    await recordCanonicalDecision({
      decisionKey: `${action.decisionKey}:proposal:${action.proposalId}`,
      decisionType: "coach_proposal_action",
      status: "applied",
      rationale: action.reason,
      proposal: {
        parentDecisionKey: action.decisionKey,
        proposalId: action.proposalId,
        sessionId: action.sessionId,
        sessionTitle: action.sessionTitle,
        action: action.action,
        newDate: action.newDate,
        variant: action.variant,
      },
    });

    // A parent Coach answer becomes accepted once the athlete confirms at least one
    // of its reversible proposals. Per-proposal applied rows retain the exact audit.
    await updateCanonicalDecisionStatus(action.decisionKey, "accepted");

    return NextResponse.json(
      { ok: true, parentStatus: "accepted", proposalStatus: "applied" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Decision audit update failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
