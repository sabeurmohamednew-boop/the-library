import { NextResponse } from "next/server";
import { createAdminToken, setAdminSessionCookie, verifyAdminPassword } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: string } | null;

  if (!verifyAdminPassword(body?.password ?? "")) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  await setAdminSessionCookie(createAdminToken());
  return NextResponse.json({ ok: true });
}
