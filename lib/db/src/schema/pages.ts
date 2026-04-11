import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { facebookAccountsTable } from "./accounts";

export const facebookPagesTable = pgTable("facebook_pages", {
  id: serial("id").primaryKey(),
  fbPageId: text("fb_page_id").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  profilePicture: text("profile_picture"),
  followersCount: integer("followers_count").notNull().default(0),
  automationEnabled: boolean("automation_enabled").notNull().default(false),
  postingFrequency: text("posting_frequency", { enum: ["daily", "twice_daily", "weekly", "custom"] }).notNull().default("daily"),
  status: text("status", { enum: ["active", "paused", "error"] }).notNull().default("paused"),
  accountId: integer("account_id").notNull().references(() => facebookAccountsTable.id, { onDelete: "cascade" }),
  lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),

  sourceType: text("source_type", { enum: ["instagram", "youtube", "tiktok"] }),
  sourceIdentity: text("source_identity"),
  postsPerDay: integer("posts_per_day").notNull().default(3),
  scheduleLogic: text("schedule_logic", { enum: ["fixed", "random"] }).notNull().default("fixed"),
  timezone: text("timezone").notNull().default("UTC"),
  timeSlots: jsonb("time_slots").$type<string[]>().default([]),
  scrapingStatus: text("scraping_status", { enum: ["pending", "active", "done"] }).notNull().default("pending"),
  totalPosted: integer("total_posted").notNull().default(0),
  totalPending: integer("total_pending").notNull().default(0),
  totalFailed: integer("total_failed").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFacebookPageSchema = createInsertSchema(facebookPagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFacebookPage = z.infer<typeof insertFacebookPageSchema>;
export type FacebookPage = typeof facebookPagesTable.$inferSelect;
