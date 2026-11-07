import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, createSessionToken } from "@/lib/session";

export async function POST(req: Request) {
  const { password } = await readJson<{ password?: string }>(req);
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "סיסמה שגויה" }, { status: 401 });
  }
  const token = createSessionToken();
  if (!token) return NextResponse.json({ error: "APP_PASSWORD לא הוגדר בשרת" }, { status: 500 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
