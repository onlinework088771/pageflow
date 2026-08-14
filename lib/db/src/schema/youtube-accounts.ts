import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A connected Google account (holds the OAuth tokens used to call the YouTube Data API).
export const youtubeAccountsTable = pgTable("youtube_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  googleUserId: text("google_user_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  profilePicture: text("profile_picture"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  status: text("status", { enum: ["connected", "expired", "error"] }).notNull().default("connected"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("uniq_user_google_account").on(t.userId, t.googleUserId),
]);

// A YouTube channel belonging to a connected Google account (fetched via channels.list mine=true).
export const youtubeChannelsTable = pgTable("youtube_channels", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => youtubeAccountsTable.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  customUrl: text("custom_url"),
  subscriberCount: integer("subscriber_count").notNull().default(0),
  videoCount: integer("video_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("uniq_account_channel").on(t.accountId, t.channelId),
]);

export const insertYoutubeAccountSchema = createInsertSchema(youtubeAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertYoutubeAccount = z.infer<typeof insertYoutubeAccountSchema>;
export type YoutubeAccount = typeof youtubeAccountsTable.$inferSelect;

export const insertYoutubeChannelSchema = createInsertSchema(youtubeChannelsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertYoutubeChannel = z.infer<typeof insertYoutubeChannelSchema>;
export type YoutubeChannel = typeof youtubeChannelsTable.$inferSelect;
