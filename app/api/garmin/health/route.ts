import { NextResponse, type NextRequest } from "next/server";
import {
  garminBridgeFetch,
  garminErrorResponse,
  healthResponseSchema,
  requireGarminApiAuth,
} from "@/lib/garmin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = await requireGarminApiAuth(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const health = await garminBridgeFetch("/health", healthResponseSchema);
    return NextResponse.json(health, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return garminErrorResponse(error);
  }
}
