import { Router, type IRouter } from "express";
import { eq, count } from "drizzle-orm";
import { db, facebookPagesTable, facebookAccountsTable, tokenBalanceTable, tokenTransactionsTable } from "@workspace/db";
import { GetOverviewStatsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/overview/stats", async (req, res): Promise<void> => {
  req.log.info("Getting overview stats");

  // Count active pages
  const allPages = await db.select().from(facebookPagesTable);
  const activePagesCount = allPages.filter(p => p.status === "active").length;
  const totalPagesCount = allPages.length;
  const automationActiveCount = allPages.filter(p => p.automationEnabled).length;

  // Account health — if any accounts connected, it's active
  const accounts = await db.select().from(facebookAccountsTable);
  const hasExpired = accounts.some(a => a.status === "expired" || a.status === "error");
  const accountHealth = accounts.length === 0 ? "inactive" : hasExpired ? "warning" : "active";

  // Token balance
  const balanceRows = await db.select().from(tokenBalanceTable).limit(1);
  const tokenBalance = balanceRows.length > 0 ? balanceRows[0].balance : 0;

  // Recent activity — last 10 token transactions + page status changes simulated
  const transactions = await db.select().from(tokenTransactionsTable).orderBy(tokenTransactionsTable.timestamp).limit(5);
  const recentActivity = transactions.map(t => ({
    id: String(t.id),
    type: t.type,
    message: t.description,
    timestamp: t.timestamp.toISOString(),
    pageName: undefined as string | undefined,
  }));

  // Also add recent pages
  const recentPages = allPages.slice(-3);
  for (const page of recentPages) {
    recentActivity.push({
      id: `page-${page.id}`,
      type: "page_added",
      message: `Page "${page.name}" was added`,
      timestamp: page.createdAt.toISOString(),
      pageName: page.name,
    });
  }

  // Sort by timestamp descending and take 10
  recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const activity = recentActivity.slice(0, 10);

  res.json(GetOverviewStatsResponse.parse({
    activePagesCount,
    totalPagesCount,
    automationActiveCount,
    accountHealth,
    tokenBalance,
    systemStatus: "online",
    recentActivity: activity,
  }));
});

export default router;
