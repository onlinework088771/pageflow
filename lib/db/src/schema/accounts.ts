import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const facebookAccountsTable = pgTable("facebook_accounts", {
  id: serial("id").primaryKey(),
  fbUserId: text("fb_user_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  profilePicture: text("profile_picture"),
  accessToken: text("access_token").notNull(),
  pagesCount: integer("pages_count").notNull().default(0),
  status: text("status", { enum: ["connected", "expired", "error"] }).notNull().default("connected"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFacebookAccountSchema = createInsertSchema(facebookAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFacebookAccount = z.infer<typeof insertFacebookAccountSchema>;
export type FacebookAccount = typeof facebookAccountsTable.$inferSelect;
