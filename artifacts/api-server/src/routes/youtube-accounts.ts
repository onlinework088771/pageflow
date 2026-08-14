/**
 * YouTube Accounts routes (protected).
 *
 * GET  /youtube-accounts          — list connected Google accounts for user
 * DELETE /youtube-accounts/:id    — disconnect a Google account (cascade deletes channels)
 * POST /youtube-accounts/:id/sync-channels — re-sync channels from YouTube API
 */

import { Router, type IRouter } from "express";
import axios from "axios";
import {
  db,
  youtubeAccountsTable,
  youtubeChannelsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getRefreshedAccessToken(
  account: typeof youtubeAccountsTable.$inferSelect,
): Promise<{ accessToken: string; account: typeof youtubeAccountsTable.$inferSelect }> {
  const clientId = process.env["GOOGLE_CLIENT_ID"] ?? "";
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"] ?? "";

  // Token is still valid (5 min buffer)
  if (
    account.tokenExpiry &&
    new Date(account.tokenExpiry).getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return { accessToken: account.accessToken, account };
  }

  // Refresh
  const res = await axios.post(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refreshToken,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15_000,
    },
  );

  const { access_token, expires_in } = res.data;
  if (!access_token) throw new Error("Token refresh returned no access_token");

  const tokenExpiry = new Date(Date.now() + (expires_in ?? 3600) * 1000);

  const [updated] = await db
    .update(youtubeAccountsTable)
    .set({ accessToken: access_token, tokenExpiry, status: "connected" })
    .where(eq(youtubeAccountsTable.id, account.id))
    .returning();

  return { accessToken: access_token, account: updated };
}

// ---------------------------------------------------------------------------
// List accounts
// ---------------------------------------------------------------------------

router.get("/youtube-accounts", async (req, res): Promise<void> => {
  const userId = (req as any).user.id as number;

  const accounts = await db
    .select()
    .from(youtubeAccountsTable)
    .where(eq(youtubeAccountsTable.userId, userId));

  // Count channels per account
  const accountIds = accounts.map((a) => a.id);
  const channelCounts: Record<number, number> = {};

  if (accountIds.length > 0) {
    const channels = await db
      .select({ accountId: youtubeChannelsTable.accountId })
      .from(youtubeChannelsTable)
      .where(inArray(youtubeChannelsTable.accountId, accountIds));

    for (const ch of channels) {
      if (ch.accountId) {
        channelCounts[ch.accountId] = (channelCounts[ch.accountId] ?? 0) + 1;
      }
    }
  }

  const result = accounts.map((a) => ({
    id: String(a.id),
    googleId: a.googleId,
    name: a.name,
    email: a.email,
    profilePicture: a.profilePicture,
    channelsCount: channelCounts[a.id] ?? 0,
    status: a.status,
    connectedAt: a.connectedAt.toISOString(),
  }));

  res.json(result);
});

// ---------------------------------------------------------------------------
// Disconnect account
// ---------------------------------------------------------------------------

router.delete("/youtube-accounts/:id", async (req, res): Promise<void> => {
  const userId = (req as any).user.id as number;
  const accountId = parseInt(req.params["id"], 10);

  const [account] = await db
    .select()
    .from(youtubeAccountsTable)
    .where(
      and(
        eq(youtubeAccountsTable.id, accountId),
        eq(youtubeAccountsTable.userId, userId),
      ),
    );

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  // Cascade deletes channels via FK
  await db.delete(youtubeAccountsTable).where(eq(youtubeAccountsTable.id, accountId));

  logger.info({ accountId, userId }, "YouTube account disconnected");
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Sync channels
// ---------------------------------------------------------------------------

router.post(
  "/youtube-accounts/:id/sync-channels",
  async (req, res): Promise<void> => {
    const userId = (req as any).user.id as number;
    const accountId = parseInt(req.params["id"], 10);

    const [account] = await db
      .select()
      .from(youtubeAccountsTable)
      .where(
        and(
          eq(youtubeAccountsTable.id, accountId),
          eq(youtubeAccountsTable.userId, userId),
        ),
      );

    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    let accessToken: string;
    try {
      ({ accessToken } = await getRefreshedAccessToken(account));
    } catch (err: any) {
      await db
        .update(youtubeAccountsTable)
        .set({ status: "expired" })
        .where(eq(youtubeAccountsTable.id, accountId));
      res.status(401).json({ error: "Token refresh failed — please reconnect your account" });
      return;
    }

    const channelsRes = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: { part: "snippet,statistics", mine: "true", maxResults: 50 },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15_000,
      },
    );

    const items: any[] = channelsRes.data?.items ?? [];
    let synced = 0;

    for (const item of items) {
      const channelId = item.id as string;
      const channelName = item.snippet?.title ?? "Unknown Channel";
      const thumbnailUrl =
        item.snippet?.thumbnails?.default?.url ?? item.snippet?.thumbnails?.medium?.url ?? null;
      const subscriberCount = parseInt(item.statistics?.subscriberCount ?? "0", 10);

      await db
        .insert(youtubeChannelsTable)
        .values({
          accountId,
          channelId,
          name: channelName,
          description: item.snippet?.description ?? "",
          thumbnailUrl,
          subscriberCount,
          status: "paused",
        })
        .onConflictDoUpdate({
          target: youtubeChannelsTable.channelId,
          set: { name: channelName, thumbnailUrl, subscriberCount },
        });

      synced++;
    }

    logger.info({ accountId, synced }, "YouTube channels synced");
    res.json({ synced });
  },
);

export { getRefreshedAccessToken };
export default router;
