import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  garminBridgeFetch,
  garminErrorResponse,
  requireGarminApiAuth,
} from "@/lib/garmin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const nullableFiniteNumber = z.number().finite().nullable();
const emptySummary = {
  totalDurationSeconds: null,
  movingDurationSeconds: null,
  elapsedDurationSeconds: null,
  runTimeSeconds: null,
  walkTimeSeconds: null,
  idleTimeSeconds: null,
  distanceMeters: null,
  averageSpeedMps: null,
  averageMovingSpeedMps: null,
  maxSpeedMps: null,
  averageHeartRateBpm: null,
  maxHeartRateBpm: null,
  averageCadenceSpm: null,
  maxCadenceSpm: null,
  elevationGainMeters: null,
  elevationLossMeters: null,
  calories: null,
  aerobicTrainingEffect: null,
  anaerobicTrainingEffect: null,
  minimumTemperatureC: null,
  maximumTemperatureC: null,
  primaryBenefit: null,
} as const;

const activitySummarySchema = z
  .object({
    totalDurationSeconds: nullableFiniteNumber,
    movingDurationSeconds: nullableFiniteNumber,
    elapsedDurationSeconds: nullableFiniteNumber,
    runTimeSeconds: nullableFiniteNumber,
    walkTimeSeconds: nullableFiniteNumber,
    idleTimeSeconds: nullableFiniteNumber,
    distanceMeters: nullableFiniteNumber,
    averageSpeedMps: nullableFiniteNumber,
    averageMovingSpeedMps: nullableFiniteNumber,
    maxSpeedMps: nullableFiniteNumber,
    averageHeartRateBpm: nullableFiniteNumber,
    maxHeartRateBpm: nullableFiniteNumber,
    averageCadenceSpm: nullableFiniteNumber,
    maxCadenceSpm: nullableFiniteNumber,
    elevationGainMeters: nullableFiniteNumber,
    elevationLossMeters: nullableFiniteNumber,
    calories: nullableFiniteNumber,
    aerobicTrainingEffect: nullableFiniteNumber,
    anaerobicTrainingEffect: nullableFiniteNumber,
    minimumTemperatureC: nullableFiniteNumber,
    maximumTemperatureC: nullableFiniteNumber,
    primaryBenefit: z.string().max(160).nullable(),
  })
  .strict();

const routeResponseSchema = z
  .object({
    activityId: z.string().regex(/^[1-9]\d{0,31}$/),
    summary: activitySummarySchema.optional().default(emptySummary),
    points: z
      .array(
        z
          .object({
            lat: z.number().finite().min(-90).max(90),
            lon: z.number().finite().min(-180).max(180),
            elevationMeters: nullableFiniteNumber,
            distanceMeters: nullableFiniteNumber,
            timeMs: z.number().int().nullable(),
          })
          .strict(),
      )
      .max(1_500),
    bounds: z
      .object({
        minLat: z.number().finite().min(-90).max(90),
        maxLat: z.number().finite().min(-90).max(90),
        minLon: z.number().finite().min(-180).max(180),
        maxLon: z.number().finite().min(-180).max(180),
      })
      .strict()
      .nullable(),
    samples: z
      .array(
        z
          .object({
            elapsedSeconds: z.number().finite().nonnegative(),
            movingSeconds: nullableFiniteNumber,
            distanceMeters: nullableFiniteNumber,
            paceSecondsPerKm: nullableFiniteNumber,
            heartRateBpm: nullableFiniteNumber,
            cadenceSpm: nullableFiniteNumber,
            elevationMeters: nullableFiniteNumber,
            gradePercent: nullableFiniteNumber,
            temperatureC: nullableFiniteNumber,
          })
          .strict(),
      )
      .max(1_200)
      .default([]),
    splits: z
      .array(
        z
          .object({
            splitIndex: z.number().int().positive(),
            splitType: z.string().max(80).nullable(),
            durationSeconds: nullableFiniteNumber,
            movingDurationSeconds: nullableFiniteNumber,
            distanceMeters: nullableFiniteNumber,
            averagePaceSecondsPerKm: nullableFiniteNumber,
            averageHeartRateBpm: nullableFiniteNumber,
            maxHeartRateBpm: nullableFiniteNumber,
            averageCadenceSpm: nullableFiniteNumber,
            elevationGainMeters: nullableFiniteNumber,
            elevationLossMeters: nullableFiniteNumber,
            calories: nullableFiniteNumber,
          })
          .strict(),
      )
      .max(500)
      .default([]),
    availableChannels: z.array(z.string().max(40)).max(24).default([]),
    sourceSampleCount: z.number().int().nonnegative().default(0),
  })
  .strict();

type RouteContext = {
  params: Promise<{ activityId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const authResponse = await requireGarminApiAuth(request);
  if (authResponse) return authResponse;

  const { activityId } = await context.params;
  if (!/^[1-9]\d{0,31}$/.test(activityId)) {
    return NextResponse.json({ error: "Invalid Garmin activity id" }, { status: 400 });
  }

  try {
    const route = await garminBridgeFetch(
      `/activities/${activityId}/route`,
      routeResponseSchema,
      {},
      25_000,
    );
    return NextResponse.json(route, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    return garminErrorResponse(error);
  }
}
