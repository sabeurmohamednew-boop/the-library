import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "library_owner_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function configuredPassword() {
  return process.env.ADMIN_PASSWORD?.trim() ?? "";
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() || configuredPassword();
}

export function adminPasswordConfigured() {
  return configuredPassword().length >= 12;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

export function verifyAdminPassword(candidate: string) {
  const password = configuredPassword();
  if (!adminPasswordConfigured() || !candidate) return false;

  return timingSafeEqual(hash(candidate), hash(password));
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createAdminToken(now = Date.now()) {
  const issuedAt = Math.floor(now / 1000).toString();
  const signature = sign(issuedAt);
  return `${issuedAt}.${signature}`;
}

export function verifyAdminToken(token?: string) {
  if (!adminPasswordConfigured() || !token) return false;

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const issuedAtSeconds = Number(issuedAt);
  if (!Number.isFinite(issuedAtSeconds)) return false;

  const age = Math.floor(Date.now() / 1000) - issuedAtSeconds;
  if (age < 0 || age > SESSION_TTL_SECONDS) return false;

  const expected = sign(issuedAt);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function isAdminSession() {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value);
}

export async function setAdminSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}
