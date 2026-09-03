import { NextRequest, NextResponse } from "next/server";
import { createSession, findUserByEmail } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/google/oauth";
import { prisma } from "@/lib/prisma";

// Passwordless dev login for local development only. It is disabled whenever
// Google OAuth is configured or in production, so real deployments admit users
// only through invite-gated Google sign-in.
export async function POST(req: NextRequest) {
  if (isGoogleConfigured() || process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Dev login is disabled. Sign in with Google." }, { status: 403 });
  }

  const { email } = await req.json().catch(() => ({ email: undefined }));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // findUserByEmail already requires an existing, active user (the allowlist).
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
