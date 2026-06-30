import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, lt, asc, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import axios from "axios";
import { db, agencySettingsTable, magicLinksTable, automationLogsTable } from "@workspace/db";
import {
  UpdateAgencySettingsBody,
  SetupFacebookAppBody,
  GetAgencySettingsResponse,
  UpdateAgencySettingsResponse,
  SetupFacebookAppResponse,
  VerifyFacebookCredentialsBody,
  GenerateMagicLinkResponse,
  ResetAgencySettingsResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function serializeSettings(s: typeof agencySettingsTable.$inferSelect) {
  return {
    id: String(s.id),
    agencyName: s.agencyName,
    appId: s.appId ?? undefined,
    appSecret: s.appSecret ?? undefined,
    privacyPolicyUrl: s.privacyPolicyUrl ?? undefined,
    appConfigured: s.appConfigured,
    appLive: s.appLive,
    setupStep: s.setupStep,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
  };
}

async function ensureAgencySettings(userId: number) {
  const existing = await db
    .select()
    .from(agencySettingsTable)
    .where(eq(agencySettingsTable.userId, userId))
    .orderBy(asc(agencySettingsTable.id))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db
    .insert(agencySettingsTable)
    .values({ userId, agencyName: "My Agency" })
    .returning();
  return created;
}

function requireAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

router.get("/agency/settings", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const settings = await ensureAgencySettings(userId);
  res.json(GetAgencySettingsResponse.parse(serializeSettings(settings)));
});

router.put("/agency/settings", async (req, res): Promise<void> => {
  const parsed = UpdateAgencySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.user!.userId;
  const settings = await ensureAgencySettings(userId);
  const updates: Record<string, unknown> = {};
  if (parsed.data.agencyName != null) updates.agencyName = parsed.data.agencyName;
  if (parsed.data.privacyPolicyUrl != null) updates.privacyPolicyUrl = parsed.data.privacyPolicyUrl;
  const [updated] = await db
    .update(agencySettingsTable)
    .set(updates)
    .where(and(eq(agencySettingsTable.id, settings.id), eq(agencySettingsTable.userId, userId)))
    .returning();
  res.json(UpdateAgencySettingsResponse.parse(serializeSettings(updated)));
});

router.delete("/agency/settings", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const settings = await ensureAgencySettings(userId);
  const [reset] = await db
    .update(agencySettingsTable)
    .set({
      appId: null,
      appSecret: null,
      privacyPolicyUrl: null,
      appConfigured: false,
      appLive: false,
      setupStep: 1,
      updatedAt: new Date(),
    })
    .where(and(eq(agencySettingsTable.id, settings.id), eq(agencySettingsTable.userId, userId)))
    .returning();
  logger.info({ id: settings.id, userId }, "Agency settings reset");
  res.json(ResetAgencySettingsResponse.parse(serializeSettings(reset)));
});

router.post("/agency/app-config", async (req, res): Promise<void> => {
  const parsed = SetupFacebookAppBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.user!.userId;
  const settings = await ensureAgencySettings(userId);
  const updates: Record<string, unknown> = { setupStep: parsed.data.step };
  if (parsed.data.appId != null) updates.appId = parsed.data.appId;
  if (parsed.data.appSecret != null) updates.appSecret = parsed.data.appSecret;
  if (parsed.data.privacyPolicyUrl != null) updates.privacyPolicyUrl = parsed.data.privacyPolicyUrl;
  const [updated] = await db
    .update(agencySettingsTable)
    .set(updates)
    .where(and(eq(agencySettingsTable.id, settings.id), eq(agencySettingsTable.userId, userId)))
    .returning();
  res.json(SetupFacebookAppResponse.parse(serializeSettings(updated)));
});

router.post("/agency/verify-credentials", async (req, res): Promise<void> => {
  const parsed = VerifyFacebookCredentialsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { appId, appSecret } = parsed.data;
  const userId = req.user!.userId;

  try {
    const verifyRes = await axios.get(`https://graph.facebook.com/v19.0/${appId}`, {
      params: {
        access_token: `${appId}|${appSecret}`,
        fields: "id,name,link",
      },
    });

    const appData = verifyRes.data;
    logger.info({ appId, appName: appData.name, userId }, "Facebook app credentials verified");

    const settings = await ensureAgencySettings(userId);
    const [updated] = await db
      .update(agencySettingsTable)
      .set({
        appId,
        appSecret,
        appConfigured: true,
        appLive: true,
        setupStep: 5,
        agencyName: appData.name ?? settings.agencyName,
      })
      .where(and(eq(agencySettingsTable.id, settings.id), eq(agencySettingsTable.userId, userId)))
      .returning();

    res.json(GetAgencySettingsResponse.parse(serializeSettings(updated)));
  } catch (err: unknown) {
    logger.warn({ err, appId, userId }, "Facebook app credentials verification failed");
    const msg =
      (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
      "Invalid App ID or App Secret. Please check your credentials.";
    res.status(400).json({ error: msg });
  }
});

router.post("/agency/magic-link", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const settings = await ensureAgencySettings(userId);
  if (!settings.appId) {
    res.status(400).json({ error: "Facebook App not configured. Complete the BYOC setup first." });
    return;
  }

  await db.delete(magicLinksTable).where(eq(magicLinksTable.used, true));

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await db.insert(magicLinksTable).values({ userId, token, expiresAt });

  const origin = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const url = `${origin}/api/auth/facebook/magic?token=${token}`;

  res.json(GenerateMagicLinkResponse.parse({ token, url, expiresAt: expiresAt.toISOString() }));
});

// ---------------------------------------------------------------------------
// Facebook Developer Settings — admin-only endpoints
// ---------------------------------------------------------------------------

// POST /agency/developer-settings/test
// Verify credentials with Facebook without saving. Returns app info or error.
router.post("/agency/developer-settings/test", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const { appId, appSecret } = req.body as { appId?: string; appSecret?: string };
  if (!appId?.trim() || !appSecret?.trim()) {
    res.status(400).json({ error: "App ID and App Secret are required." });
    return;
  }

  try {
    const verifyRes = await axios.get(`https://graph.facebook.com/v19.0/${appId.trim()}`, {
      params: {
        access_token: `${appId.trim()}|${appSecret.trim()}`,
        fields: "id,name",
      },
    });
    logger.info({ appId, userId: req.user!.userId }, "Developer settings: test connection success");
    res.json({ valid: true, appName: verifyRes.data.name ?? null, appId: verifyRes.data.id });
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
      "Invalid App ID or App Secret. Please check your credentials.";
    logger.warn({ appId, userId: req.user!.userId }, "Developer settings: test connection failed");
    res.status(400).json({ error: msg });
  }
});

// POST /agency/developer-settings
// Verify credentials, save them, back up previous credentials, and log the change.
router.post("/agency/developer-settings", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const { appId, appSecret } = req.body as { appId?: string; appSecret?: string };
  if (!appId?.trim() || !appSecret?.trim()) {
    res.status(400).json({ error: "App ID and App Secret are required." });
    return;
  }

  const userId = req.user!.userId;
  const trimmedAppId = appId.trim();
  const trimmedAppSecret = appSecret.trim();

  try {
    // Always verify with Facebook before saving
    const verifyRes = await axios.get(`https://graph.facebook.com/v19.0/${trimmedAppId}`, {
      params: {
        access_token: `${trimmedAppId}|${trimmedAppSecret}`,
        fields: "id,name",
      },
    });
    const appName: string | null = verifyRes.data.name ?? null;

    const settings = await ensureAgencySettings(userId);
    const previousAppId = settings.appId ?? null;
    const previousAppSecret = settings.appSecret ?? null;

    const [updated] = await db
      .update(agencySettingsTable)
      .set({
        appId: trimmedAppId,
        appSecret: trimmedAppSecret,
        appConfigured: true,
        appLive: true,
        setupStep: 5,
        agencyName: appName ?? settings.agencyName,
        backupAppId: previousAppId,
        backupAppSecret: previousAppSecret,
      })
      .where(and(eq(agencySettingsTable.id, settings.id), eq(agencySettingsTable.userId, userId)))
      .returning();

    // Log the change — never write the secret itself to the log
    await db.insert(automationLogsTable).values({
      type: "developer_settings",
      message: `App credentials updated. New App ID: ${trimmedAppId}${previousAppId ? ` (previous: ${previousAppId})` : " (first time setup)"}`,
      status: "success",
      metadata: JSON.stringify({
        action: "credentials_updated",
        newAppId: trimmedAppId,
        previousAppId,
        appName,
        changedBy: req.user!.email,
      }),
    });

    logger.info({ userId, appId: trimmedAppId, appName }, "Developer settings: credentials updated");

    res.json({
      id: String(updated.id),
      agencyName: updated.agencyName,
      appId: updated.appId ?? null,
      appConfigured: updated.appConfigured,
      appLive: updated.appLive,
      setupStep: updated.setupStep,
      hasBackup: !!(updated.backupAppId && updated.backupAppSecret),
      backupAppId: updated.backupAppId ?? null,
      updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
    });
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
      "Invalid App ID or App Secret. Verify your credentials and try again.";
    logger.warn({ userId, appId: trimmedAppId }, "Developer settings: credential update failed");
    res.status(400).json({ error: msg });
  }
});

// POST /agency/developer-settings/rollback
// Restore the previously backed-up App ID and App Secret.
router.post("/agency/developer-settings/rollback", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const userId = req.user!.userId;
  const settings = await ensureAgencySettings(userId);

  if (!settings.backupAppId || !settings.backupAppSecret) {
    res.status(400).json({ error: "No backup configuration is available to roll back to." });
    return;
  }

  const restoredAppId = settings.backupAppId;

  const [updated] = await db
    .update(agencySettingsTable)
    .set({
      appId: settings.backupAppId,
      appSecret: settings.backupAppSecret,
      backupAppId: null,
      backupAppSecret: null,
    })
    .where(and(eq(agencySettingsTable.id, settings.id), eq(agencySettingsTable.userId, userId)))
    .returning();

  await db.insert(automationLogsTable).values({
    type: "developer_settings",
    message: `Credentials rolled back to previous App ID: ${restoredAppId}`,
    status: "info",
    metadata: JSON.stringify({
      action: "credentials_rolled_back",
      restoredAppId,
      changedBy: req.user!.email,
    }),
  });

  logger.info({ userId, restoredAppId }, "Developer settings: credentials rolled back");

  res.json({
    id: String(updated.id),
    agencyName: updated.agencyName,
    appId: updated.appId ?? null,
    appConfigured: updated.appConfigured,
    appLive: updated.appLive,
    setupStep: updated.setupStep,
    hasBackup: false,
    backupAppId: null,
    updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
  });
});

// GET /agency/developer-settings/changelog
// Return the last 20 developer-settings change log entries.
router.get("/agency/developer-settings/changelog", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const logs = await db
    .select()
    .from(automationLogsTable)
    .where(eq(automationLogsTable.type, "developer_settings"))
    .orderBy(desc(automationLogsTable.createdAt))
    .limit(20);

  res.json(
    logs.map((l) => ({
      id: String(l.id),
      message: l.message,
      status: l.status,
      metadata: l.metadata ? (() => { try { return JSON.parse(l.metadata!); } catch { return null; } })() : null,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    })),
  );
});

// GET /agency/developer-settings
// Return safe (no secret) current developer settings status for the admin panel.
router.get("/agency/developer-settings", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const userId = req.user!.userId;
  const settings = await ensureAgencySettings(userId);

  res.json({
    id: String(settings.id),
    agencyName: settings.agencyName,
    appId: settings.appId ?? null,
    appConfigured: settings.appConfigured,
    appLive: settings.appLive,
    setupStep: settings.setupStep,
    hasBackup: !!(settings.backupAppId && settings.backupAppSecret),
    backupAppId: settings.backupAppId ?? null,
    updatedAt: settings.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings.updatedAt,
  });
});

export default router;
