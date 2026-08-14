import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, automationLogsTable, facebookAccountsTable, facebookPagesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { ListAutomationLogsQueryParams, ListAutomationLogsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function serializeLog(log: typeof automationLogsTable.$inferSelect) {
  return {
    id: String(log.id),
    type: log.type,
    message: log.message,
    pageId: log.pageId != null ? String(log.pageId) : undefined,
    pageName: log.pageName ?? undefined,
    accountId: log.accountId != null ? String(log.accountId) : undefined,
    status: log.status,
    metadata: log.metadata ?? undefined,
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
  };
}

router.get("/automation-logs", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListAutomationLogsQueryParams.safeParse(req.query);
  const pageId = parsed.success ? parsed.data.pageId : undefined;
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;

  const userId = req.user!.userId;

  // Resolve page IDs that belong to this user
  const userAccounts = await db
    .select({ id: facebookAccountsTable.id })
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.userId, userId));

  const accountIds = userAccounts.map((a) => a.id);

  if (accountIds.length === 0) {
    res.json(ListAutomationLogsResponse.parse([]));
    return;
  }

  const userPages = await db
    .select({ id: facebookPagesTable.id })
    .from(facebookPagesTable)
    .where(inArray(facebookPagesTable.accountId, accountIds));

  const pageIds = userPages.map((p) => p.id);

  if (pageIds.length === 0) {
    res.json(ListAutomationLogsResponse.parse([]));
    return;
  }

  // If a specific pageId filter is requested, verify it belongs to this user
  if (pageId !== undefined) {
    const numericPageId = parseInt(pageId, 10);
    if (!pageIds.includes(numericPageId)) {
      res.json(ListAutomationLogsResponse.parse([]));
      return;
    }
    const logs = await db
      .select()
      .from(automationLogsTable)
      .where(eq(automationLogsTable.pageId, numericPageId))
      .orderBy(desc(automationLogsTable.createdAt))
      .limit(limit);
    res.json(ListAutomationLogsResponse.parse(logs.map(serializeLog)));
    return;
  }

  const logs = await db
    .select()
    .from(automationLogsTable)
    .where(inArray(automationLogsTable.pageId, pageIds))
    .orderBy(desc(automationLogsTable.createdAt))
    .limit(limit);

  res.json(ListAutomationLogsResponse.parse(logs.map(serializeLog)));
});

export default router;
