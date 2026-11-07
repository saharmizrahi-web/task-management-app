import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/http";
import { deleteTask, updateTask, type TaskInput } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<TaskInput>(req);
    const row = await updateTask(Number(id), body);
    if (!row) return NextResponse.json({ error: "משימה לא נמצאה" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    return fail(e, 400);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteTask(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
