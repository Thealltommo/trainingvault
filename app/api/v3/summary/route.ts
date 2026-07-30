import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getCanonicalCloudSummary } from "@/lib/v3-canonical";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await getCanonicalCloudSummary();
    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Canonical cloud summary unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
