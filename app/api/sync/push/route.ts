import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAuthorizedRequest } from "@/lib/auth";
import { getSupabaseAdminClient, getTrainVaultSyncId } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isSyncEnvError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Supabase sync env var missing:");
}

const syncBodySchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

const MAX_SYNC_BYTES = 2 * 1_024 * 1_024;

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedRequest(request))) {
    return unauthorized();
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_BYTES) {
    return NextResponse.json({ error: "Cloud snapshot is too large" }, { status: 413 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = syncBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Expected JSON body shaped like { data: object }" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const syncId = getTrainVaultSyncId();
    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("trainvault_state")
      .upsert(
        {
          id: syncId,
          data: parsedBody.data.data,
          updated_at: updatedAt,
        },
        {
          onConflict: "id",
        },
      )
      .select("updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Cloud sync push failed" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      updated_at: data.updated_at,
    });
  } catch (error) {
    if (isSyncEnvError(error)) {
      return NextResponse.json({ error: "Sync env vars missing" }, { status: 503 });
    }

    return NextResponse.json({ error: "Cloud sync push failed" }, { status: 502 });
  }
}
