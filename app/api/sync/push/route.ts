import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseAdminClient,
  getSupabaseAdminDiagnostics,
  getTrainVaultSyncId,
} from "@/lib/supabase-admin";

const AUTH_COOKIE = "trainvault_auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSyncEnvError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Supabase sync env var missing:");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown sync error";
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  return null;
}

function isRlsError(error: unknown) {
  return getErrorMessage(error).toLowerCase().includes("row-level security");
}

function getUserFacingSyncError(error: unknown) {
  if (isRlsError(error)) {
    return "Supabase RLS blocked the write. The service role key may not be the key being used by this deployment, or the table needs the single-row sync policy.";
  }

  return getErrorMessage(error);
}

function syncFailureResponse(error: unknown, status = 500) {
  const diagnostics = getSupabaseAdminDiagnostics();

  return NextResponse.json(
    {
      error: getUserFacingSyncError(error),
      envPresent: diagnostics.envPresent,
      keyPrefix: diagnostics.keyPrefix,
      syncId: diagnostics.syncId,
      errorMessage: getErrorMessage(error),
      errorCode: getErrorCode(error),
      diagnostics: {
        envPresent: diagnostics.envPresent,
        keyPrefix: diagnostics.keyPrefix,
        syncId: diagnostics.syncId,
        errorMessage: getErrorMessage(error),
        errorCode: getErrorCode(error),
        hasUrl: diagnostics.hasUrl,
        hasServiceKey: diagnostics.hasServiceKey,
        serviceKeyPrefix: diagnostics.serviceKeyPrefix,
        serviceKeyLooksAnon: diagnostics.serviceKeyLooksAnon,
      },
    },
    { status },
  );
}

export async function POST(request: NextRequest) {
  if (request.cookies.get(AUTH_COOKIE)?.value !== "1") {
    return unauthorized();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isPlainObject(body) || !isPlainObject(body.data)) {
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
          data: body.data,
          updated_at: updatedAt,
        },
        {
          onConflict: "id",
        },
      )
      .select("updated_at")
      .single();

    if (error) {
      return syncFailureResponse(error);
    }

    return NextResponse.json({
      ok: true,
      updated_at: data.updated_at,
    });
  } catch (error) {
    if (isSyncEnvError(error)) {
      return syncFailureResponse(error);
    }

    return syncFailureResponse(error);
  }
}
