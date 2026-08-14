import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tokenBalanceTable, tokenTransactionsTable } from "@workspace/db";
import { AddTokensBody, ListTokensResponse, AddTokensResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const TOKEN_PACKAGES = [
  { id: "starter", name: "Starter Pack", tokens: 100, price: 9.99 },
  { id: "growth", name: "Growth Pack", tokens: 500, price: 39.99 },
  { id: "pro", name: "Pro Pack", tokens: 1500, price: 99.99 },
  { id: "agency", name: "Agency Pack", tokens: 5000, price: 299.99 },
];

async function ensureBalance(userId: number): Promise<{ id: number; balance: number; updatedAt: Date }> {
  const rows = await db.select().from(tokenBalanceTable).where(eq(tokenBalanceTable.userId, userId)).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(tokenBalanceTable).values({ userId, balance: 0 }).returning();
  return created;
}

router.get("/tokens", async (req, res): Promise<void> => {
  req.log.info("Getting token info");
  const userId = req.user!.userId;
  const balance = await ensureBalance(userId);
  const transactions = await db
    .select()
    .from(tokenTransactionsTable)
    .where(eq(tokenTransactionsTable.userId, userId))
    .orderBy(tokenTransactionsTable.timestamp)
    .limit(20);

  res.json(ListTokensResponse.parse({
    balance: balance.balance,
    packages: TOKEN_PACKAGES,
    transactions: transactions.map(t => ({
      ...t,
      id: String(t.id),
      timestamp: t.timestamp.toISOString(),
    })),
  }));
});

router.post("/tokens", async (req, res): Promise<void> => {
  const parsed = AddTokensBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const amount = parsed.data.amount;
  if (amount <= 0) {
    res.status(400).json({ error: "Amount must be positive" });
    return;
  }

  const userId = req.user!.userId;
  const balance = await ensureBalance(userId);
  const newBalance = balance.balance + amount;

  await db
    .update(tokenBalanceTable)
    .set({ balance: newBalance })
    .where(and(eq(tokenBalanceTable.id, balance.id), eq(tokenBalanceTable.userId, userId)));

  const packageName = parsed.data.packageId
    ? TOKEN_PACKAGES.find(p => p.id === parsed.data.packageId)?.name ?? "Custom"
    : "Custom";

  await db.insert(tokenTransactionsTable).values({
    userId,
    type: "purchase",
    amount,
    description: `Purchased ${amount} tokens (${packageName})`,
    timestamp: new Date(),
  });

  const transactions = await db
    .select()
    .from(tokenTransactionsTable)
    .where(eq(tokenTransactionsTable.userId, userId))
    .orderBy(tokenTransactionsTable.timestamp)
    .limit(20);

  res.json(AddTokensResponse.parse({
    balance: newBalance,
    packages: TOKEN_PACKAGES,
    transactions: transactions.map(t => ({
      ...t,
      id: String(t.id),
      timestamp: t.timestamp.toISOString(),
    })),
  }));
});

export default router;
