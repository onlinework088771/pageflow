import { pgTable, text, serial, timestamp, boolean, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { youtubeChannelsTable } from "./youtube";

// Phase 5 — YouTube Automation.
// Independent counterpart to Facebook's `facebook_pages` automation columns /
// `page-automation.ts`: instead of pulling external content and posting it to a
// Facebook Page, this automatically pulls content from a YouTube or TikTok source
// and uploads it to one of the user's own connected YouTube channels (via the
// Phase 4 upload engine in `youtube-poster.ts`). No Facebook table, code, or
// interval is touched by this feature.
export const youtubeAutomationsTable = pgTable("youtube_automations", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id")
    .notNull()
    .references(() => youtubeChannelsTable.id, { onDelete: "cascade" }),

  automationEnabled: boolean("automation_enabled").notNull().default(false),
  status: text("status", { enum: ["active", "paused", "error"] }).notNull().default("paused"),

  // Content source: TikTok, Instagram, or Facebook profile (all via yt-dlp).
  sourceType: text("source_type", { enum: ["tiktok", "instagram", "facebook"] }),
  sourceIdentity: text("source_identity"),

  postsPerDay: integer("posts_per_day").notNull().default(1),
  scheduleLogic: text("schedule_logic", { enum: ["fixed", "random"] }).notNull().default("fixed"),
  timezone: text("timezone").notNull().default("UTC"),
  timeSlots: jsonb("time_slots").$type<string[]>().default([]),

  privacyStatus: text("privacy_status", { enum: ["public", "unlisted", "private"] }).notNull().default("public"),
  videoType: text("video_type", { enum: ["short", "long"] }).notNull().default("long"),

  totalPosted: integer("total_posted").notNull().default(0),
  totalPending: integer("total_pending").notNull().default(0),
  totalFailed: integer("total_failed").notNull().default(0),
  lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),
  lastPostedVideoId: text("last_posted_video_id"),

  // Queue-based sync fields (Facebook source only).
  // initialScanDone: whether the first full historical-reel scan has completed.
  // lastScanAt:      when the page was last checked for new reels.
  // totalDiscovered: denormalised count of reels ever found on the source page.
  initialScanDone: boolean("initial_scan_done").notNull().default(false),
  lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
  totalDiscovered: integer("total_discovered").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("uniq_channel_automation").on(t.channelId),
]);

export const insertYoutubeAutomationSchema = createInsertSchema(youtubeAutomationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertYoutubeAutomation = z.infer<typeof insertYoutubeAutomationSchema>;
export type YoutubeAutomation = typeof youtubeAutomationsTable.$inferSelect;
