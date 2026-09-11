import { sql } from "drizzle-orm";
import { db } from "@/db";
import { checkEnv, envIsDeployable } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness for whatever ends up hosting this.
 *
 * Every platform wants a URL it can poll to decide whether an instance should
 * receive traffic, and "the homepage returns 200" is a poor substitute: the
 * homepage is cacheable and can render from stale data while the database is
 * unreachable. This actually round-trips a query.
 *
 * Deliberately says very little. Anyone on the internet can call it, so it
 * reports whether the database answered and whether the configuration is
 * complete — never which variable is missing, what the database is, or any error
 * text from it. A health endpoint that echoes connection errors is a
 * reconnaissance endpoint. `npm run check:env` is where the specifics live, and
 * that runs where only the operator can see it.
 *
 * 503 only when the database is unreachable, because that is the only failure
 * that makes this instance unable to serve. Configuration problems are reported
 * but return 200 and "degraded": a test-mode payment key means the shop can't
 * collect card payments, which is serious, but the catalogue still browses and
 * Cash on Delivery still works. Pulling the whole site out of rotation over it
 * would turn a payments problem into an outage. The operator sees "degraded" and
 * runs `npm run check:env` for the specifics.
 */
export async function GET() {
  const startedAt = Date.now();

  let databaseOk = false;
  try {
    await db.execute(sql`select 1`);
    databaseOk = true;
  } catch {
    // Swallowed on purpose — see the note above about leaking detail.
    databaseOk = false;
  }

  const issues = checkEnv();
  const configOk = envIsDeployable(issues);

  // Serveability and correctness are different questions, and conflating them is
  // how a misconfigured payment key becomes a site-wide outage.
  const canServe = databaseOk;

  return Response.json(
    {
      // `ok` predates this expansion and meant "the database answered". Kept
      // with that exact meaning so anything already polling it keeps working.
      ok: canServe,
      status: !canServe ? "unhealthy" : configOk ? "ok" : "degraded",
      database: databaseOk ? "ok" : "unreachable",
      // A count, not the list. Enough for an operator watching a dashboard to
      // know to go and run the env check.
      configuration: configOk ? "ok" : "incomplete",
      blockingConfigIssues: issues.filter((i) => i.level === "error").length,
      latencyMs: Date.now() - startedAt,
    },
    {
      status: canServe ? 200 : 503,
      // Never cached: a cached health check is worse than none, because it keeps
      // reporting healthy after the instance stops being so.
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
