// Manages the stored Google connection used for syncing: encrypted token
// storage, transparent refresh, and building a live GoogleSheetSource.

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { refreshAccessToken, type TokenResponse } from "./oauth";
import { GoogleSheetSource } from "./sheets";

const CONNECTION_ID = "primary";

export interface ConnectionStatus {
  connected: boolean;
  email?: string;
  spreadsheetId?: string | null;
  hasRefreshToken?: boolean;
  updatedAt?: Date;
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const conn = await prisma.googleConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!conn) return { connected: false };
  return {
    connected: true,
    email: conn.email,
    spreadsheetId: conn.spreadsheetId,
    hasRefreshToken: Boolean(conn.refreshToken),
    updatedAt: conn.updatedAt,
  };
}

/** Persist tokens from an OAuth exchange (encrypting them at rest). */
export async function saveConnection(params: {
  email: string;
  tokens: TokenResponse;
  connectedByUserId?: string;
}): Promise<void> {
  const { email, tokens, connectedByUserId } = params;
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

  const existing = await prisma.googleConnection.findUnique({ where: { id: CONNECTION_ID } });
  // Google only returns a refresh_token on first consent; keep the old one otherwise.
  const refreshToken = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : existing?.refreshToken ?? null;

  await prisma.googleConnection.upsert({
    where: { id: CONNECTION_ID },
    create: {
      id: CONNECTION_ID,
      email,
      accessToken: encrypt(tokens.access_token),
      refreshToken,
      expiresAt,
      scope: tokens.scope,
      connectedByUserId,
    },
    update: {
      email,
      accessToken: encrypt(tokens.access_token),
      refreshToken,
      expiresAt,
      scope: tokens.scope,
      connectedByUserId,
    },
  });
}

export async function setSpreadsheetId(spreadsheetId: string): Promise<void> {
  await prisma.googleConnection.update({ where: { id: CONNECTION_ID }, data: { spreadsheetId } });
}

export async function disconnect(): Promise<void> {
  await prisma.googleConnection.deleteMany({ where: { id: CONNECTION_ID } });
}

/** Return a valid access token, refreshing (and persisting) if expired. */
export async function getValidAccessToken(): Promise<string | null> {
  const conn = await prisma.googleConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!conn) return null;

  const stillValid = conn.expiresAt && conn.expiresAt.getTime() - 60_000 > Date.now();
  if (stillValid) return decrypt(conn.accessToken);

  if (!conn.refreshToken) {
    // No refresh token; return current (may be expired — caller will get 401).
    return decrypt(conn.accessToken);
  }

  const refreshed = await refreshAccessToken(decrypt(conn.refreshToken));
  await prisma.googleConnection.update({
    where: { id: CONNECTION_ID },
    data: {
      accessToken: encrypt(refreshed.access_token),
      expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
      scope: refreshed.scope ?? conn.scope,
    },
  });
  return refreshed.access_token;
}

/** Build a live GoogleSheetSource for the configured master spreadsheet. */
export async function getSheetSource(): Promise<GoogleSheetSource> {
  const conn = await prisma.googleConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!conn) throw new Error("No Google account connected");
  const spreadsheetId = conn.spreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("No spreadsheet selected");
  const token = await getValidAccessToken();
  if (!token) throw new Error("Could not obtain a Google access token");
  return new GoogleSheetSource(spreadsheetId, token);
}
