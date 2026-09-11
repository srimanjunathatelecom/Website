#!/usr/bin/env node
/**
 * Apply the SQL migrations in ./migrations, in order, exactly once each.
 *
 * Why this exists: the migrations were ten loose `migration_add_*.sql` files at
 * the repo root with no runner and no record of what had been applied. That is
 * survivable on one laptop where you remember which ones you ran. It is not
 * survivable on a host you don't control, where "did the payments table get
 * created?" has no answer short of opening a psql session. A production deploy
 * needs schema bring-up to be a command, not a memory exercise.
 *
 * Design decisions worth knowing:
 *
 * - Applied files are recorded in a `schema_migrations` table, so re-running is
 *   a no-op and a half-finished deploy resumes where it stopped.
 * - Each file runs inside its own transaction. If one fails, that file is rolled
 *   back whole and the run stops there rather than leaving the schema in a state
 *   no file describes.
 * - Order is the filename's numeric prefix, not alphabetical. This matters:
 *   0010_indexes.sql indexes columns and tables that earlier migrations add, so
 *   alphabetical ordering (indexes before product_questions) would fail on a
 *   database being brought forward.
 * - Nothing here drops, deletes or truncates. Every statement in every migration
 *   is guarded with IF NOT EXISTS / IF EXISTS / ON CONFLICT, which is what makes
 *   re-running safe even if the tracking table is lost.
 * - A checksum is stored per file. If a migration is edited after being applied,
 *   the run stops and says so rather than silently ignoring the change — the
 *   usual way a developer's schema and production's quietly diverge.
 *
 * Usage:
 *   node scripts/migrate.mjs           apply pending migrations
 *   node scripts/migrate.mjs --status  list applied/pending, change nothing
 *   node scripts/migrate.mjs --dry-run show what would run, change nothing
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

const args = new Set(process.argv.slice(2));
const statusOnly = args.has("--status");
const dryRun = args.has("--dry-run");

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// Load .env the same way the app does, so the runner and the app cannot end up
// pointed at different databases.
try {
  const dotenv = await import("dotenv");
  dotenv.config();
} catch {
  // dotenv is a dependency, but if it's missing the environment may still be
  // populated by the host. Carry on and let the DATABASE_URL check decide.
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail(
    "DATABASE_URL is not set, so there is no database to migrate.\n" +
      "  Set it in .env for local work, or in your host's environment settings."
  );
}

function checksum(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

const entries = (await readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

if (entries.length === 0) fail(`No .sql files found in ${migrationsDir}`);

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
} catch (e) {
  fail(
    `Could not connect to the database.\n  ${e.message}\n` +
      "  Check DATABASE_URL, that the server is running, and that it accepts connections from here."
  );
}

try {
  // The tracking table is itself created with IF NOT EXISTS, so the very first
  // run on a virgin database needs no special casing.
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await client.query("SELECT filename, checksum FROM schema_migrations");
  const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

  const pending = [];
  const drifted = [];

  for (const filename of entries) {
    const sql = await readFile(join(migrationsDir, filename), "utf8");
    const sum = checksum(sql);
    if (!applied.has(filename)) {
      pending.push({ filename, sql, sum });
    } else if (applied.get(filename) !== sum) {
      drifted.push(filename);
    }
  }

  if (statusOnly) {
    console.log(`\n${entries.length} migration(s) in ${migrationsDir}\n`);
    for (const filename of entries) {
      const state = !applied.has(filename)
        ? "pending"
        : drifted.includes(filename)
          ? "applied (file has since been edited)"
          : "applied";
      console.log(`  ${state === "pending" ? "·" : "✓"} ${filename} — ${state}`);
    }
    console.log(`\n${pending.length} pending, ${applied.size} applied.\n`);
    process.exit(drifted.length ? 1 : 0);
  }

  if (drifted.length) {
    fail(
      "These migrations were already applied but their files have changed since:\n" +
        drifted.map((f) => `    ${f}`).join("\n") +
        "\n\n  Editing an applied migration means this database and a freshly built one\n" +
        "  will end up with different schemas. Add a new migration for the change\n" +
        "  instead. If the edit was cosmetic and you are certain the schema is\n" +
        "  unaffected, delete that row from schema_migrations to re-baseline it."
    );
  }

  if (pending.length === 0) {
    console.log("\n✓ Database is up to date — nothing to apply.\n");
    process.exit(0);
  }

  console.log(`\n${pending.length} migration(s) to apply:\n`);
  for (const { filename } of pending) console.log(`  · ${filename}`);

  if (dryRun) {
    console.log("\n--dry-run: nothing was changed.\n");
    process.exit(0);
  }

  console.log("");
  for (const { filename, sql, sum } of pending) {
    process.stdout.write(`  applying ${filename} … `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING",
        [filename, sum]
      );
      await client.query("COMMIT");
      console.log("done");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.log("FAILED");
      fail(
        `${filename} failed and was rolled back. No later migration was attempted.\n` +
          `  ${e.message}\n\n` +
          "  The database is still in the state described by the migrations above this one."
      );
    }
  }

  console.log("\n✓ All migrations applied.\n");
} finally {
  await client.end().catch(() => {});
}
