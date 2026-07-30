import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import {
  garminBridgeFetch,
  healthResponseSchema,
} from "@/lib/garmin-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function garminHealth(configured: boolean) {
  if (!configured) {
    return { configured: false, healthy: false, version: null as string | null };
  }

  try {
    const health = await garminBridgeFetch("/health", healthResponseSchema);
    return {
      configured: true,
      healthy: true,
      version: health.version,
    };
  } catch {
    return { configured: true, healthy: false, version: null as string | null };
  }
}

async function supabaseHealth(configured: boolean) {
  if (!configured) {
    return { configured: false, healthy: false, canonical: false };
  }

  try {
    const client = getSupabaseAdminClient();
    const { error } = await client
      .from("trainvault_v3_athletes")
      .select("sync_id", { count: "exact", head: true })
      .limit(1);

    return { configured: true, healthy: !error, canonical: !error };
  } catch {
    return { configured: true, healthy: false, canonical: false };
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const garminConfigured = Boolean(process.env.GARMIN_BRIDGE_URL);
  const supabaseConfigured = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const [garmin, supabase] = await Promise.all([
    garminHealth(garminConfigured),
    supabaseHealth(supabaseConfigured),
  ]);

  return NextResponse.json(
    {
      openai: {
        configured: Boolean(process.env.OPENAI_API_KEY),
      },
      garmin,
      supabase,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
