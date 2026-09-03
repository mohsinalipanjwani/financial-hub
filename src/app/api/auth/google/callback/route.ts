import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, canAdmit, type Role } from "@/lib/auth";
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

    // Invite-only admission (see canAdmit): only a pre-invited, active user may
    // sign in; bootstrap admins in ADMIN_EMAILS are the sole exception.
    const admission = canAdmit({ userExists: !!existing, userActive: !!existing?.active, isBootstrapAdmin: isAdmin });
    if (!admission.ok) {
      return fail(
        admission.reason === "deactivated"
          ? "Your access has been deactivated. Contact an administrator."
          : `Access is invite-only. Ask an administrator to invite ${email}.`,
      );
    }

    const user = existing
      ? await prisma.user.update({
          where: { email },
          data: { name: info.name || existing.name, ...(isAdmin ? { role: "ADMIN" } : {}) },
        })
      : await prisma.user.create({ data: { email, name: info.name || email, role: "ADMIN", active: true } });

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
