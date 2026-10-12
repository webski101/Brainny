import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/agent";
import { fetchGraphPayload } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const graph = await fetchGraphPayload();
    return NextResponse.json({ ok: true, ...graph });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Graph failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
