import { Router, type IRouter } from "express";
import { randomBytes, createHash } from "crypto";
import { eq, and } from "drizzle-orm";
import { db, apiKeysTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { getSubscription, planAllows } from "../lib/plan-limits";
import { logger } from "../lib/logger";

// Phase 7 — API key management (creation/listing/revocation). The keys
// themselves are verified by ../middlewares/api-key-auth.ts, used only by
// routes/public-api.ts. Nothing here touches Facebook or YouTube logic.

const router: IRouter = Router();

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function serialize(k: typeof apiKeysTable.$inferSelect) {
  return {
    id: String(k.id),
    name: k.name,
    keyPrefix: k.keyPrefix,
    lastUsedAt: k.lastUsedAt instanceof Date ? k.lastUsedAt.toISOString() : (k.lastUsedAt ?? undefined),
    revoked: !!k.revokedAt,
    createdAt: k.createdAt instanceof Date ? k.createdAt.toISOString() : k.createdAt,
  };
}

router.get("/api-keys", async (req, res): Promise<void> => {
  const ownerId = req.user!.userId;
  const keys = await db.select().from(apiKeysTable).where(eq(apiKeysTable.userId, ownerId));
  res.json(keys.map(serialize));
});

router.post("/api-keys", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const ownerId = req.user!.userId;
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "A name for the key is required" });
    return;
  }

  const sub = await getSubscription(ownerId);
  if (!planAllows(sub.plan, "apiKeys")) {
    res.status(403).json({ error: "API key access requires the Agency plan. Upgrade to generate keys." });
    return;
  }

  const secret = randomBytes(24).toString("hex");
  const keyPrefix = `pf_${secret.slice(0, 8)}`;
  const fullKey = `${keyPrefix}_${secret}`;
  const keyHash = hashKey(fullKey);

  const [row] = await db.insert(apiKeysTable).values({ userId: ownerId, name, keyPrefix, keyHash }).returning();
  logger.info({ ownerId, keyPrefix }, "API key created");
  // The full key is only ever shown once, at creation time.
  res.status(201).json({ ...serialize(row), key: fullKey });
});

router.delete("/api-keys/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const ownerId = req.user!.userId;
  const id = parseInt(req.params.id, 10);
  const [updated] = await db.update(apiKeysTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.userId, ownerId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "API key not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
