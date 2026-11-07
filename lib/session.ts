import { createHash, createHmac } from "crypto";
import { safeEqual } from "./auth";

export const SESSION_COOKIE = "ms_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// Tied to APP_PASSWORD so changing the password invalidates every existing session.
function sessionSecret(): string | null {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  const base = process.env.SESSION_SECRET || process.env.DATABASE_URL || "";
  return createHash("sha256").update(`ms-session:${password}:${base}`).digest("hex");
}

function mac(secret: string, exp: number): string {
  return createHmac("sha256", secret).update(`session:${exp}`).digest("base64url");
}

export function createSessionToken(): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  return `${exp}.${mac(secret, exp)}`;
}

export function isValidSession(token: string | undefined): boolean {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false;
  return safeEqual(sig, mac(secret, exp));
}

export function checkPassword(input: unknown): boolean {
  const password = process.env.APP_PASSWORD;
  if (!password || typeof input !== "string") return false;
  return safeEqual(input, password);
}
