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

function isUpstreamFetchError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return /fetch failed|failed to fetch|network/i.test(message);
}

function upstreamUnavailable() {
  return NextResponse.json(
    {
      error: "The Agoge cloud bridge cannot reach the existing TrainVault store from this deployment. Use Recover from old TrainVault to check the original browser and cloud source directly.",
      code: "upstream_unavailable",
    },
    { status: 502 },
  );
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
      if (isUpstreamFetchError(error.message)) return upstreamUnavailable();
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
      return NextResponse.json(
        {
          error: "Cloud sync is not configured on this Agoge deployment. Use Recover from old TrainVault to check the original source.",
          code: "sync_not_configured",
        },
        { status: 503 },
      );
    }

    if (isUpstreamFetchError(error)) return upstreamUnavailable();

    return NextResponse.json({ error: "Cloud sync pull failed" }, { status: 500 });
  }
}
