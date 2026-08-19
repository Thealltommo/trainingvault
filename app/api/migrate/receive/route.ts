import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const ALLOWED_ORIGINS = new Set([
  "https://project-poo2v.vercel.app",
  "https://trainvault-rays-projects-c6b158d1.vercel.app",
  "https://trainvault-git-main-rays-projects-c6b158d1.vercel.app",
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function validToken(token: string) {
  return /^[A-Za-z0-9_-]{40,180}$/.test(token);
}

export function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!validToken(token)) {
    return NextResponse.json({ error: "Invalid transfer token" }, { status: 400, headers: corsHeaders(origin) });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders(origin) });
  }

  if (!body || typeof body !== "object" || Array.isArray(body) || !("data" in body)) {
    return NextResponse.json({ error: "Expected { data }" }, { status: 400, headers: corsHeaders(origin) });
  }

  const data = (body as { data: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "Snapshot missing" }, { status: 400, headers: corsHeaders(origin) });
  }

  try {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("trainvault_migration_transfer")
      .delete()
      .lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

    const { error } = await supabase.from("trainvault_migration_transfer").upsert({
      token,
      data,
      source_origin: origin,
      created_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders(origin) });
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders(origin) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transfer failed" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}
