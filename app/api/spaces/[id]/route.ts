import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/http";
import { deleteSpace, updateSpace } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<{ name?: string; color?: string; view?: string }>(req);
    const row = await updateSpace(Number(id), body);
    if (!row) return NextResponse.json({ error: "מרחב לא נמצא" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    return fail(e, 400);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteSpace(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
