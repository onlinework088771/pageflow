import { eq } from "drizzle-orm";
import { db, subscriptionsTable, type Subscription } from "@workspace/db";

// Phase 7 — Billing plan definitions. Kept in one place so pricing/limits
// changes never require touching the gating logic itself.
export type Plan = "free" | "facebook" | "youtube" | "agency";

export const PLAN_DETAILS: Record<Plan, {
  label: string;
  priceMonthly: number;
  facebook: boolean;
  youtube: boolean;
  teamMembers: number;
  apiKeys: boolean;
}> = {
  free: { label: "Free", priceMonthly: 0, facebook: false, youtube: false, teamMembers: 0, apiKeys: false },
  facebook: { label: "Facebook", priceMonthly: 15, facebook: true, youtube: false, teamMembers: 3, apiKeys: false },
  youtube: { label: "YouTube", priceMonthly: 15, facebook: false, youtube: true, teamMembers: 3, apiKeys: false },
  agency: { label: "Agency", priceMonthly: 25, facebook: true, youtube: true, teamMembers: 10, apiKeys: true },
};

/** Every existing user (as of Phase 7 rollout) was grandfathered onto "agency" so nothing they already had breaks. */
const DEFAULT_PLAN: Plan = "free";

export async function getSubscription(ownerId: number): Promise<Subscription & { plan: Plan }> {
  const [row] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, ownerId));
  if (row) return row as Subscription & { plan: Plan };
  return {
    id: 0,
    userId: ownerId,
    plan: DEFAULT_PLAN,
    status: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function planAllows(plan: Plan, feature: "facebook" | "youtube" | "apiKeys"): boolean {
  return PLAN_DETAILS[plan][feature];
}

export function teamMemberLimit(plan: Plan): number {
  return PLAN_DETAILS[plan].teamMembers;
}
