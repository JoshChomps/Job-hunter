import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Use the Neon *pooled* connection string.",
  );
}

/**
 * Cached across hot reloads in dev, otherwise every edit opens a new pool and
 * Neon starts refusing connections.
 */
const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.client ??
  postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    prepare: false, // Neon's pooler runs in transaction mode.
  });

if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
export { schema };
