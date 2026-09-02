import { NextRequest, NextResponse } from "next/server";
import { getSession, type Role } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLES: Role[] = ["ADMIN", "FINANCE", "MANAGEMENT", "EMPLOYEE"];

// Role management is Admin-only (stricter than general config access).
export async function POST(req: NextRequest) {
  const actor = await getSession();
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (actor.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  // --- Invite a new user (creates the allowlist entry) ---
  if (body.email && !body.userId) {
    const email = String(body.email).trim().toLowerCase();
    const inviteRole = (body.role as Role) || "EMPLOYEE";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    if (!ROLES.includes(inviteRole)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Re-inviting an existing (possibly deactivated) user reactivates them.
      const updated = await prisma.user.update({ where: { email }, data: { active: true, role: inviteRole } });
      await prisma.auditLog.create({ data: { action: "REINVITE_USER", entityType: "user", entityId: updated.id, userId: actor.id, metadata: { email, role: inviteRole } } });
      return NextResponse.json({ ok: true, user: { id: updated.id, email, role: updated.role, active: true } });
    }
    const created = await prisma.user.create({ data: { email, name: String(body.name || email), role: inviteRole, active: true } });
    await prisma.auditLog.create({ data: { action: "INVITE_USER", entityType: "user", entityId: created.id, userId: actor.id, metadata: { email, role: inviteRole } } });
    return NextResponse.json({ ok: true, user: { id: created.id, email, role: created.role, active: true } });
  }

  const userId = String(body.userId || "");
  const role = body.role as Role;
  const active = body.active;

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (role && !ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Prevent removing the last active admin.
  if ((role && role !== "ADMIN") || active === false) {
    if (target.role === "ADMIN") {
      const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
      if (activeAdmins <= 1) {
        return NextResponse.json({ error: "Cannot demote or deactivate the last active admin" }, { status: 400 });
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ...(role ? { role } : {}), ...(typeof active === "boolean" ? { active } : {}) },
  });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE_USER_ROLE",
      entityType: "user",
      entityId: userId,
      userId: actor.id,
      metadata: { from: target.role, to: updated.role, active: updated.active },
    },
  });

  return NextResponse.json({ ok: true, user: { id: updated.id, role: updated.role, active: updated.active } });
}
