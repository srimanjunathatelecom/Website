#!/usr/bin/env node
/**
 * Check the environment before deploying, and print what is wrong in a form you
 * can act on.
 *
 * Run this against the production environment values *before* the first deploy.
 * Everything it reports has a silent failure mode: the app boots, serves pages,
 * and then quietly can't take a payment, can't send an email, or rejects the
 * admin password you're certain is correct.
 *
 * Usage:
 *   npm run check:env          check as configured (uses NODE_ENV)
 *   npm run check:env -- --production   apply production strictness
 *
 * Exit code 1 if anything would block a correct production deploy, so this can
 * gate a deploy pipeline.
 *
 * The rules live in src/lib/env.ts and are shared with /api/health, so a passing
 * check here and a healthy deploy mean the same thing.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

try {
  const dotenv = await import("dotenv");
  dotenv.config();
} catch {
  // Values may come from the host's environment instead. Carry on.
}

/**
 * The rules are TypeScript, and this is a plain node script, so compile the one
 * module in memory rather than duplicating the rules or adding a build step. A
 * second copy of these rules is exactly how a check drifts from what it checks.
 */
const source = await readFile(join(root, "src", "lib", "env.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

const require = createRequire(import.meta.url);
const moduleShim = { exports: {} };
try {
  new Function("exports", "require", "module", "process", outputText)(
    moduleShim.exports,
    require,
    moduleShim,
    process
  );
} catch (e) {
  // src/lib/env.ts validates SITE_URL at module scope and throws in production,
  // which is correct at boot but would surface here as an unhandled exception
  // instead of the report this script exists to print. Report it as the
  // blocking issue it is.
  console.error(
    `\nEnvironment check\n\n  Blocking:\n\n  \u2716 configuration rejected at load\n      ${e.message}\n`
  );
  process.exit(1);
}
const { checkEnv, envIsDeployable } = moduleShim.exports;

const asProduction = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const issues = checkEnv(asProduction);

const label = asProduction ? "production" : "development";
console.log(`\nEnvironment check (${label} rules)\n`);

if (issues.length === 0) {
  console.log("  ✓ No problems found.\n");
  process.exit(0);
}

const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");

for (const group of [
  { list: errors, mark: "✖", heading: "Blocking" },
  { list: warnings, mark: "!", heading: "Worth fixing" },
]) {
  if (group.list.length === 0) continue;
  console.log(`  ${group.heading}:\n`);
  for (const i of group.list) {
    console.log(`  ${group.mark} ${i.variable}`);
    console.log(`      ${i.message}\n`);
  }
}

if (envIsDeployable(issues)) {
  console.log("Nothing blocks a deploy, but read the warnings above.\n");
  process.exit(0);
}

console.log("Fix the blocking items before deploying.\n");
process.exit(1);
