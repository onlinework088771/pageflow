import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agencySettingsTable = pgTable("agency_settings", {
  id: serial("id").primaryKey(),
  agencyName: text("agency_name").notNull().default("My Agency"),
  appId: text("app_id"),
  appSecret: text("app_secret"),
  privacyPolicyUrl: text("privacy_policy_url"),
  appConfigured: boolean("app_configured").notNull().default(false),
  appLive: boolean("app_live").notNull().default(false),
  setupStep: integer("setup_step").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgencySettingsSchema = createInsertSchema(agencySettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgencySettings = z.infer<typeof insertAgencySettingsSchema>;
export type AgencySettings = typeof agencySettingsTable.$inferSelect;
