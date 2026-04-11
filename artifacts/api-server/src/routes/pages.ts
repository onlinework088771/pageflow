import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, facebookPagesTable, facebookAccountsTable } from "@workspace/db";
import {
  CreatePageBody,
  UpdatePageBody,
  UpdatePageParams,
  GetPageParams,
  DeletePageParams,
  ListPagesQueryParams,
  ListPagesResponse,
  GetPageResponse,
  UpdatePageResponse,
  UpdatePageAutomationBody,
  UpdatePageAutomationParams,
  UpdatePageAutomationResponse,
  UpdatePageSourceBody,
  UpdatePageSourceParams,
  UpdatePageSourceResponse,
  GetAccountAvailablePagesParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializePage(p: typeof facebookPagesTable.$inferSelect) {
  return {
    id: String(p.id),
    fbPageId: p.fbPageId,
    name: p.name,
    category: p.category ?? undefined,
    profilePicture: p.profilePicture ?? undefined,
    followersCount: p.followersCount,
    automationEnabled: p.automationEnabled,
    postingFrequency: p.postingFrequency,
    status: p.status,
    accountId: String(p.accountId),
    lastPostedAt: p.lastPostedAt instanceof Date ? p.lastPostedAt.toISOString() : (p.lastPostedAt ?? undefined),
    sourceType: p.sourceType ?? undefined,
    sourceIdentity: p.sourceIdentity ?? undefined,
    postsPerDay: p.postsPerDay,
    scheduleLogic: p.scheduleLogic,
    timezone: p.timezone,
    timeSlots: Array.isArray(p.timeSlots) ? p.timeSlots : [],
    scrapingStatus: p.scrapingStatus,
    totalPosted: p.totalPosted,
    totalPending: p.totalPending,
    totalFailed: p.totalFailed,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

router.get("/pages", async (req, res): Promise<void> => {
  const queryParsed = ListPagesQueryParams.safeParse(req.query);
  const statusFilter = queryParsed.success ? queryParsed.data.status : undefined;

  if (statusFilter && statusFilter !== "all") {
    const pages = await db.select().from(facebookPagesTable).where(eq(facebookPagesTable.status, statusFilter as "active" | "paused")).orderBy(asc(facebookPagesTable.createdAt));
    res.json(ListPagesResponse.parse(pages.map(serializePage)));
    return;
  }
  const pages = await db.select().from(facebookPagesTable).orderBy(asc(facebookPagesTable.createdAt));
  res.json(ListPagesResponse.parse(pages.map(serializePage)));
});

router.post("/pages", async (req, res): Promise<void> => {
  const parsed = CreatePageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const accountId = parseInt(parsed.data.accountId, 10);
  const [account] = await db.select().from(facebookAccountsTable).where(eq(facebookAccountsTable.id, accountId));
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const [page] = await db.insert(facebookPagesTable).values({
    fbPageId: parsed.data.fbPageId,
    name: parsed.data.name,
    category: parsed.data.category ?? undefined,
    accountId,
    postingFrequency: parsed.data.postingFrequency ?? "daily",
    sourceType: parsed.data.sourceType ?? undefined,
    sourceIdentity: parsed.data.sourceIdentity ?? undefined,
    postsPerDay: parsed.data.postsPerDay ?? 3,
    scheduleLogic: parsed.data.scheduleLogic ?? "fixed",
    timezone: parsed.data.timezone ?? "UTC",
    status: "active",
    automationEnabled: true,
    scrapingStatus: "pending",
  }).onConflictDoUpdate({
    target: facebookPagesTable.fbPageId,
    set: {
      name: parsed.data.name,
      category: parsed.data.category ?? undefined,
      accountId,
      postingFrequency: parsed.data.postingFrequency ?? "daily",
      sourceType: parsed.data.sourceType ?? undefined,
      sourceIdentity: parsed.data.sourceIdentity ?? undefined,
      postsPerDay: parsed.data.postsPerDay ?? 3,
      scheduleLogic: parsed.data.scheduleLogic ?? "fixed",
      timezone: parsed.data.timezone ?? "UTC",
      status: "active",
      automationEnabled: true,
      scrapingStatus: "pending",
    },
  }).returning();

  const existingPages = await db.select().from(facebookPagesTable).where(eq(facebookPagesTable.accountId, accountId));
  await db.update(facebookAccountsTable).set({ pagesCount: existingPages.length }).where(eq(facebookAccountsTable.id, accountId));

  res.status(201).json(GetPageResponse.parse(serializePage(page)));
});

router.get("/pages/:pageId", async (req, res): Promise<void> => {
  const params = GetPageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = parseInt(params.data.pageId, 10);
  const [page] = await db.select().from(facebookPagesTable).where(eq(facebookPagesTable.id, id));
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  res.json(GetPageResponse.parse(serializePage(page)));
});

router.patch("/pages/:pageId", async (req, res): Promise<void> => {
  const params = UpdatePageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = parseInt(params.data.pageId, 10);
  const updates: Record<string, unknown> = {};
  if (parsed.data.automationEnabled != null) {
    updates.automationEnabled = parsed.data.automationEnabled;
    if (parsed.data.automationEnabled) updates.status = "active";
    else updates.status = "paused";
  }
  if (parsed.data.postingFrequency != null) updates.postingFrequency = parsed.data.postingFrequency;
  if (parsed.data.status != null) updates.status = parsed.data.status;

  const [page] = await db.update(facebookPagesTable).set(updates).where(eq(facebookPagesTable.id, id)).returning();
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  res.json(UpdatePageResponse.parse(serializePage(page)));
});

router.patch("/pages/:pageId/automation", async (req, res): Promise<void> => {
  const params = UpdatePageAutomationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePageAutomationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = parseInt(params.data.pageId, 10);
  const updates: Record<string, unknown> = {};
  if (parsed.data.postsPerDay != null) updates.postsPerDay = parsed.data.postsPerDay;
  if (parsed.data.scheduleLogic != null) updates.scheduleLogic = parsed.data.scheduleLogic;
  if (parsed.data.timezone != null) updates.timezone = parsed.data.timezone;
  if (parsed.data.timeSlots != null) updates.timeSlots = parsed.data.timeSlots;
  if (parsed.data.automationEnabled != null) {
    updates.automationEnabled = parsed.data.automationEnabled;
    updates.status = parsed.data.automationEnabled ? "active" : "paused";
  }

  const [page] = await db.update(facebookPagesTable).set(updates).where(eq(facebookPagesTable.id, id)).returning();
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  res.json(UpdatePageAutomationResponse.parse(serializePage(page)));
});

router.patch("/pages/:pageId/source", async (req, res): Promise<void> => {
  const params = UpdatePageSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePageSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = parseInt(params.data.pageId, 10);
  const [page] = await db.update(facebookPagesTable)
    .set({ sourceType: parsed.data.sourceType, sourceIdentity: parsed.data.sourceIdentity })
    .where(eq(facebookPagesTable.id, id))
    .returning();
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  res.json(UpdatePageSourceResponse.parse(serializePage(page)));
});

router.delete("/pages/:pageId", async (req, res): Promise<void> => {
  const params = DeletePageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = parseInt(params.data.pageId, 10);
  const [page] = await db.delete(facebookPagesTable).where(eq(facebookPagesTable.id, id)).returning();
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  const [account] = await db.select().from(facebookAccountsTable).where(eq(facebookAccountsTable.id, page.accountId));
  if (account) {
    await db.update(facebookAccountsTable).set({ pagesCount: Math.max(0, account.pagesCount - 1) }).where(eq(facebookAccountsTable.id, account.id));
  }
  res.sendStatus(204);
});

export default router;
