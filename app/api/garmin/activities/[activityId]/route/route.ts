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

const routeResponseSchema = z
  .object({
    activityId: z.string().regex(/^[1-9]\d{0,31}$/),
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
      .max(1_200),
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
      .max(500),
    availableChannels: z.array(z.string().max(40)).max(20),
    sourceSampleCount: z.number().int().nonnegative(),
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
