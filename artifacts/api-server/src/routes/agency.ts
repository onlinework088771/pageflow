import { Router, type IRouter } from "express";
import { eq, and, lt, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import axios from "axios";
import { db, agencySettingsTable, magicLinksTable } from "@workspace/db";
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

  const origin = `${req.protocol}://${req.get("host")}`;
  const url = `${origin}/api/auth/facebook/magic?token=${token}`;

  res.json(GenerateMagicLinkResponse.parse({ token, url, expiresAt: expiresAt.toISOString() }));
});

export default router;
