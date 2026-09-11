import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    // Cap pool size per server instance. Left unbounded, node-postgres
    // defaults to 10 — fine for a single long-running server, but on
    // serverless/edge-style hosts where many short-lived instances can
    // spin up concurrently, an unbounded or overly large pool per
    // instance can exhaust your Postgres connection limit. 10 is a safe
    // default for most managed Postgres tiers; raise it if your database
    // plan allows more and you're running a small, fixed number of
    // long-lived server instances (e.g. a single container/VM).
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
