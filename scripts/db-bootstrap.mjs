#!/usr/bin/env node
/**
 * Bring an empty database to the current schema, non-interactively.
 *
 * `drizzle-kit push` is interactive (it prompts about renames), which makes it
 * useless in CI and awkward in scripts. This does the same job in two boring,
 * reproducible steps:
 *
 *   1. `drizzle-kit generate` against a throwaway out-dir — produces the full
 *      base-schema SQL from src/db/schema.ts without touching the database.
 *   2. Apply that SQL, then run scripts/migrate.mjs for the hand-written
 *      migrations (triggers, backfills, constraints the ORM can't express).
 *
 * Everything is IF NOT EXISTS-safe, so running this against an already
 * bootstrapped database is a no-op plus the normal migration run.
 *
 * Usage:  DATABASE_URL=postgres://… node scripts/db-bootstrap.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(path.join(tmpdir(), "drizzle-gen-"));
const configPath = path.join(root, ".drizzle-bootstrap.config.ts");

try {
  // 1. Generate base-schema SQL (no DB connection needed).
  writeFileSync(
    configPath,
    `import { defineConfig } from "drizzle-kit";
export default defineConfig({ schema: "./src/db/schema.ts", out: ${JSON.stringify(outDir)}, dialect: "postgresql" });
`
  );
  const gen = spawnSync("npx", ["drizzle-kit", "generate", "--config", configPath], {
    cwd: root,
    stdio: "inherit",
  });
  if (gen.status !== 0) process.exit(gen.status ?? 1);

  // 2. Apply it. CREATE TABLE statements from a fresh generate collide on an
  //    existing database, so each statement is tolerated individually — the
  //    hand-written migrations that follow are the source of truth for drift.
  const sqlFiles = readdirSync(outDir).filter((f) => f.endsWith(".sql")).sort();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  for (const f of sqlFiles) {
    const sql = readFileSync(path.join(outDir, f), "utf8");
    const statements = sql.split("--> statement-breakpoint");
    for (const st of statements) {
      const s = st.trim();
      if (!s) continue;
      try {
        await client.query(s);
      } catch (e) {
        if (e.code === "42P07" || e.code === "42710" || e.code === "42701") continue; // already exists
        console.error(`\nbase schema statement failed:\n${s.slice(0, 200)}\n`);
        throw e;
      }
    }
    console.log(`base schema: ${f} applied`);
  }
  await client.end();

  // 3. Hand-written migrations (recorded exactly once in schema_migrations).
  // Note: exit AFTER the finally block — process.exit() skips finally, which
  // would leave the throwaway drizzle config behind in the repo.
  const mig = spawnSync(process.execPath, [path.join(root, "scripts", "migrate.mjs")], {
    stdio: "inherit",
    env: process.env,
  });
  process.exitCode = mig.status ?? 1;
} finally {
  rmSync(outDir, { recursive: true, force: true });
  rmSync(configPath, { force: true });
}
