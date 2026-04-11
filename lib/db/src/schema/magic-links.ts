import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const magicLinksTable = pgTable("magic_links", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMagicLinkSchema = createInsertSchema(magicLinksTable).omit({ id: true, createdAt: true });
export type InsertMagicLink = z.infer<typeof insertMagicLinkSchema>;
export type MagicLink = typeof magicLinksTable.$inferSelect;
