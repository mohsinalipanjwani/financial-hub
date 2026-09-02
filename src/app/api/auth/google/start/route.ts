import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { isGoogleConfigured, buildAuthUrl } from "@/lib/google/oauth";

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 503 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
