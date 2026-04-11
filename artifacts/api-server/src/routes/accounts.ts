import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, facebookAccountsTable, facebookPagesTable } from "@workspace/db";
import {
  CreateAccountBody,
  GetAccountParams,
  DeleteAccountParams,
  ListAccountsResponse,
  GetAccountResponse,
  GetAccountAvailablePagesParams,
  GetAccountAvailablePagesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeAccount(a: typeof facebookAccountsTable.$inferSelect) {
  return {
    id: String(a.id),
    fbUserId: a.fbUserId,
    name: a.name,
    email: a.email ?? undefined,
    profilePicture: a.profilePicture ?? undefined,
    pagesCount: a.pagesCount,
    status: a.status,
    connectedAt: a.connectedAt instanceof Date ? a.connectedAt.toISOString() : a.connectedAt,
  };
}

router.get("/accounts", async (req, res): Promise<void> => {
  req.log.info("Listing Facebook accounts");
  const accounts = await db.select().from(facebookAccountsTable).orderBy(facebookAccountsTable.connectedAt);
  res.json(ListAccountsResponse.parse(accounts.map(serializeAccount)));
});

router.post("/accounts", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await db.select().from(facebookAccountsTable).where(eq(facebookAccountsTable.fbUserId, parsed.data.fbUserId));
  if (existing.length > 0) {
    res.status(409).json({ error: "This Facebook account is already connected." });
    return;
  }
  const [account] = await db.insert(facebookAccountsTable).values({
    fbUserId: parsed.data.fbUserId,
    name: parsed.data.name,
    email: parsed.data.email ?? undefined,
    accessToken: parsed.data.accessToken,
    status: "connected",
    connectedAt: new Date(),
  }).returning();
  res.status(201).json(GetAccountResponse.parse(serializeAccount(account)));
});

router.get("/accounts/:accountId", async (req, res): Promise<void> => {
  const params = GetAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = parseInt(params.data.accountId, 10);
  const [account] = await db.select().from(facebookAccountsTable).where(eq(facebookAccountsTable.id, id));
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json(GetAccountResponse.parse(serializeAccount(account)));
});

router.get("/accounts/:accountId/available-pages", async (req, res): Promise<void> => {
  const params = GetAccountAvailablePagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const accountId = parseInt(params.data.accountId, 10);
  const pages = await db
    .select()
    .from(facebookPagesTable)
    .where(eq(facebookPagesTable.accountId, accountId))
    .orderBy(asc(facebookPagesTable.createdAt));

  const serialized = pages.map((p) => ({
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
  }));

  res.json(GetAccountAvailablePagesResponse.parse(serialized));
});

router.delete("/accounts/:accountId", async (req, res): Promise<void> => {
  const params = DeleteAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = parseInt(params.data.accountId, 10);
  const [deleted] = await db.delete(facebookAccountsTable).where(eq(facebookAccountsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
