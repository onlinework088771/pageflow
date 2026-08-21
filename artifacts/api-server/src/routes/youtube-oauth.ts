/**
 * YouTube OAuth routes — public (no requireAuth middleware).
 *
 * Flow mirrors Facebook OAuth:
 *   1. GET /api/youtube/auth/start?token=<JWT>
 *      → validates JWT, builds Google OAuth URL, redirects to Google
 *   2. GET /api/youtube/auth/callback?code=...&state=<JWT>
 *      → exchanges code, fetches profile + channels, stores in DB,
 *        redirects to FRONTEND_URL/youtube-accounts
 */

import { Router, type IRouter } from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import {
  db,
  youtubeAccountsTable,
  youtubeChannelsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"] ?? "";
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
const JWT_SECRET = process.env["SESSION_SECRET"] ?? "default_secret";

function getCallbackUrl(): string {
  const base =
    process.env["PUBLIC_BASE_URL"] ??
    (process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : "http://localhost:8080");
  return `${base}/api/youtube/auth/callback`;
}

function getFrontendUrl(): string {
  return (
    process.env["FRONTEND_URL"] ??
    (process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : "http://localhost:5173")
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Start OAuth flow
// ---------------------------------------------------------------------------

router.get("/youtube/auth/start", (req, res): void => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(503).json({
      error:
        "YouTube OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
    });
    return;
  }

  const { token } = req.query as Record<string, string>;
  if (!token) {
    res.status(400).json({ error: "Missing token parameter" });
    return;
  }

  // Validate the JWT so only authenticated users can start OAuth
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const scopes = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getCallbackUrl(),
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent", // always get refresh_token
    state: token, // carry JWT through OAuth flow
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ---------------------------------------------------------------------------
// Step 2 — OAuth callback
// ---------------------------------------------------------------------------

router.get("/youtube/auth/callback", async (req, res): Promise<void> => {
  const { code, state: jwtToken, error } = req.query as Record<string, string>;

  const frontendUrl = getFrontendUrl();

  if (error) {
    logger.warn({ error }, "YouTube OAuth: user denied access");
    res.redirect(`${frontendUrl}/youtube-accounts?error=access_denied`);
    return;
  }

  if (!code || !jwtToken) {
    res.redirect(`${frontendUrl}/youtube-accounts?error=missing_params`);
    return;
  }

  // Validate JWT → extract userId
  let userId: number;
  try {
    const decoded = jwt.verify(jwtToken, JWT_SECRET) as { userId?: number };
    if (!decoded.userId) throw new Error("JWT does not contain a userId claim");
    userId = decoded.userId;
  } catch {
    res.redirect(`${frontendUrl}/youtube-accounts?error=invalid_token`);
    return;
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: getCallbackUrl(),
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15_000 },
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    if (!access_token || !refresh_token) {
      throw new Error("Google token exchange returned no tokens");
    }

    const tokenExpiry = new Date(Date.now() + (expires_in ?? 3600) * 1000);

    // Fetch Google profile
    const profileRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 10_000,
      },
    );
    const { id: googleId, name, email, picture } = profileRes.data;

    if (!googleId) throw new Error("Could not retrieve Google user ID");

    // Upsert youtube_account
    const [account] = await db
      .insert(youtubeAccountsTable)
      .values({
        userId,
        googleId,
        name: name ?? "Unknown",
        email: email ?? null,
        profilePicture: picture ?? null,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiry,
        status: "connected",
      })
      .onConflictDoUpdate({
        target: [youtubeAccountsTable.userId, youtubeAccountsTable.googleId],
        set: {
          name: name ?? "Unknown",
          email: email ?? null,
          profilePicture: picture ?? null,
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiry,
          status: "connected",
        },
      })
      .returning();

    // Fetch the user's YouTube channels
    const channelsRes = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: {
          part: "snippet,statistics",
          mine: "true",
          maxResults: 50,
        },
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 15_000,
      },
    );

    const items: any[] = channelsRes.data?.items ?? [];
    let syncedCount = 0;

    for (const item of items) {
      const channelId = item.id as string;
      const channelName = item.snippet?.title ?? "Unknown Channel";
      const description = item.snippet?.description ?? "";
      const thumbnailUrl =
        item.snippet?.thumbnails?.default?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        null;
      const subscriberCount = parseInt(
        item.statistics?.subscriberCount ?? "0",
        10,
      );

      await db
        .insert(youtubeChannelsTable)
        .values({
          accountId: account.id,
          channelId,
          name: channelName,
          description,
          thumbnailUrl,
          subscriberCount,
          status: "paused",
        })
        .onConflictDoUpdate({
          target: youtubeChannelsTable.channelId,
          set: {
            name: channelName,
            description,
            thumbnailUrl,
            subscriberCount,
          },
        });

      syncedCount++;
    }

    logger.info(
      { userId, googleId, accountId: account.id, syncedCount },
      "YouTube OAuth: account connected and channels synced",
    );

    res.redirect(`${frontendUrl}/youtube-accounts?connected=1&channels=${syncedCount}`);
  } catch (err: any) {
    const msg = err?.response?.data?.error ?? err.message ?? "Unknown error";
    logger.error({ err: msg, userId }, "YouTube OAuth callback failed");
    res.redirect(`${frontendUrl}/youtube-accounts?error=oauth_failed`);
  }
});

export default router;
