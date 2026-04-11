import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agencySettingsTable } from "@workspace/db";
import {
  UpdateAgencySettingsBody,
  SetupFacebookAppBody,
  GetAgencySettingsResponse,
  UpdateAgencySettingsResponse,
  SetupFacebookAppResponse,
} from "@workspace/api-zod";

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

async function ensureAgencySettings() {
  const existing = await db.select().from(agencySettingsTable).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(agencySettingsTable).values({ agencyName: "My Agency" }).returning();
  return created;
}

router.get("/agency/settings", async (req, res): Promise<void> => {
  req.log.info("Getting agency settings");
  const settings = await ensureAgencySettings();
  res.json(GetAgencySettingsResponse.parse(serializeSettings(settings)));
});

router.put("/agency/settings", async (req, res): Promise<void> => {
  const parsed = UpdateAgencySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const settings = await ensureAgencySettings();
  const updates: Record<string, unknown> = {};
  if (parsed.data.agencyName != null) updates.agencyName = parsed.data.agencyName;
  if (parsed.data.privacyPolicyUrl != null) updates.privacyPolicyUrl = parsed.data.privacyPolicyUrl;
  const [updated] = await db.update(agencySettingsTable).set(updates).where(eq(agencySettingsTable.id, settings.id)).returning();
  res.json(UpdateAgencySettingsResponse.parse(serializeSettings(updated)));
});

router.post("/agency/app-config", async (req, res): Promise<void> => {
  const parsed = SetupFacebookAppBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const settings = await ensureAgencySettings();
  const updates: Record<string, unknown> = { setupStep: parsed.data.step };
  if (parsed.data.appId != null) updates.appId = parsed.data.appId;
  if (parsed.data.appSecret != null) updates.appSecret = parsed.data.appSecret;
  if (parsed.data.privacyPolicyUrl != null) updates.privacyPolicyUrl = parsed.data.privacyPolicyUrl;
  if (parsed.data.step >= 3) {
    updates.appConfigured = true;
    updates.appLive = true;
  } else if (parsed.data.step >= 1) {
    updates.appConfigured = false;
  }
  const [updated] = await db.update(agencySettingsTable).set(updates).where(eq(agencySettingsTable.id, settings.id)).returning();
  res.json(SetupFacebookAppResponse.parse(serializeSettings(updated)));
});

export default router;
