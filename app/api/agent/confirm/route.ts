import { NextResponse } from "next/server";
import { executePending } from "@/lib/agent";
import { fail, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ token?: string; scope?: "all" | number[] }>(req);
    const scope = body.scope === "all" ? "all" : Array.isArray(body.scope) ? body.scope.map(Number).filter(Number.isInteger) : "all";
    return NextResponse.json(await executePending(String(body.token ?? ""), scope));
  } catch (e) {
    return fail(e);
  }
}
