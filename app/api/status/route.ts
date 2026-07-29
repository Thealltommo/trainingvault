import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    openai: {
      configured: Boolean(process.env.OPENAI_API_KEY),
    },
    garmin: {
      configured: Boolean(process.env.GARMIN_BRIDGE_URL),
    },
    supabase: {
      configured: Boolean(
        process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
    },
  });
}
