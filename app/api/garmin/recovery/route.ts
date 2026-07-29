import { NextResponse, type NextRequest } from "next/server";
import {
  GarminBridgeRequestError,
  garminBridgeFetch,
  garminErrorResponse,
  isoDateSchema,
  recoveryResponseSchema,
  requireGarminApiAuth,
  trainingStatusResponseSchema,
} from "@/lib/garmin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireGarminApiAuth(request);

  if (unauthorized) {
    return unauthorized;
  }

  const dateResult = isoDateSchema.safeParse(
    request.nextUrl.searchParams.get("date") ?? utcDateKey(),
  );

  if (!dateResult.success) {
    return NextResponse.json(
      { error: "The recovery date must be a valid ISO date." },
      { status: 400 },
    );
  }

  const snapshotDate = dateResult.data;

  try {
    const recovery = await garminBridgeFetch(
      `/recovery/${encodeURIComponent(snapshotDate)}`,
      recoveryResponseSchema,
    );
    let trainingStatus = null;
    let trainingStatusUnavailable = false;

    try {
      trainingStatus = await garminBridgeFetch(
        `/training-status?date=${encodeURIComponent(snapshotDate)}`,
        trainingStatusResponseSchema,
      );
    } catch (error) {
      if (!(error instanceof GarminBridgeRequestError)) {
        throw error;
      }

      trainingStatusUnavailable = true;
    }

    return NextResponse.json(
      {
        recovery,
        trainingStatus,
        partial: recovery.partial || trainingStatusUnavailable,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return garminErrorResponse(error);
  }
}
