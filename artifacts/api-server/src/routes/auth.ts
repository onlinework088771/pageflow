import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, agencySettingsTable } from "@workspace/db";
import { SignupBody, LoginBody, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import { requireAuth, signToken } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function serializeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: String(u.id),
    email: u.email,
    name: u.name,
    agencyName: u.agencyName,
    role: u.role,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
  };
}

// POST /auth/signup
router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, agencyName, name } = parsed.data;

  // Check if email already exists
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    passwordHash,
    name,
    agencyName,
    role: "admin",
  }).returning();

  // Create default agency settings for this user
  await db.insert(agencySettingsTable).values({ agencyName }).onConflictDoNothing();

  const token = signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    agencyName: user.agencyName,
    role: user.role,
  });

  logger.info({ email: user.email }, "New user registered");
  res.status(201).json(LoginResponse.parse({ token, user: serializeUser(user) }));
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

  if (!user) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    agencyName: user.agencyName,
    role: user.role,
  });

  logger.info({ email: user.email }, "User logged in");
  res.json(LoginResponse.parse({ token, user: serializeUser(user) }));
});

// GET /auth/me
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetMeResponse.parse(serializeUser(user)));
});

export default router;
