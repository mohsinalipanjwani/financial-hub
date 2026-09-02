import { NextRequest, NextResponse } from "next/server";
import { createSession, findUserByEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Dev login: authenticate by selecting a seeded user email.
// Phase 2 replaces this route's body with the Google OAuth callback.
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({ email: undefined }));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "Unknown or inactive user" }, { status: 401 });
  }

  await createSession(user);

  await prisma.auditLog.create({
    data: { action: "LOGIN", entityType: "user", entityId: user.id, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
