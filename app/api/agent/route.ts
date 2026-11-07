import { NextResponse } from "next/server";
import { runAgent, type ChatMsg } from "@/lib/agent";
import { fail, readJson } from "@/lib/http";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ messages?: ChatMsg[]; scope?: "all" | number[] }>(req);
    const messages = (Array.isArray(body.messages) ? body.messages : []).filter(
      (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim(),
    );
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "אין הודעה" }, { status: 400 });
    }
    const scope = body.scope === "all" ? "all" : Array.isArray(body.scope) ? body.scope.map(Number).filter(Number.isInteger) : "all";
    return NextResponse.json(await runAgent(messages, scope));
  } catch (e) {
    return fail(e);
  }
}
