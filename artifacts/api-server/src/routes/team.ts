import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { db, usersTable, teamMembersTable, agencySettingsTable } from "@workspace/db";
import { requireAuth, requireRole, signToken } from "../middlewares/auth";
import { getSubscription, teamMemberLimit } from "../lib/plan-limits";
import { logger } from "../lib/logger";

// Phase 7 — Team members. Independent of Facebook/YouTube logic: this only
// manages who can log in and see an agency owner's shared data (resolved via
// resolveTeamScope in middlewares/auth.ts). No existing table or route is modified.

function serializeMember(m: typeof teamMembersTable.$inferSelect) {
  return {
    id: String(m.id),
    email: m.email,
    role: m.role,
    status: m.status,
    invitedAt: m.invitedAt instanceof Date ? m.invitedAt.toISOString() : m.invitedAt,
    acceptedAt: m.acceptedAt instanceof Date ? m.acceptedAt.toISOString() : (m.acceptedAt ?? undefined),
  };
}

// ---------------------------------------------------------------------------
// Public router — invite acceptance only (no JWT yet, the invite token IS the credential)
// ---------------------------------------------------------------------------
export const teamPublicRouter: IRouter = Router();

teamPublicRouter.get("/team/invite/:token", async (req, res): Promise<void> => {
  const [invite] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.inviteToken, req.params.token));
  if (!invite || invite.status !== "invited") {
    res.status(404).json({ error: "This invite link is invalid or has already been used." });
    return;
  }
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, invite.ownerId));
  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, invite.email.toLowerCase()));
  res.json({
    email: invite.email,
    role: invite.role,
    agencyName: owner?.agencyName ?? "the agency",
    needsPassword: !existingUser,
  });
});

// POST /team/invite/:token/accept — creates (or reuses) the invitee's login and activates membership
teamPublicRouter.post("/team/invite/:token/accept", async (req, res): Promise<void> => {
  const { name, password } = req.body ?? {};
  const [invite] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.inviteToken, req.params.token));
  if (!invite || invite.status !== "invited") {
    res.status(404).json({ error: "This invite link is invalid or has already been used." });
    return;
  }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, invite.email.toLowerCase()));

  if (!user) {
    if (!password || typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "A password of at least 8 characters is required to create your account." });
      return;
    }
    const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, invite.ownerId));
    const passwordHash = await bcrypt.hash(password, 12);
    [user] = await db.insert(usersTable).values({
      email: invite.email.toLowerCase(),
      passwordHash,
      name: name || invite.email.split("@")[0],
      agencyName: owner?.agencyName ?? "My Agency",
      role: "member",
    }).returning();
  }

  await db.update(teamMembersTable)
    .set({ status: "active", userId: user.id, acceptedAt: new Date() })
    .where(eq(teamMembersTable.id, invite.id));

  const token = signToken({ userId: user.id, email: user.email, name: user.name, agencyName: user.agencyName, role: user.role });
  logger.info({ email: user.email, ownerId: invite.ownerId }, "Team invite accepted");
  res.json({ token, user: { id: String(user.id), email: user.email, name: user.name } });
});

// ---------------------------------------------------------------------------
// Protected router — invite/list/manage team members (mounted after requireAuth + resolveTeamScope)
// ---------------------------------------------------------------------------
export const teamRouter: IRouter = Router();

teamRouter.get("/team", async (req, res): Promise<void> => {
  const ownerId = req.user!.userId;
  const members = await db.select().from(teamMembersTable).where(eq(teamMembersTable.ownerId, ownerId));
  res.json({ role: req.teamRole ?? "owner", members: members.map(serializeMember) });
});

teamRouter.post("/team/invite", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const ownerId = req.user!.userId;
  const { email, role } = req.body ?? {};
  if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  const memberRole = role === "admin" ? "admin" : "member";

  const sub = await getSubscription(ownerId);
  const limit = teamMemberLimit(sub.plan);
  const existingMembers = await db.select().from(teamMembersTable).where(eq(teamMembersTable.ownerId, ownerId));
  if (existingMembers.length >= limit) {
    res.status(403).json({
      error: limit === 0
        ? `Your current plan (${sub.plan}) doesn't include team members. Upgrade to invite people.`
        : `Your plan allows up to ${limit} team members. Upgrade to invite more.`,
    });
    return;
  }
  if (existingMembers.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
    res.status(409).json({ error: "This person has already been invited." });
    return;
  }

  const inviteToken = randomBytes(24).toString("hex");
  const [invite] = await db.insert(teamMembersTable).values({
    ownerId, email: email.toLowerCase(), role: memberRole, status: "invited", inviteToken,
  }).returning();

  logger.info({ ownerId, email }, "Team member invited");
  // No email service is configured yet — return the link so the owner can share it manually.
  const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
  res.status(201).json({ ...serializeMember(invite), inviteLink: `${frontendBase}/accept-invite/${inviteToken}` });
});

teamRouter.patch("/team/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const ownerId = req.user!.userId;
  const id = parseInt(req.params.id, 10);
  const { role } = req.body ?? {};
  if (role !== "admin" && role !== "member") {
    res.status(400).json({ error: "role must be 'admin' or 'member'" });
    return;
  }
  const [updated] = await db.update(teamMembersTable)
    .set({ role })
    .where(and(eq(teamMembersTable.id, id), eq(teamMembersTable.ownerId, ownerId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }
  res.json(serializeMember(updated));
});

teamRouter.delete("/team/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const ownerId = req.user!.userId;
  const id = parseInt(req.params.id, 10);
  const [deleted] = await db.delete(teamMembersTable)
    .where(and(eq(teamMembersTable.id, id), eq(teamMembersTable.ownerId, ownerId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }
  res.sendStatus(204);
});

export default teamRouter;
