import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, subscriptionsTable, facebookAccountsTable, facebookPagesTable, youtubeAccountsTable, teamMembersTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { getSubscription, PLAN_DETAILS, type Plan } from "../lib/plan-limits";
import { logger } from "../lib/logger";

// Phase 7 — Billing. No payment processor is connected yet (Stripe was
// offered and declined), so this manages plan *assignment* only: an owner can
// switch their own plan and the rest of the app (accounts.ts, youtube-accounts.ts,
// team.ts, api-keys.ts) gates features off `getSubscription()`. Wiring up real
// card charges later only requires filling in a checkout call here — nothing
// else needs to change.

export const billingPublicRouter: IRouter = Router();
// Reserved for a future payment-provider webhook (e.g. Stripe). No route yet.

export const billingRouter: IRouter = Router();

function serialize(plan: Plan, sub: Awaited<ReturnType<typeof getSubscription>>) {
  return {
    plan,
    status: sub.status,
    priceMonthly: PLAN_DETAILS[plan].priceMonthly,
    limits: {
      facebook: PLAN_DETAILS[plan].facebook,
      youtube: PLAN_DETAILS[plan].youtube,
      teamMembers: PLAN_DETAILS[plan].teamMembers,
      apiKeys: PLAN_DETAILS[plan].apiKeys,
    },
    currentPeriodEnd: sub.currentPeriodEnd instanceof Date ? sub.currentPeriodEnd.toISOString() : (sub.currentPeriodEnd ?? undefined),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

billingRouter.get("/billing", async (req, res): Promise<void> => {
  const ownerId = req.user!.userId;
  const sub = await getSubscription(ownerId);

  const [fbAccounts, ytAccounts, team] = await Promise.all([
    db.select({ id: facebookAccountsTable.id }).from(facebookAccountsTable).where(eq(facebookAccountsTable.userId, ownerId)),
    db.select({ id: youtubeAccountsTable.id }).from(youtubeAccountsTable).where(eq(youtubeAccountsTable.userId, ownerId)),
    db.select({ id: teamMembersTable.id }).from(teamMembersTable).where(eq(teamMembersTable.ownerId, ownerId)),
  ]);
  const pages = fbAccounts.length
    ? await db.select({ id: facebookPagesTable.id }).from(facebookPagesTable).where(inArray(facebookPagesTable.accountId, fbAccounts.map((a) => a.id)))
    : [];

  res.json({
    ...serialize(sub.plan, sub),
    usage: {
      facebookAccounts: fbAccounts.length,
      facebookPages: pages.length,
      youtubeAccounts: ytAccounts.length,
      teamMembers: team.length,
    },
    availablePlans: (Object.keys(PLAN_DETAILS) as Plan[]).map((p) => ({ plan: p, ...PLAN_DETAILS[p] })),
    paymentsConnected: false,
  });
});

// POST /billing/change-plan — owner-only (team admins cannot change billing).
// Since no payment processor is connected, this switches the plan immediately.
// If real card charges are added later, this becomes "create checkout session" instead.
billingRouter.post("/billing/change-plan", requireRole("owner"), async (req, res): Promise<void> => {
  const ownerId = req.user!.userId;
  const { plan } = req.body ?? {};
  if (!plan || !(plan in PLAN_DETAILS)) {
    res.status(400).json({ error: `plan must be one of: ${Object.keys(PLAN_DETAILS).join(", ")}` });
    return;
  }

  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, ownerId));
  let sub;
  if (existing) {
    [sub] = await db.update(subscriptionsTable).set({ plan, status: "active" }).where(eq(subscriptionsTable.userId, ownerId)).returning();
  } else {
    [sub] = await db.insert(subscriptionsTable).values({ userId: ownerId, plan, status: "active" }).returning();
  }

  logger.info({ ownerId, plan }, "Plan changed");
  res.json(serialize(plan as Plan, sub));
});

export default billingRouter;
