import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  garminBridgeFetch,
  garminErrorResponse,
  requireGarminApiAuth,
} from "@/lib/garmin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const routeResponseSchema = z
  .object({
    activityId: z.string().regex(/^[1-9]\d{0,31}$/),
    points: z
      .array(
        z
          .object({
            lat: z.number().finite().min(-90).max(90),
            lon: z.number().finite().min(-180).max(180),
            elevationMeters: z.number().finite().nullable(),
            distanceMeters: z.number().finite().nullable(),
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
      20_000,
    );
    return NextResponse.json(route, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    return garminErrorResponse(error);
  }
}
