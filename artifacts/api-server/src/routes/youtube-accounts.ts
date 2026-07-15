import { Router, type IRouter } from "express";
import axios from "axios";
import { eq, and } from "drizzle-orm";
import { db, youtubeAccountsTable, youtubeChannelsTable, agencySettingsTable, type YoutubeAccount } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getSubscription, planAllows } from "../lib/plan-limits";
import { logger } from "../lib/logger";

// YouTube Accounts (Google OAuth) — Phase 2.
// Fully separate from Facebook OAuth/accounts and from the existing /youtube/scrape
// route (which is an unrelated RSS-based content source for Facebook automation).
//
// Two routers are exported:
// - publicRouter: OAuth start + callback (Google redirects the browser here with no
//   Authorization header, so these mirror the facebook-oauth.ts pattern of passing the
//   JWT as a query param / decoding userId from `state`).
// - protectedRouter: list / disconnect / reconnect / refresh-channels, mounted behind requireAuth.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
// Phase 4 adds the upload scope so the upload engine (youtube-poster.ts) can publish
// videos with tokens issued through this same connect flow. Accounts connected before
// this change only hold the read-only scope and will need to reconnect (the existing
// "Reconnect" button re-runs this OAuth flow and Google will re-prompt for consent).
const YOUTUBE_SCOPE = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

// Load Google OAuth credentials from the database at runtime (same pattern as Facebook).
// Falls back to env vars for local dev convenience; DB always takes priority.
async function getGoogleCredentials(userId: number): Promise<{ clientId: string; clientSecret: string } | null> {
  const [settings] = await db
    .select()
    .from(agencySettingsTable)
    .where(eq(agencySettingsTable.userId, userId))
    .limit(1);
  if (settings?.googleClientId && settings?.googleClientSecret) {
    return { clientId: settings.googleClientId, clientSecret: settings.googleClientSecret };
  }
  // Fallback: env vars (dev convenience only — not required in production)
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

// Variant used in contexts where we don't have a userId (scheduler / poster services).
// Reads the first admin row's settings.
export async function getGoogleCredentialsForService(): Promise<{ clientId: string; clientSecret: string } | null> {
  const [settings] = await db
    .select()
    .from(agencySettingsTable)
    .orderBy(agencySettingsTable.id)
    .limit(1);
  if (settings?.googleClientId && settings?.googleClientSecret) {
    return { clientId: settings.googleClientId, clientSecret: settings.googleClientSecret };
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

function getCallbackUrl(req: any): string {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}/api/auth/youtube/callback`;
}

async function fetchAndStoreChannels(accountId: number, accessToken: string) {
  const res = await axios.get(YOUTUBE_CHANNELS_URL, {
    params: { part: "snippet,statistics", mine: true },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const items = res.data.items ?? [];
  for (const item of items) {
    const channelId = item.id;
    const snippet = item.snippet ?? {};
    const stats = item.statistics ?? {};

    const [existing] = await db
      .select()
      .from(youtubeChannelsTable)
      .where(and(eq(youtubeChannelsTable.accountId, accountId), eq(youtubeChannelsTable.channelId, channelId)));

    const channelData = {
      accountId,
      channelId,
      title: snippet.title ?? "Untitled channel",
      description: snippet.description ?? null,
      thumbnail: snippet.thumbnails?.default?.url ?? null,
      customUrl: snippet.customUrl ?? null,
      subscriberCount: parseInt(stats.subscriberCount ?? "0", 10),
      videoCount: parseInt(stats.videoCount ?? "0", 10),
    };

    if (existing) {
      await db.update(youtubeChannelsTable).set(channelData).where(eq(youtubeChannelsTable.id, existing.id));
    } else {
      await db.insert(youtubeChannelsTable).values(channelData);
    }
  }

  return items.length;
}

// ---- Public router (OAuth start + callback; not behind requireAuth) ----
export const youtubeAccountsPublicRouter: IRouter = Router();

// GET /auth/youtube - Start OAuth flow
// Token is passed as query param because browser redirects can't send headers.
youtubeAccountsPublicRouter.get("/auth/youtube", async (req, res): Promise<void> => {
  const tokenFromQuery = req.query.token as string | undefined;
  let userId: number | null = null;

  if (tokenFromQuery) {
    try {
      const jwt = await import("jsonwebtoken");
      const secret = process.env.SESSION_SECRET!;
      const payload = jwt.default.verify(tokenFromQuery, secret) as { userId: number };
      userId = payload.userId;
    } catch {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
  } else if (req.user) {
    userId = req.user.userId;
  } else {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
  const creds = await getGoogleCredentials(userId!);

  if (!creds) {
    res.redirect(`${frontendBase}/youtube/accounts?yt_error=app_not_configured`);
    return;
  }

  // Phase 7 — plan gating. Only blocks *new* connections; channels connected
  // before Phase 7 (or under a grandfathered plan) are never disabled by this check.
  const sub = await getSubscription(userId!);
  if (!planAllows(sub.plan, "youtube")) {
    res.redirect(`${frontendBase}/youtube/accounts?yt_error=plan_upgrade_required`);
    return;
  }

  const state = Buffer.from(JSON.stringify({ userId })).toString("base64");

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", creds.clientId);
  authUrl.searchParams.set("redirect_uri", getCallbackUrl(req));
  authUrl.searchParams.set("scope", YOUTUBE_SCOPE);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  res.redirect(authUrl.toString());
});

// GET /auth/youtube/callback - OAuth callback
youtubeAccountsPublicRouter.get("/auth/youtube/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;
  const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;

  if (error) {
    logger.warn({ error }, "YouTube OAuth denied");
    res.redirect(`${frontendBase}/youtube/accounts?yt_error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code) {
    res.redirect(`${frontendBase}/youtube/accounts?yt_error=no_code`);
    return;
  }

  let userId: number | null = null;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64").toString());
    userId = decoded.userId;
  } catch {
    res.redirect(`${frontendBase}/youtube/accounts?yt_error=invalid_state`);
    return;
  }

  const creds = await getGoogleCredentials(userId!);
  if (!creds) {
    res.redirect(`${frontendBase}/youtube/accounts?yt_error=app_not_configured`);
    return;
  }

  try {
    const tokenRes = await axios.post(
      GOOGLE_TOKEN_URL,
      new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: getCallbackUrl(req),
        grant_type: "authorization_code",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, scope } = tokenRes.data;

    const profileRes = await axios.get(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { id: googleUserId, name, email, picture } = profileRes.data;

    const [existing] = await db
      .select()
      .from(youtubeAccountsTable)
      .where(and(eq(youtubeAccountsTable.googleUserId, googleUserId), eq(youtubeAccountsTable.userId, userId!)));

    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    let accountId: number;
    if (existing) {
      await db
        .update(youtubeAccountsTable)
        .set({
          accessToken,
          // Google only returns a refresh_token on the very first consent grant for a given
          // account, so keep the previously stored one if this response doesn't include a new one.
          refreshToken: refreshToken ?? existing.refreshToken,
          tokenExpiresAt,
          scope,
          status: "connected",
          name,
          email: email ?? null,
          profilePicture: picture ?? null,
        })
        .where(eq(youtubeAccountsTable.id, existing.id));
      accountId = existing.id;
    } else {
      const [account] = await db
        .insert(youtubeAccountsTable)
        .values({
          userId: userId!,
          googleUserId,
          name,
          email: email ?? null,
          profilePicture: picture ?? null,
          accessToken,
          refreshToken: refreshToken ?? null,
          tokenExpiresAt,
          scope,
          status: "connected",
        })
        .returning();
      accountId = account.id;
    }

    try {
      await fetchAndStoreChannels(accountId, accessToken);
    } catch (channelErr) {
      logger.error({ err: channelErr, accountId }, "Failed to fetch YouTube channels after connect");
    }

    res.redirect(`${frontendBase}/youtube/accounts?yt_connected=1`);
  } catch (err: any) {
    logger.error({ err: err?.response?.data ?? err }, "YouTube OAuth callback failed");
    res.redirect(`${frontendBase}/youtube/accounts?yt_error=oauth_failed`);
  }
});

// ---- Protected router (list / disconnect / reconnect / refresh-channels) ----
export const youtubeAccountsRouter: IRouter = Router();
youtubeAccountsRouter.use(requireAuth);

// GET /youtube/accounts - list connected accounts + their channels
youtubeAccountsRouter.get("/youtube/accounts", async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const accounts = await db.select().from(youtubeAccountsTable).where(eq(youtubeAccountsTable.userId, userId));

  const result = await Promise.all(
    accounts.map(async (account: YoutubeAccount) => {
      const channels = await db
        .select()
        .from(youtubeChannelsTable)
        .where(eq(youtubeChannelsTable.accountId, account.id));
      const { accessToken, refreshToken, ...safeAccount } = account;
      return { ...safeAccount, channels };
    }),
  );

  res.json(result);
});

// POST /youtube/accounts/:id/disconnect - revoke token and delete stored account + channels
youtubeAccountsRouter.post("/youtube/accounts/:id/disconnect", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const accountId = parseInt(req.params.id, 10);

  const [account] = await db
    .select()
    .from(youtubeAccountsTable)
    .where(and(eq(youtubeAccountsTable.id, accountId), eq(youtubeAccountsTable.userId, userId)));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  try {
    await axios.post("https://oauth2.googleapis.com/revoke", new URLSearchParams({ token: account.accessToken }), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch (err) {
    // Revocation failing (e.g. token already expired) shouldn't block local disconnect.
    logger.warn({ err, accountId }, "Failed to revoke Google token on disconnect");
  }

  await db.delete(youtubeAccountsTable).where(eq(youtubeAccountsTable.id, accountId));
  res.json({ success: true });
});

// POST /youtube/accounts/:id/refresh-channels - re-fetch channel list using the stored refresh token
youtubeAccountsRouter.post("/youtube/accounts/:id/refresh-channels", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const accountId = parseInt(req.params.id, 10);

  const [account] = await db
    .select()
    .from(youtubeAccountsTable)
    .where(and(eq(youtubeAccountsTable.id, accountId), eq(youtubeAccountsTable.userId, userId)));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const creds = await getGoogleCredentials(userId);
  if (!creds) {
    res.status(500).json({ error: "Google OAuth credentials are not configured. An admin must add them in YouTube Developer Settings." });
    return;
  }

  if (!account.refreshToken) {
    res.status(400).json({ error: "No refresh token stored for this account; reconnect required" });
    return;
  }

  try {
    const tokenRes = await axios.post(
      GOOGLE_TOKEN_URL,
      new URLSearchParams({
        refresh_token: account.refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "refresh_token",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const { access_token: accessToken, expires_in: expiresIn } = tokenRes.data;
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    await db
      .update(youtubeAccountsTable)
      .set({ accessToken, tokenExpiresAt, status: "connected" })
      .where(eq(youtubeAccountsTable.id, accountId));

    const channelCount = await fetchAndStoreChannels(accountId, accessToken);

    const channels = await db.select().from(youtubeChannelsTable).where(eq(youtubeChannelsTable.accountId, accountId));
    res.json({ success: true, channelCount, channels });
  } catch (err: any) {
    logger.error({ err: err?.response?.data ?? err, accountId }, "Failed to refresh YouTube channels");
    await db.update(youtubeAccountsTable).set({ status: "error" }).where(eq(youtubeAccountsTable.id, accountId));
    res.status(502).json({ error: "Failed to refresh access token or channels from Google" });
  }
});

export default youtubeAccountsRouter;
