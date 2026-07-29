import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { matchGarminActivity } from "@/lib/garmin";
import {
  activitiesResponseSchema,
  garminBridgeFetch,
  garminErrorResponse,
  isoDateSchema,
  parseBoundedJsonBody,
  requireGarminApiAuth,
} from "@/lib/garmin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const activityTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.-]+$/);

const activitiesQuerySchema = z
  .object({
    start: z.coerce.number().int().min(0).max(100_000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    activityType: activityTypeSchema.optional(),
  })
  .strict();

const plannedSessionSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(200),
    date: isoDateSchema,
    plannedStartTime: z
      .string()
      .max(64)
      .refine((value) => Number.isFinite(Date.parse(value)))
      .nullable()
      .optional(),
    plannedDistanceMeters: z.number().finite().positive().nullable().optional(),
    plannedDurationSeconds: z.number().finite().positive().nullable().optional(),
    garminWorkoutId: z.string().max(128).nullable().optional(),
  })
  .strict();

const activitySyncRequestSchema = z
  .object({
    start: z.number().int().min(0).max(100_000).default(0),
    limit: z.number().int().min(1).max(100).default(30),
    activityType: activityTypeSchema.optional(),
    knownActivityIds: z
      .array(z.string().trim().min(1).max(128))
      .max(500)
      .default([]),
    plannedSessions: z.array(plannedSessionSchema).max(250).default([]),
  })
  .strict();

function activitiesEndpoint(input: {
  start: number;
  limit: number;
  activityType?: string;
}) {
  const search = new URLSearchParams({
    start: String(input.start),
    limit: String(input.limit),
  });

  if (input.activityType) {
    search.set("activityType", input.activityType);
  }

  return `/activities?${search.toString()}`;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireGarminApiAuth(request);

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = activitiesQuerySchema.safeParse({
    start: request.nextUrl.searchParams.get("start") ?? 0,
    limit: request.nextUrl.searchParams.get("limit") ?? 30,
    activityType: request.nextUrl.searchParams.get("activityType") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "The activity query was invalid." },
      { status: 400 },
    );
  }

  try {
    const activities = await garminBridgeFetch(
      activitiesEndpoint(parsed.data),
      activitiesResponseSchema,
    );
    return NextResponse.json(activities, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return garminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireGarminApiAuth(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const input = await parseBoundedJsonBody(
      request,
      activitySyncRequestSchema,
      262_144,
    );
    const response = await garminBridgeFetch(
      activitiesEndpoint(input),
      activitiesResponseSchema,
    );
    const knownIds = new Set(input.knownActivityIds);
    const records = response.activities.map((activity) => ({
      activity,
      match: matchGarminActivity(activity, input.plannedSessions),
      isNew:
        activity.activityId === null || !knownIds.has(activity.activityId),
    }));

    return NextResponse.json(
      {
        records,
        start: response.start,
        sourceReturned: response.returned,
        nextStart: response.start + response.returned,
        syncedAt: new Date().toISOString(),
        skippedWithoutId: response.activities.filter(
          (activity) => activity.activityId === null,
        ).length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return garminErrorResponse(error);
  }
}
