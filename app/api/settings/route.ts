import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/http";
import { setDashboardSpaces } from "@/lib/store";

export async function PUT(req: Request) {
  try {
    const body = await readJson<{ dashboardSpaceIds?: number[] | null }>(req);
    const ids = Array.isArray(body.dashboardSpaceIds) ? body.dashboardSpaceIds.map(Number).filter(Number.isInteger) : null;
    await setDashboardSpaces(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
