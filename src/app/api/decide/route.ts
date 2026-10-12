import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/agent";
import { recordDecision } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await request.json();
    const title = String(body.title || "").trim();
    const summary = String(body.summary || "").trim();
    const ownerNames = Array.isArray(body.owners)
      ? body.owners.map(String)
      : ["Priya"];
    const citeIds = Array.isArray(body.cites) ? body.cites.map(String) : [];

    if (!title || !summary) {
      return NextResponse.json(
        { ok: false, error: "title and summary are required" },
        { status: 400 },
      );
    }

    const result = await recordDecision({
      title,
      summary,
      ownerNames,
      citeIds,
    });

    return NextResponse.json({
      ok: true,
      message: "Decision written into the FalkorDB company graph.",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Decide failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
