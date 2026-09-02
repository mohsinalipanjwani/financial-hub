import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, type Role } from "@/lib/auth";
import { exchangeCodeForTokens, fetchUserInfo } from "@/lib/google/oauth";
import { saveConnection } from "@/lib/google/connection";

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const store = await cookies();
  const expectedState = store.get("g_oauth_state")?.value;
  store.delete("g_oauth_state");

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin));

  if (error) return fail(`Google returned: ${error}`);
  if (!code || !state || state !== expectedState) return fail("Invalid OAuth state");

  try {
    const tokens = await exchangeCodeForTokens(code);
    const info = await fetchUserInfo(tokens.access_token);
    if (!info.email || !info.verified_email) return fail("Google account email not verified");

    const email = info.email.toLowerCase();
    const isAdmin = adminEmails().has(email);

    const existing = await prisma.user.findUnique({ where: { email } });
    const role: Role = existing ? (isAdmin ? "ADMIN" : (existing.role as Role)) : isAdmin ? "ADMIN" : "EMPLOYEE";

    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: info.name || email, role, active: true },
      update: { name: info.name || email, ...(isAdmin ? { role: "ADMIN" } : {}) },
    });

    await createSession({ id: user.id, email: user.email, name: user.name, role: user.role as Role });

    // Persist the connection so this account can be used to sync the sheet.
    await saveConnection({ email, tokens, connectedByUserId: user.id });

    await prisma.auditLog.create({
      data: { action: "GOOGLE_LOGIN", entityType: "user", entityId: user.id, userId: user.id },
    });

    return NextResponse.redirect(new URL("/", url.origin));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "OAuth failed");
  }
}
