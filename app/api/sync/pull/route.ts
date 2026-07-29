import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminClient, getTrainVaultSyncId } from "@/lib/supabase-admin";

const AUTH_COOKIE = "trainvault_auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isSyncEnvError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Supabase sync env var missing:");
}

export async function GET(request: NextRequest) {
  if (request.cookies.get(AUTH_COOKIE)?.value !== "1") {
    return unauthorized();
  }

  try {
    const supabase = getSupabaseAdminClient();
    const syncId = getTrainVaultSyncId();
    const { data, error } = await supabase
      .from("trainvault_state")
      .select("data, updated_at")
      .eq("id", syncId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: data.data,
      updated_at: data.updated_at,
    });
  } catch (error) {
    if (isSyncEnvError(error)) {
      return NextResponse.json({ error: "Sync env vars missing" }, { status: 500 });
    }

    return NextResponse.json({ error: "Cloud sync pull failed" }, { status: 500 });
  }
}
