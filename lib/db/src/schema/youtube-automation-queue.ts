import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { youtubeAutomationsTable } from "./youtube-automations";

// Per-video queue for the YouTube ← Facebook automation.
// Each row represents one discovered Facebook reel / video.
// The UNIQUE constraint on (automation_id, fb_video_id) is the dedup guard —
// inserting an already-known video silently no-ops (ON CONFLICT DO NOTHING).
export const youtubeAutomationQueueTable = pgTable("youtube_automation_queue", {
  id: serial("id").primaryKey(),
  automationId: integer("automation_id")
    .notNull()
    .references(() => youtubeAutomationsTable.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull(),
  fbVideoId: text("fb_video_id").notNull(),
  title: text("title"),
  url: text("url").notNull(),
  // pending → uploaded | failed
  status: text("status", { enum: ["pending", "uploaded", "failed"] })
    .notNull()
    .default("pending"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  youtubeVideoId: text("youtube_video_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("uniq_automation_fb_video").on(t.automationId, t.fbVideoId),
]);

export type YoutubeAutomationQueueItem = typeof youtubeAutomationQueueTable.$inferSelect;
