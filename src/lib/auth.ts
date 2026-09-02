// Authentication & authorization.
//
// Phase 1 uses a signed-cookie session with a dev login (pick a seeded user).
// The session shape and permission checks are designed so Phase 2 can swap the
// login mechanism for Google OAuth without touching the rest of the app.

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

export type Role = "ADMIN" | "FINANCE" | "MANAGEMENT" | "EMPLOYEE";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

const COOKIE_NAME = "fh_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-me",
);

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Read + verify the current session, or null. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/** Look up a user by email for dev login. */
export async function findUserByEmail(email: string): Promise<SessionUser | null> {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u || !u.active) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role };
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** Roles allowed to see company-wide financials (revenue, profit, expenses). */
export const FINANCIAL_ROLES: Role[] = ["ADMIN", "FINANCE", "MANAGEMENT"];

/** Roles allowed to view sensitive salary detail. */
export const SALARY_ROLES: Role[] = ["ADMIN", "FINANCE"];

/** Roles allowed to manage sync / configuration. */
export const CONFIG_ROLES: Role[] = ["ADMIN", "FINANCE"];

export function canViewFinancials(role: Role): boolean {
  return FINANCIAL_ROLES.includes(role);
}

export function canViewSalaries(role: Role): boolean {
  return SALARY_ROLES.includes(role);
}

export function canManageConfig(role: Role): boolean {
  return CONFIG_ROLES.includes(role);
}

// --- Invoicing ---
/** Roles allowed to create / issue / void invoices and edit billing profiles. */
export const INVOICE_MANAGE_ROLES: Role[] = ["ADMIN", "FINANCE"];

/** Management can view invoices; employees cannot. */
export function canViewInvoices(role: Role): boolean {
  return FINANCIAL_ROLES.includes(role);
}

export function canManageInvoices(role: Role): boolean {
  return INVOICE_MANAGE_ROLES.includes(role);
}

/** Bank / payment details on the company profile are the most sensitive. */
export function canViewBankDetails(role: Role): boolean {
  return INVOICE_MANAGE_ROLES.includes(role);
}

/** Throws if the session is missing or lacks financial access. */
export async function requireFinancialAccess(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!canViewFinancials(user.role)) throw new Error("FORBIDDEN");
  return user;
}
