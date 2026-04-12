import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const scheduledVideosTable = pgTable("scheduled_videos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  videoUrl: text("video_url"),
  videoPath: text("video_path"),
  thumbnailUrl: text("thumbnail_url"),
  pageIds: jsonb("page_ids").$type<string[]>().notNull().default([]),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  status: text("status", { enum: ["pending", "processing", "posted", "failed"] }).notNull().default("pending"),
  errorMessage: text("error_message"),
  postedCount: integer("posted_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ScheduledVideo = typeof scheduledVideosTable.$inferSelect;

export const ScheduledVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  videoUrl: z.string().optional(),
  videoPath: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  pageIds: z.array(z.string()),
  scheduledAt: z.string(),
  timezone: z.string(),
  status: z.enum(["pending", "processing", "posted", "failed"]),
  errorMessage: z.string().optional(),
  postedCount: z.number(),
  createdAt: z.string(),
});
