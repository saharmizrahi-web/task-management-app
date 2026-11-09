import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { syncGoogleCalendar } from "@/lib/gcal";

export const dynamic = "force-dynamic";

/** Called by the app when it opens or returns to the foreground. Throttled inside. */
export async function POST() {
  try {
    return NextResponse.json(await syncGoogleCalendar());
  } catch (e) {
    return fail(e);
  }
}
