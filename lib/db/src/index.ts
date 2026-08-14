import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export let pool: pg.Pool | null = null;
export let db: ReturnType<typeof drizzle<typeof schema>>;

if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
} else {
  console.warn("[Database] DATABASE_URL is not set. Database queries will return safe fallbacks.");
  db = new Proxy({} as any, {
    get(_target, prop) {
      if (prop === "query") {
        return new Proxy({}, {
          get: () => ({
            findMany: async () => [],
            findFirst: async () => null,
            findUnique: async () => null,
          }),
        });
      }
      return () => {
        const chain: any = {
          select: () => chain,
          from: () => chain,
          where: () => chain,
          limit: () => chain,
          offset: () => chain,
          orderBy: () => chain,
          leftJoin: () => chain,
          innerJoin: () => chain,
          set: () => chain,
          values: () => chain,
          returning: () => chain,
          onConflictDoNothing: () => chain,
          onConflictDoUpdate: () => chain,
          then: (resolve: any) => Promise.resolve([]).then(resolve),
          catch: (reject: any) => Promise.resolve([]).catch(reject),
        };
        return chain;
      };
    },
  });
}

export * from "./schema";
