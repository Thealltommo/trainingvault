import { NextResponse, type NextRequest } from "next/server";
import {
  devicesResponseSchema,
  garminBridgeFetch,
  garminErrorResponse,
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
    const devices = await garminBridgeFetch("/devices", devicesResponseSchema);
    return NextResponse.json(devices, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return garminErrorResponse(error);
  }
}
