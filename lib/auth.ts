import { createHash, createHmac, timingSafeEqual } from "crypto";

/** Secret for signing agent confirmation tokens. Derived from server-only env vars. */
function secret(): string {
  const base = process.env.SESSION_SECRET || process.env.DATABASE_URL || "";
  if (!base) throw new Error("DATABASE_URL is not set");
  return createHash("sha256").update("ms-confirm:" + base).digest("hex");
}

export function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
