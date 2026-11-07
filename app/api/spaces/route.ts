import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/http";
import { createSpace } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ name?: string; color?: string; view?: string }>(req);
    return NextResponse.json(await createSpace(body));
  } catch (e) {
    return fail(e, 400);
  }
}
