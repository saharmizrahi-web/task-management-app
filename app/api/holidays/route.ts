import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { listHolidays } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ holidays: await listHolidays() });
  } catch (e) {
    return fail(e);
  }
}
