import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, automationLogsTable } from "@workspace/db";
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

  let query = db.select().from(automationLogsTable).orderBy(desc(automationLogsTable.createdAt)).limit(limit);

  const logs = await query;
  const filtered = pageId
    ? logs.filter((l) => l.pageId != null && String(l.pageId) === pageId)
    : logs;

  res.json(ListAutomationLogsResponse.parse(filtered.map(serializeLog)));
});

export default router;
