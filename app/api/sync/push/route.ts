import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAuthorizedRequest } from "@/lib/auth";
import { persistCanonicalSnapshot } from "@/lib/v3-canonical";

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
    const result = await persistCanonicalSnapshot(parsedBody.data.data);

    return NextResponse.json({
      ok: true,
      updated_at: result.updatedAt,
      v3: {
        canonical: true,
        fingerprint: result.fingerprint,
        entityCount: result.entityCount,
      },
    });
  } catch (error) {
    if (isSyncEnvError(error)) {
      return NextResponse.json({ error: "Sync env vars missing" }, { status: 503 });
    }

    return NextResponse.json({ error: "Cloud sync push failed" }, { status: 502 });
  }
}
