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
