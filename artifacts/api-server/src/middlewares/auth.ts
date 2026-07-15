import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq, and } from "drizzle-orm";
import { db, teamMembersTable } from "@workspace/db";

export interface AuthPayload {
  userId: number;
  email: string;
  name: string;
  agencyName: string;
  role: string;
}

/** Team role within the current request's data scope. "owner" is the paying account itself. */
export type TeamRole = "owner" | "admin" | "member";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      /** The actual logged-in user's id — never mutated by team-scope resolution. */
      actorUserId?: number;
      /** "owner" | "admin" | "member" for the resolved data scope (see resolveTeamScope). */
      teamRole?: TeamRole;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET environment variable is required");
  return secret;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

/**
 * Phase 7 — Team members. Must run after requireAuth.
 *
 * If the logged-in user is an active team member of another account, this
 * rewrites `req.user.userId` to the agency owner's id so every existing route
 * (which already scopes its queries by `req.user.userId`) transparently
 * returns the shared team data — no route files need to change.
 *
 * `req.actorUserId` always holds the real logged-in user's id, and
 * `req.teamRole` records the permission level ("owner" | "admin" | "member")
 * for routes that need to restrict sensitive actions (billing, team
 * management, agency settings, deleting accounts).
 */
export async function resolveTeamScope(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) { next(); return; }
  req.actorUserId = req.user.userId;

  const [membership] = await db
    .select()
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.userId, req.user.userId), eq(teamMembersTable.status, "active")));

  if (membership) {
    req.user = { ...req.user, userId: membership.ownerId };
    req.teamRole = membership.role === "admin" ? "admin" : "member";
  } else {
    req.teamRole = "owner";
  }
  next();
}

/** Restricts a route to the given team roles. Use after requireAuth + resolveTeamScope. */
export function requireRole(...allowed: TeamRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.teamRole ?? "owner";
    if (!allowed.includes(role)) {
      res.status(403).json({ error: "You don't have permission to perform this action." });
      return;
    }
    next();
  };
}
