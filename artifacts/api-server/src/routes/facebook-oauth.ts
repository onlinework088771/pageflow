import { Router, type IRouter } from "express";
import axios from "axios";
import { eq, lt } from "drizzle-orm";
import { db, agencySettingsTable, facebookAccountsTable, facebookPagesTable, magicLinksTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /auth/facebook - Start OAuth flow
// Token is passed as query param because browser redirects can't send headers
router.get("/auth/facebook", async (req, res): Promise<void> => {
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

  const [settings] = await db.select().from(agencySettingsTable).limit(1);

  if (!settings?.appId) {
    const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
    res.redirect(`${frontendBase}/accounts?fb_error=app_not_configured`);
    return;
  }

  const callbackUrl = `${req.protocol}://${req.get("host")}/api/auth/facebook/callback`;
  const scope = "pages_manage_posts,pages_read_engagement,pages_show_list,public_profile,email";
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64");

  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", settings.appId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");

  res.redirect(authUrl.toString());
});

// GET /auth/facebook/callback - OAuth callback
router.get("/auth/facebook/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;

  const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;

  if (error) {
    logger.warn({ error }, "Facebook OAuth denied");
    res.redirect(`${frontendBase}/accounts?fb_error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code) {
    res.redirect(`${frontendBase}/accounts?fb_error=no_code`);
    return;
  }

  try {
    const [settings] = await db.select().from(agencySettingsTable).limit(1);
    if (!settings?.appId || !settings?.appSecret) {
      res.redirect(`${frontendBase}/accounts?fb_error=app_not_configured`);
      return;
    }

    // Decode state to get userId
    let userId: number | null = null;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString());
      userId = decoded.userId;
    } catch {
      res.redirect(`${frontendBase}/accounts?fb_error=invalid_state`);
      return;
    }

    const callbackUrl = `${req.protocol}://${req.get("host")}/api/auth/facebook/callback`;

    // Exchange code for access token
    const tokenRes = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        client_id: settings.appId,
        client_secret: settings.appSecret,
        redirect_uri: callbackUrl,
        code,
      },
    });

    const { access_token: shortToken } = tokenRes.data;

    // Exchange for long-lived token
    const longTokenRes = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: settings.appId,
        client_secret: settings.appSecret,
        fb_exchange_token: shortToken,
      },
    });

    const { access_token: longToken } = longTokenRes.data;

    // Get user profile
    const profileRes = await axios.get("https://graph.facebook.com/v19.0/me", {
      params: {
        access_token: longToken,
        fields: "id,name,email,picture.width(200).height(200)",
      },
    });

    const { id: fbUserId, name, email, picture } = profileRes.data;
    const profilePicture = picture?.data?.url;

    // Upsert the Facebook account
    const [existing] = await db
      .select()
      .from(facebookAccountsTable)
      .where(eq(facebookAccountsTable.fbUserId, fbUserId));

    let accountId: number;

    if (existing) {
      await db
        .update(facebookAccountsTable)
        .set({ accessToken: longToken, status: "connected", name, email, profilePicture })
        .where(eq(facebookAccountsTable.id, existing.id));
      accountId = existing.id;
    } else {
      const [account] = await db
        .insert(facebookAccountsTable)
        .values({ fbUserId, name, email: email ?? null, profilePicture: profilePicture ?? null, accessToken: longToken, status: "connected" })
        .returning();
      accountId = account.id;
    }

    // Sync pages
    try {
      const pagesRes = await axios.get("https://graph.facebook.com/v19.0/me/accounts", {
        params: { access_token: longToken, fields: "id,name,category,picture,fan_count" },
      });

      const pages = pagesRes.data.data ?? [];
      for (const page of pages) {
        const [existingPage] = await db
          .select()
          .from(facebookPagesTable)
          .where(eq(facebookPagesTable.fbPageId, page.id));

        const pageData = {
          fbPageId: page.id,
          name: page.name,
          category: page.category ?? null,
          profilePicture: page.picture?.data?.url ?? null,
          followersCount: page.fan_count ?? 0,
          accountId,
          status: "active" as const,
          automationEnabled: false,
        };

        if (!existingPage) {
          await db.insert(facebookPagesTable).values(pageData);
        } else {
          await db.update(facebookPagesTable).set(pageData).where(eq(facebookPagesTable.id, existingPage.id));
        }
      }

      await db.update(facebookAccountsTable).set({ pagesCount: pages.length }).where(eq(facebookAccountsTable.id, accountId));
    } catch (pageErr) {
      logger.warn({ pageErr }, "Failed to sync pages after OAuth");
    }

    logger.info({ fbUserId }, "Facebook account connected via OAuth");
    res.redirect(`${frontendBase}/accounts?fb_connected=1`);
  } catch (err: unknown) {
    logger.error({ err }, "Facebook OAuth callback error");
    const msg = err instanceof Error ? err.message : "oauth_error";
    const frontBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
    res.redirect(`${frontBase}/accounts?fb_error=${encodeURIComponent(msg)}`);
  }
});

// GET /auth/facebook/magic?token=xxx — magic link initiation (no auth header needed)
router.get("/auth/facebook/magic", async (req, res): Promise<void> => {
  const { token } = req.query as Record<string, string>;
  const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;

  if (!token) {
    res.redirect(`${frontendBase}/accounts?fb_error=invalid_magic_link`);
    return;
  }

  // Expire old tokens
  await db.delete(magicLinksTable).where(lt(magicLinksTable.expiresAt, new Date()));

  const [link] = await db.select().from(magicLinksTable).where(eq(magicLinksTable.token, token));

  if (!link || link.used) {
    res.redirect(`${frontendBase}/accounts?fb_error=magic_link_expired`);
    return;
  }

  const [settings] = await db.select().from(agencySettingsTable).limit(1);
  if (!settings?.appId) {
    res.redirect(`${frontendBase}/accounts?fb_error=app_not_configured`);
    return;
  }

  // Mark token as used
  await db.update(magicLinksTable).set({ used: true }).where(eq(magicLinksTable.id, link.id));

  // Use the dedicated magic-link callback URL
  const callbackUrl = `${req.protocol}://${req.get("host")}/api/auth/facebook/magic-callback`;
  const scope = "pages_manage_posts,pages_read_engagement,pages_show_list,public_profile,email";
  const state = Buffer.from(JSON.stringify({ magic: true })).toString("base64");

  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", settings.appId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");

  res.redirect(authUrl.toString());
});

// GET /auth/facebook/magic-callback — OAuth callback for magic link initiated flows
router.get("/auth/facebook/magic-callback", async (req, res): Promise<void> => {
  const { code, error } = req.query as Record<string, string>;

  const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;

  if (error) {
    logger.warn({ error }, "Facebook magic link OAuth denied");
    res.redirect(`${frontendBase}/fb-connect?fb_error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code) {
    res.redirect(`${frontendBase}/fb-connect?fb_error=no_code`);
    return;
  }

  try {
    const [settings] = await db.select().from(agencySettingsTable).limit(1);
    if (!settings?.appId || !settings?.appSecret) {
      res.redirect(`${frontendBase}/fb-connect?fb_error=app_not_configured`);
      return;
    }

    const callbackUrl = `${req.protocol}://${req.get("host")}/api/auth/facebook/magic-callback`;

    // Exchange code for access token
    const tokenRes = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        client_id: settings.appId,
        client_secret: settings.appSecret,
        redirect_uri: callbackUrl,
        code,
      },
    });

    const { access_token: shortToken } = tokenRes.data;

    // Exchange for long-lived token
    const longTokenRes = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: settings.appId,
        client_secret: settings.appSecret,
        fb_exchange_token: shortToken,
      },
    });

    const { access_token: longToken } = longTokenRes.data;

    // Get user profile
    const profileRes = await axios.get("https://graph.facebook.com/v19.0/me", {
      params: {
        access_token: longToken,
        fields: "id,name,email,picture.width(200).height(200)",
      },
    });

    const { id: fbUserId, name, email, picture } = profileRes.data;
    const profilePicture = picture?.data?.url;

    // Upsert the Facebook account
    const [existing] = await db
      .select()
      .from(facebookAccountsTable)
      .where(eq(facebookAccountsTable.fbUserId, fbUserId));

    let accountId: number;

    if (existing) {
      await db
        .update(facebookAccountsTable)
        .set({ accessToken: longToken, status: "connected", name, email, profilePicture })
        .where(eq(facebookAccountsTable.id, existing.id));
      accountId = existing.id;
    } else {
      const [account] = await db
        .insert(facebookAccountsTable)
        .values({
          fbUserId,
          name,
          email: email ?? null,
          profilePicture: profilePicture ?? null,
          accessToken: longToken,
          status: "connected",
        })
        .returning();
      accountId = account.id;
    }

    // Sync pages
    try {
      const pagesRes = await axios.get("https://graph.facebook.com/v19.0/me/accounts", {
        params: { access_token: longToken, fields: "id,name,category,picture,fan_count" },
      });

      const pages = pagesRes.data.data ?? [];
      for (const page of pages) {
        const [existingPage] = await db
          .select()
          .from(facebookPagesTable)
          .where(eq(facebookPagesTable.fbPageId, page.id));

        const pageData = {
          fbPageId: page.id,
          name: page.name,
          category: page.category ?? null,
          profilePicture: page.picture?.data?.url ?? null,
          followersCount: page.fan_count ?? 0,
          accountId,
          status: "active" as const,
          automationEnabled: false,
        };

        if (!existingPage) {
          await db.insert(facebookPagesTable).values(pageData);
        } else {
          await db.update(facebookPagesTable).set(pageData).where(eq(facebookPagesTable.id, existingPage.id));
        }
      }

      await db.update(facebookAccountsTable).set({ pagesCount: pages.length }).where(eq(facebookAccountsTable.id, accountId));
    } catch (pageErr) {
      logger.warn({ pageErr }, "Failed to sync pages after magic link OAuth");
    }

    logger.info({ fbUserId }, "Facebook account connected via magic link");
    res.redirect(`${frontendBase}/fb-connect?fb_connected=1`);
  } catch (err: unknown) {
    logger.error({ err }, "Facebook magic-callback error");
    const msg = err instanceof Error ? err.message : "oauth_error";
    res.redirect(`${frontendBase}/fb-connect?fb_error=${encodeURIComponent(msg)}`);
  }
});

export default router;
