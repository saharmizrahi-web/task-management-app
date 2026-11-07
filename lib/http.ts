import { NextResponse } from "next/server";

export function fail(e: unknown, status = 500): NextResponse {
  const message = e instanceof Error ? e.message : "שגיאה";
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
