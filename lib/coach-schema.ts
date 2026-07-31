import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const coachModeSchema = z.enum(["advise", "change_plan"]);
export const coachRewriteKindSchema = z.enum([
  "easy",
  "long",
  "intervals",
  "threshold",
]);

export const coachSessionSchema = z
  .object({
    id: z.string().min(1).max(160),
    title: z.string().min(1).max(180),
    date: dateSchema.nullable(),
    type: z.string().min(1).max(40),
    status: z.enum(["planned", "completed", "skipped", "modified"]),
    variant: z.enum(["full", "adjusted", "minimum"]),
    durationMinutes: z.number().int().min(0).max(1_440),
    intensity: z.enum(["easy", "moderate", "hard"]),
    targetStimulus: z.string().max(500).nullable(),
    lowerBodySignal: z.boolean(),
  })
  .strict();

export const coachLogSchema = z
  .object({
    sessionId: z.string().min(1).max(160),
    title: z.string().min(1).max(180),
    completedAt: z.string().datetime(),
    rpe: z.number().min(0).max(10),
    durationMinutes: z.number().min(0).max(1_440).nullable(),
    notes: z.string().max(500).nullable(),
  })
  .strict();

export const coachActivitySchema = z
  .object({
    activityId: z.string().min(1).max(160),
    title: z.string().min(1).max(180),
    type: z.string().min(1).max(80),
    startedAt: z.string().min(1).max(80),
    durationMinutes: z.number().min(0).max(1_440).nullable(),
    distanceKm: z.number().min(0).max(1_000).nullable(),
    paceSecondsPerKm: z.number().min(60).max(3_600).nullable(),
    averageHeartRateBpm: z.number().min(20).max(260).nullable(),
    elevationGainMeters: z.number().min(0).max(20_000).nullable(),
    aerobicTrainingEffect: z.number().min(0).max(10).nullable(),
    anaerobicTrainingEffect: z.number().min(0).max(10).nullable(),
  })
  .strict();

export const coachEventSchema = z
  .object({
    title: z.string().min(1).max(180),
    date: dateSchema,
    priority: z.enum(["A", "B", "C"]).nullable(),
  })
  .strict();

export const coachContextSchema = z
  .object({
    today: dateSchema,
    readiness: z
      .object({
        zone: z.enum(["green", "amber", "red"]).nullable(),
        score: z.number().min(0).max(100).nullable(),
        factors: z.array(z.string().min(1).max(240)).max(12),
        athleteOverride: z.boolean(),
      })
      .strict(),
    sessions: z.array(coachSessionSchema).max(42),
    recentLogs: z.array(coachLogSchema).max(24),
    recentActivities: z.array(coachActivitySchema).max(24),
    upcomingEvents: z.array(coachEventSchema).max(8),
  })
  .strict();

export const coachRequestSchema = z
  .object({
    mode: coachModeSchema,
    message: z.string().trim().min(2).max(2_000),
    context: coachContextSchema,
  })
  .strict();

export const coachProposalSchema = z
  .object({
    id: z.string().min(1).max(80),
    action: z.enum(["reschedule", "select_variant", "rewrite_session"]),
    sessionId: z.string().min(1).max(160),
    sessionTitle: z.string().min(1).max(180),
    currentDate: dateSchema.nullable(),
    newDate: dateSchema.nullable(),
    variant: z.enum(["full", "adjusted", "minimum"]).nullable(),
    rewriteKind: coachRewriteKindSchema.nullable(),
    reason: z.string().min(1).max(500),
  })
  .strict();

export const coachDecisionSchema = z
  .object({
    summary: z.string().min(1).max(1_200),
    rationale: z.array(z.string().min(1).max(500)).min(1).max(6),
    cautions: z.array(z.string().min(1).max(500)).max(4),
    proposedChanges: z.array(coachProposalSchema).max(12),
    changeStatus: z.enum(["not_requested", "proposed", "blocked"]),
    blockedReason: z.string().min(1).max(800).nullable(),
    confidence: z.enum(["low", "medium", "high"]),
    dataSummary: z.array(z.string().min(1).max(240)).min(1).max(8),
  })
  .strict();

export type CoachMode = z.infer<typeof coachModeSchema>;
export type CoachRewriteKind = z.infer<typeof coachRewriteKindSchema>;
export type CoachRequest = z.infer<typeof coachRequestSchema>;
export type CoachDecision = z.infer<typeof coachDecisionSchema>;
export type CoachProposal = z.infer<typeof coachProposalSchema>;
