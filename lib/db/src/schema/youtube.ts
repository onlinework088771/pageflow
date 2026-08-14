import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ---------------------------------------------------------------------------
// youtube_accounts — one row per connected Google account
// ---------------------------------------------------------------------------

export const youtubeAccountsTable = pgTable(
  "youtube_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    googleId: text("google_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    profilePicture: text("profile_picture"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
    status: text("status", { enum: ["connected", "expired", "error"] })
      .notNull()
      .default("connected"),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("uniq_user_google_account").on(t.userId, t.googleId)],
);

export type YouTubeAccount = typeof youtubeAccountsTable.$inferSelect;

// ---------------------------------------------------------------------------
// youtube_channels — one row per managed YouTube channel
// Mirrors the facebook_pages table structure for consistency.
// ---------------------------------------------------------------------------

export const youtubeChannelsTable = pgTable("youtube_channels", {
  id: serial("id").primaryKey(),

  // FK → youtube_accounts (cascades on account deletion)
  accountId: integer("account_id")
    .notNull()
    .references(() => youtubeAccountsTable.id, { onDelete: "cascade" }),

  // The actual YouTube channel ID (UC-prefixed, 24 chars)
  channelId: text("channel_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  subscriberCount: integer("subscriber_count").notNull().default(0),

  // Automation toggle (master switch)
  automationEnabled: boolean("automation_enabled").notNull().default(false),

  // Content source (where we pull videos FROM to upload to this YT channel)
  sourceType: text("source_type", { enum: ["instagram", "tiktok", "youtube", "facebook"] }),
  sourceIdentity: text("source_identity"), // @handle or channelId

  // Schedule settings
  postsPerDay: integer("posts_per_day").notNull().default(1),
  scheduleLogic: text("schedule_logic", { enum: ["fixed", "random"] })
    .notNull()
    .default("fixed"),
  timezone: text("timezone").notNull().default("UTC"),
  timeSlots: jsonb("time_slots").$type<string[]>().default([]),

  // Operational state
  status: text("status", { enum: ["active", "paused", "error"] })
    .notNull()
    .default("paused"),
  lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),
  lastPostedVideoId: text("last_posted_video_id"), // dedup cursor

  // Stats counters
  totalPosted: integer("total_posted").notNull().default(0),
  totalFailed: integer("total_failed").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type YouTubeChannel = typeof youtubeChannelsTable.$inferSelect;
