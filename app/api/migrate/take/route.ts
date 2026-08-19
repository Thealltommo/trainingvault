import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminClient, getTrainVaultSyncId } from "@/lib/supabase-admin";

const AUTH_COOKIE = "trainvault_auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validToken(token: string) {
  return /^[A-Za-z0-9_-]{40,180}$/.test(token);
}

export async function GET(request: NextRequest) {
  if (request.cookies.get(AUTH_COOKIE)?.value !== "1") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!validToken(token)) {
    return NextResponse.json({ error: "Invalid transfer token" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: transfer, error } = await supabase
      .from("trainvault_migration_transfer")
      .select("data, source_origin, created_at")
      .eq("token", token)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!transfer) return NextResponse.json({ error: "Transfer not found or already consumed" }, { status: 404 });

    const syncId = getTrainVaultSyncId();
    const updatedAt = new Date().toISOString();
    const { error: syncError } = await supabase.from("trainvault_state").upsert(
      {
        id: syncId,
        data: transfer.data,
        updated_at: updatedAt,
      },
      { onConflict: "id" },
    );

    if (syncError) return NextResponse.json({ error: syncError.message }, { status: 500 });

    await supabase.from("trainvault_migration_transfer").delete().eq("token", token);

    return NextResponse.json({
      data: transfer.data,
      source_origin: transfer.source_origin,
      updated_at: updatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not consume transfer" },
      { status: 500 },
    );
  }
}
