import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAuthorizedRequest } from "@/lib/auth";
import {
  CloudMigrationConfigurationError,
  CloudMigrationConflictError,
  MAX_CLOUD_MIGRATION_BYTES,
  cloudMigrationRequestSchema,
  createSupabaseCloudMigrationRepository,
  executeCloudMigration,
} from "@/lib/cloud-migration";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const athleteIdSchema = z.uuid();

function json(
  body: Record<string, unknown>,
  init?: ResponseInit,
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...init?.headers,
    },
  });
}

async function readBoundedJson(request: Request) {
  if (!request.body) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > MAX_CLOUD_MIGRATION_BYTES) {
      await reader.cancel();
      return { ok: false as const, reason: "too_large" as const };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true as const, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false as const, reason: "invalid" as const };
  }
}

function isSupabaseConfigurationError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.startsWith("Supabase sync env var missing:")
  );
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedRequest(request))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return json(
      { error: "Content-Type must be application/json" },
      { status: 415 },
    );
  }

  const contentLength = Number(
    request.headers.get("content-length") ?? "0",
  );
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_CLOUD_MIGRATION_BYTES
  ) {
    return json(
      { error: "Cloud migration snapshot is too large" },
      { status: 413 },
    );
  }

  const body = await readBoundedJson(request);
  if (!body.ok) {
    return json(
      {
        error:
          body.reason === "too_large"
            ? "Cloud migration snapshot is too large"
            : "Invalid JSON body",
      },
      { status: body.reason === "too_large" ? 413 : 400 },
    );
  }

  const parsedBody = cloudMigrationRequestSchema.safeParse(body.value);
  if (!parsedBody.success) {
    return json(
      {
        error:
          "Expected a bounded TrainVault snapshot, manual session list, and lifecycle map",
      },
      { status: 400 },
    );
  }

  const parsedAthleteId = athleteIdSchema.safeParse(
    process.env.TRAINVAULT_ATHLETE_ID,
  );
  if (!parsedAthleteId.success) {
    return json(
      {
        error:
          "Cloud migration is not configured. Set TRAINVAULT_ATHLETE_ID to the UUID of an existing Supabase Auth user.",
      },
      { status: 503 },
    );
  }

  try {
    const repository = createSupabaseCloudMigrationRepository(
      getSupabaseAdminClient(),
    );
    const result = await executeCloudMigration(parsedBody.data, {
      athleteId: parsedAthleteId.data,
      repository,
    });

    return json({
      ok: true,
      alreadyMigrated: result.alreadyMigrated,
      message: result.alreadyMigrated
        ? "This local snapshot was already migrated. No duplicates were created."
        : "Local data was copied to normalized cloud records. Browser data was not changed.",
      summary: result.summary,
    });
  } catch (error) {
    if (error instanceof CloudMigrationConflictError) {
      return json(
        {
          error:
            "A different local snapshot already completed or claimed this one-time migration. Browser data was not changed.",
        },
        { status: 409 },
      );
    }

    if (
      error instanceof CloudMigrationConfigurationError ||
      isSupabaseConfigurationError(error)
    ) {
      return json(
        {
          error:
            error instanceof CloudMigrationConfigurationError
              ? error.message
              : "Cloud migration is unavailable because Supabase server environment variables are missing.",
        },
        { status: 503 },
      );
    }

    return json(
      {
        error:
          "Cloud migration stopped before completion. Local data remains untouched; retry the same snapshot.",
        retryable: true,
      },
      { status: 502 },
    );
  }
}
