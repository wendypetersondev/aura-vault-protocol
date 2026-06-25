import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const JWT_SECRET = process.env.JWT_SECRET || "aura-vault-dev-secret";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_TOKEN_EXPIRY = `${REFRESH_TOKEN_EXPIRY_DAYS}d`;

export interface TokenPayload {
  sub: string;
  sessionId: string;
  deviceId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// In-memory stores — replace with Redis/DB in production
const blacklistedTokens = new Set<string>();
const refreshTokens = new Map<string, { userId: string; deviceId?: string; expiresAt: number }>();
const userSessions = new Map<string, Set<string>>();

export function generateTokens(userId: string, deviceId?: string): TokenPair {
  const sessionId = uuidv4();

  const accessToken = jwt.sign(
    { sub: userId, sessionId, deviceId } satisfies TokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { sub: userId, sessionId, type: "refresh" },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  const expiresAt = Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  refreshTokens.set(refreshToken, { userId, deviceId, expiresAt });

  // Track session per user (multi-device)
  if (!userSessions.has(userId)) userSessions.set(userId, new Set());
  userSessions.get(userId)!.add(sessionId);

  return { accessToken, refreshToken, expiresIn: 900 };
}

export function validateAccessToken(token: string): TokenPayload | null {
  if (blacklistedTokens.has(token)) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function refreshAccessToken(refreshToken: string): TokenPair | null {
  const stored = refreshTokens.get(refreshToken);
  if (!stored || stored.expiresAt < Date.now()) return null;

  try {
    jwt.verify(refreshToken, JWT_SECRET);
  } catch {
    return null;
  }

  // Rotate: invalidate old refresh token, issue new pair
  refreshTokens.delete(refreshToken);
  return generateTokens(stored.userId, stored.deviceId);
}

export function blacklistToken(token: string): void {
  blacklistedTokens.add(token);
}

export function logout(accessToken: string, refreshToken?: string): void {
  blacklistToken(accessToken);
  if (refreshToken) {
    refreshTokens.delete(refreshToken);
  }
}

export function getUserSessions(userId: string): string[] {
  return Array.from(userSessions.get(userId) ?? []);
}

export function revokeAllSessions(userId: string): void {
  userSessions.delete(userId);
}
