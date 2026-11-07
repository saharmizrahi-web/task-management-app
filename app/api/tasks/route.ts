import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/http";
import { createTask, type TaskInput } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = await readJson<TaskInput>(req);
    return NextResponse.json(await createTask(body));
  } catch (e) {
    return fail(e, 400);
  }
}
