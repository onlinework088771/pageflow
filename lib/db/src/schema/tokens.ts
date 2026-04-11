import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokenBalanceTable = pgTable("token_balance", {
  id: serial("id").primaryKey(),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tokenTransactionsTable = pgTable("token_transactions", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: ["purchase", "usage", "refund"] }).notNull(),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTokenTransactionSchema = createInsertSchema(tokenTransactionsTable).omit({ id: true });
export type InsertTokenTransaction = z.infer<typeof insertTokenTransactionSchema>;
export type TokenTransaction = typeof tokenTransactionsTable.$inferSelect;
export type TokenBalance = typeof tokenBalanceTable.$inferSelect;
