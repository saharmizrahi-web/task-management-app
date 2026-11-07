import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { loadAll } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadAll());
  } catch (e) {
    return fail(e);
  }
}
