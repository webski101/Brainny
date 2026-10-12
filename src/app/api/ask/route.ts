import { NextResponse } from "next/server";
import { askBrainny } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = String(body.question || body.q || "").trim();
    if (!question) {
      return NextResponse.json(
        { ok: false, error: "question is required" },
        { status: 400 },
      );
    }
    const answer = await askBrainny(question);
    return NextResponse.json({ ok: true, ...answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ask failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
