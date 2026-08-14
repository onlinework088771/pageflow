import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { eq, isNull, and } from "drizzle-orm";
import { db, apiKeysTable } from "@workspace/db";

// Phase 7 — authenticates requests to routes/public-api.ts via `X-API-Key`
// instead of the JWT used everywhere else. Deliberately separate from
// middlewares/auth.ts so the two auth paths can never be confused.

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.header("X-API-Key");
  if (!key) {
    res.status(401).json({ error: "Missing X-API-Key header" });
    return;
  }

  const [row] = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.keyHash, hashKey(key)), isNull(apiKeysTable.revokedAt)));

  if (!row) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return;
  }

  db.update(apiKeysTable).set({ lastUsedAt: new Date() }).where(eq(apiKeysTable.id, row.id)).catch(() => {});

  // API keys always resolve to the agency owner's own data — never a team member's scope.
  req.user = { userId: row.userId, email: "", name: "", agencyName: "", role: "admin" };
  req.actorUserId = row.userId;
  req.teamRole = "owner";
  next();
}
