# SMS Stores

Ecommerce storefront and admin console for a mobile phone retailer. Next.js 16 (App Router), PostgreSQL via Drizzle ORM, Tailwind 4, Razorpay for online payment.

The site is **not hosted yet**. This document is what you need to host it.

---

## Contents

- [Running it locally](#running-it-locally)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Deploying](#deploying)
- [After the first deploy](#after-the-first-deploy)
- [Testing](#testing)
- [Known limitations](#known-limitations)

---

## Running it locally

Requires Node 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env      # then fill it in — see below
npm run db:push           # create the tables from src/db/schema.ts
npm run db:migrate:sql    # apply the SQL migrations
npm run dev
```

Then load demo content once, if you want a populated shop to look at:

```bash
curl "http://localhost:3000/api/seed?key=<your SEED_KEY>"
```

Seeding is a GET, and it refuses to run unless `SEED_KEY` is set. It rewrites store settings and demo catalogue content, so don't point it at a database that has real products in it.

Demo catalogue content (sample products, variants, demo reviews and Q&A, starter coupons) is seeded automatically in development. In production the seed only bootstraps structural data — settings, outlets, categories, services, content pages, banners and the first admin — unless you explicitly ask for demo content with `&demo=1`. A real store is never given fake products or fake reviews by default.

---

## Environment variables

Copy `.env.example` and fill it in. Then check it:

```bash
npm run check:env -- --production
```

This reports anything that would break a live deploy and exits non-zero if something blocks one, so it can gate a deploy pipeline. It needs dev dependencies installed, so run it before a production-only install. The rules live in `src/lib/env.ts` and are shared with `/api/health`, so a passing check and a healthy deploy mean the same thing.

### Read this before editing `.env`

**Quote any value containing `#`.** `.env` parsing treats an unquoted `#` as the start of a comment and silently keeps only what precedes it:

```bash
INITIAL_ADMIN_PASSWORD=Admin#2026      # parsed as "Admin" — wrong, and silent
INITIAL_ADMIN_PASSWORD="Admin#2026"    # correct
```

The app boots fine either way. It then rejects the password you're certain is right. The same truncation on `RAZORPAY_WEBHOOK_SECRET` presents as a signature-verification bug, a long way from the actual cause. `npm run check:env` warns on any `#` in a sensitive value.

### Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname`. Add `?sslmode=require` for most managed providers. |
| `SITE_URL` | The real origin, e.g. `https://smsstores.in`. Must be `https://` in production. Used for canonical tags, the sitemap, robots.txt and every link in every customer email. The app refuses to boot in production if this is missing or still a placeholder — a wrong value here loses search traffic weeks later with nothing in the logs. |

### Online payment — you must supply these

Razorpay. **All three or none.** With none set, the storefront offers Cash on Delivery only and never shows a payment option it can't complete.

| Variable | Where to get it |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay Dashboard → Settings → API Keys. Live keys start `rzp_live_`. |
| `RAZORPAY_KEY_SECRET` | Shown once when the key is generated. |
| `RAZORPAY_WEBHOOK_SECRET` | Set when you create the webhook, below. |

Create the webhook in Razorpay Dashboard → Settings → Webhooks:

- **URL:** `https://your-domain/api/payments/webhook`
- **Events:** `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`

The webhook is what settles orders. Without it, customers pay and their orders sit in *Awaiting Payment*.

`npm run check:env -- --production` treats an `rzp_test_` key as a blocking error, because no real money can be collected with one.

### Optional

| Variable | Effect if unset |
|---|---|
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | No order or account emails are sent. All five or none — half-configured email fails silently. |
| `CRON_SECRET` | The payment reconciler can then only be triggered from the admin console, never over an open URL. Set it if you want to call it on a schedule. |
| `SEED_KEY` | `/api/seed` refuses to run. **Leave it unset in production** once your real catalogue is in place. |
| `CSP_REPORT_ONLY` | Content-Security-Policy is enforced. Set to `1` to report violations without blocking — see [Content Security Policy](#content-security-policy). |
| `ERROR_WEBHOOK_URL` | Errors are logged to stderr but nothing actively alerts you — see [Error reporting](#error-reporting). |
| `TRUSTED_PROXY_HOPS` | Defaults to 1. How many proxies of your own sit in front of the app; decides which `x-forwarded-for` entry is trusted as the client IP for rate limiting. Set 0 if nothing proxies the app, 2 for two layers. Getting this wrong makes rate limits either bypassable or shared by all customers — see below. |
| `NEXT_PUBLIC_IMAGE_HOSTS` | Remote images render unoptimized. Comma-separated hosts the image optimizer may fetch from; `*.example.com` matches subdomains. See [Images](#images). |
| `INITIAL_ADMIN_EMAIL` `INITIAL_ADMIN_PASSWORD` | No first admin is created. Needed for the first deploy only — remove them afterwards. |

Never commit `.env`. It is gitignored, and no secret has ever been committed to this repository.

---

## Database setup

Two steps, in this order.

```bash
npm run db:push          # tables, columns and indexes declared in src/db/schema.ts
npm run db:migrate:sql   # the SQL migrations in ./migrations
```

`db:push` builds the schema from `src/db/schema.ts`. `db:migrate:sql` then applies `migrations/*.sql`, which carry a few things that aren't expressible in the schema file — most notably a partial index (`notifications_unread_idx … WHERE read = false`) that serves the unread-notification badge.

### About the migration runner

```bash
npm run db:migrate:status   # what's applied, what's pending — changes nothing
npm run db:migrate:sql      # apply everything pending
node scripts/migrate.mjs --dry-run
```

- Applied files are recorded in a `schema_migrations` table, so re-running is a no-op and an interrupted deploy resumes where it stopped.
- Each file runs in its own transaction. A failure rolls that file back whole and stops the run, rather than leaving the schema in a state no file describes.
- Order is the numeric filename prefix, not alphabetical. This matters: `0010_indexes.sql` indexes tables and columns that earlier migrations add.
- Every statement in every migration is guarded (`IF NOT EXISTS` / `IF EXISTS` / `ON CONFLICT`) and **nothing drops, deletes or truncates**. This is what makes the runner safe against a database that was migrated by hand.
- Editing a migration that has already been applied stops the next run with an explanation. That's deliberate — silently ignoring the edit is how a developer's schema and production's quietly diverge. Add a new migration instead.

Verified against a populated database (24 products, 125 orders, 59 customers): all ten applied cleanly with zero row changes, and a second run was a no-op.

### Adding a migration

Create `migrations/00NN_what_it_does.sql`, guard every statement, don't drop anything, and mirror the change in `src/db/schema.ts` so a fresh `db:push` produces the same result.

---

## Deploying

Any host that runs a Node process works — a container, a VM, or a Node-capable platform. There's no host-specific configuration in the repo, and nothing is tied to a particular provider.

```
Build:   npm ci && npm run build
Start:   npm run start          # honours $PORT
Health:  GET /api/health
```

### Docker

The repo ships a production `Dockerfile` (multi-stage, standalone output, non-root, health-checked, runs migrations on start) and a `docker-compose.yml` that pairs it with Postgres:

```
cp .env.example .env            # fill in real values; set POSTGRES_PASSWORD
#   DATABASE_URL=postgresql://postgres:<password>@db:5432/sms_stores
docker compose up -d --build
```

Or build and run the image against an existing database:

```
docker build -t sms-stores .
docker run --env-file .env -p 3000:3000 sms-stores
```

Migrations are applied automatically at container start and are idempotent, so restarts and rolling deploys are safe. CI (`.github/workflows/ci.yml`) runs types, lint and a production build on every push and pull request.

Order of operations for the first deploy:

1. Provision PostgreSQL and get its connection string.
2. Set the environment variables in your host's dashboard.
3. Run `npm run check:env -- --production` against those values.
4. Run `npm run db:push` then `npm run db:migrate:sql` against the production database.
5. Deploy.
6. Poll `/api/health` until it returns 200.
7. Sign in at `/admin/login`, change the admin password, then remove `INITIAL_ADMIN_PASSWORD` and `SEED_KEY` from the environment.

### Health checks

`GET /api/health` round-trips an actual database query rather than just returning 200, and is never cached.

| Response | HTTP | Meaning |
|---|---|---|
| `"status": "ok"` | 200 | Database reachable, configuration complete. |
| `"status": "degraded"` | 200 | Serving normally, but something is misconfigured — run `npm run check:env`. |
| `"status": "unhealthy"` | 503 | Database unreachable. Pull the instance. |

A configuration problem returns 200 on purpose. A test-mode payment key is serious, but the catalogue still browses and Cash on Delivery still works; taking the site out of rotation over it would turn a payments problem into an outage.

The endpoint is public, so it reports *whether* the database answered and *how many* blocking config issues exist — never which variable, or any error text from the database. A health endpoint that echoes connection errors is a reconnaissance endpoint.

### Images

Product, banner and logo images are **URLs entered in the admin console**, not file uploads. There is no upload endpoint and nothing is written to disk, so the app needs no persistent volume and no object storage to run.

One thing to change before going live: `next.config.ts` currently allows `remotePatterns: [{ protocol: "https", hostname: "**" }]`, so `next/image` will fetch and resize an image from *any* HTTPS host. That makes your deployment a general-purpose image proxy that anyone can bill traffic to. Replace `**` with the hosts you actually use once you know them.

### Database connections

`src/db/index.ts` caps the pool at 10 per instance. If you run many short-lived instances, lower it or put a pooler (PgBouncer, or your provider's) in front, or you'll exhaust the connection limit.

---

## After the first deploy

Walk both journeys against the live site before announcing it:

**Customer:** browse → search → product → variant → cart → checkout → payment → account → orders

**Admin:** sign in → product → variant → images → stock → pricing → offers → homepage content → orders → settings

Then run `npm run verify:payments`, which creates a real ₹1 order through the API to prove the key pair works, the account accepts orders, and the webhook secret is configured sanely. Nothing is charged. After that, make one real card payment with live keys and confirm the order settles to *Paid* — that final step is the only way to know the whole path works, and no amount of code can do it for you.

---

## Testing

```bash
npm run typecheck
npm run lint
npm run build
```

API suites — need a running server and a seeded database. `npm test` runs all
of them with a server-up preflight, and clears `rate_limits` between suites
when `DATABASE_URL` is set (see the note on rate limits below):

```bash
BASE=http://localhost:3000 DATABASE_URL=postgres://… npm test
```

Or individually:

```bash
node tests/payments-webhook.mjs    # 36 assertions
node tests/order-integrity.mjs     # 24
node tests/fulfilment-block.mjs    # 23
node tests/cart-revalidate.mjs     # 31
node tests/rate-limit.mjs          # 14
node tests/repair-services.mjs     # 25  (services CRUD, bookings, catalogue install)
node tests/abuse-guards.mjs        # Origin checks, honeypots, media-upload fallback
node tests/observability.mjs       # 33  (no server needed)
node tests/link-audit.mjs          # crawls every page for broken internal links
```

The payment suites need the server started with test-mode gateway values —
no real gateway is contacted, webhooks are signed locally:

```bash
RAZORPAY_KEY_ID=rzp_test_qa RAZORPAY_KEY_SECRET=qasecret \
RAZORPAY_WEBHOOK_SECRET=localqawebhooksecret npm run start
```

To take an empty database to the current schema without the interactive
`drizzle-kit push` (CI does exactly this):

```bash
DATABASE_URL=postgres://… node scripts/db-bootstrap.mjs
```

Browser suites (Playwright, mobile + desktop):

```bash
npm run build && npm run start     # run against a production build, not dev
npx playwright test                # 192 tests, 8 spec files, mobile + desktop
```

`admin-panels.spec.ts` is worth knowing about: it counts API requests while the
admin console sits idle. The 24 admin panels share one data hook, and a mistake
in its dependencies produces a refetch loop that compiles, typechecks and
renders perfectly while querying the database continuously. Nothing else in the
suite would notice.

Two things that will otherwise waste your afternoon:

- **Run Playwright against `next start`, not `next dev`.** The admin bundle is large enough that on-demand compilation makes specs time out for reasons unrelated to the code.
- **Rate limits are real and will fail your test run.** Registration is capped at 5/hour/IP and admin login at 8/15min/IP. Counters now live in the database, so restarting the server no longer clears them — run `delete from rate_limits;` between runs instead.

---

## Content Security Policy

The policy is built per request in `src/middleware.ts`, not in `next.config.ts`.
It has to be: a useful `script-src` names a nonce that changes on every response,
and a static config file cannot produce one. The static headers previously carried
`frame-ancestors`, `object-src` and `base-uri` but no `script-src` at all, which
is the directive that actually stops injected script from executing.

`script-src` is `'self' 'nonce-<random>' 'strict-dynamic'`. Three things inject
scripts at runtime here — the Razorpay checkout SDK, the Google Analytics tag and
its inline config — and `'strict-dynamic'` covers all three by trusting scripts
loaded by already-trusted scripts, without the weakness of a host allowlist,
where any open redirect on an allowed domain becomes script execution. Note that
browsers ignore host expressions in `script-src` when `'strict-dynamic'` is
present, which is why `checkout.razorpay.com` is not listed there.

Next stamps the nonce onto its own bootstrap automatically. The tags it doesn't
own — two JSON-LD blocks and the pre-paint theme script — read it from
`headers()` and set it explicitly.

`style-src` still allows `'unsafe-inline'`, and that is a real gap rather than an
oversight: Next injects styles inline while streaming and offers no nonce hook for
them. Inline style enables defacement and some CSS-based data exfiltration, not
code execution, so it is a much smaller problem than inline script — but this is
not a strict policy and shouldn't be described as one.

**Before you launch, set `CSP_REPORT_ONLY=1` for the first day.** A wrong CSP
fails in the browser: the server returns 200, the HTML is intact, and the page is
simply dead. Server logs will not tell you. Run a real checkout on the real
domain, confirm the console is clean, then unset it. `npm run check:env` warns if
you leave it on.

## Error reporting

Failures are captured by `src/lib/observability.ts` and written to stderr as
one-line JSON objects, which every serious host collects and can parse. No
account, key or vendor is required for this to work.

The problem it was built to solve was not a missing vendor. It was that errors
were being thrown away: of 39 catch blocks under `src/app/api`, 16 were written
`} catch {`, discarding the error entirely, and only 7 logged anything. A
monitoring SDK dropped into that codebase would have reported almost nothing,
because the failures never escaped the route that produced them. The catch blocks
that return 500 now report before they respond.

Two entry points:

- **Explicit reports** — `reportError(err, scope, context)` in catch blocks, and
  `reportWarning` for things that are wrong without throwing, like a payment
  webhook arriving for an order that can't be found.
- **`src/instrumentation.ts`** — Next.js's `onRequestError` hook, which catches
  errors that escape every catch block in the app, including server-component
  render failures. Worth having: with the database stopped, `/` still returns 200
  to the visitor while erroring internally, and nothing else would have told you.

Each report carries a fingerprint built from the error type, its message with
variable parts removed, and the top stack frame, so a thousand instances of one
bug read as one problem.

Set `ERROR_WEBHOOK_URL` to also deliver reports to a Slack or Discord incoming
webhook, or any endpoint accepting JSON. Delivery is fire-and-forget so it never
adds latency, and repeats of the same fault are capped at 3 per 5 minutes so a
broken database doesn't produce a thousand messages.

Values that look like credentials — Postgres URLs with inline passwords, Razorpay
keys, bearer tokens, long hex digests — are redacted from messages and stacks
before anything is emitted, and context keys whose names look sensitive are
dropped by name. A reporting pipeline is a well-worn route for secrets to leave a
system; `tests/observability.mjs` asserts this, because it is easy to get right
now and easy to break later.

## Known limitations

Honest list. Nothing here is hidden behind a passing test.

1. **The live payment path has never been exercised.** Signature verification, the order lifecycle and webhook handling are covered by 36 assertions, but those generate their own HMACs with a local secret — no real key has ever touched this code, and none should live in a repository. This is the one caveat that cannot be closed from inside the codebase; it needs the person holding the credentials.

   `npm run verify:payments` does as much of it as is possible without a customer: it reads the credentials the app reads, creates a genuine ₹1 order through the API (an order is an intent, not a charge — nothing is captured and it expires by itself), reads it back to confirm fetch access works for the reconciler, and checks the webhook secret is present and distinct from the API secret, which is the usual cause of signature failures that look like tampering. Run it with test keys, then again with live keys, since an activated live account and a working test account are different questions.

   Two things it cannot check, both requiring the dashboard: that the webhook secret matches the one Razorpay signs with — use the dashboard's "send test webhook" against `/api/payments/webhook` and confirm it's accepted rather than rejected — and that a customer can actually complete a payment. Place one real order end to end and confirm it moves off *Awaiting Payment*.
2. **`next/image` accepts any HTTPS host.** See [Images](#images).
3. **`TRUSTED_PROXY_HOPS` has to match your topology.** Rate limits key on the client IP, taken from the right-hand end of `x-forwarded-for` by however many hops you declare. Set it too high and the app trusts a value the caller supplied, which lets an attacker rotate the header for a fresh budget per request; too low and every customer behind your proxy shares one bucket and throttles each other. Login endpoints also carry a per-account limit that holds regardless of this setting, but the IP limit is your first line and it depends on getting this right. Check it against your host's docs before launch.
4. **Error reporting has no vendor behind it.** Failures are captured and written to stderr as structured JSON, and optionally POSTed to `ERROR_WEBHOOK_URL` — see [Error reporting](#error-reporting). That covers capture and alerting, but not retention, search or trend history. If you want those, `deliver` in `src/lib/observability.ts` is the single place a vendor SDK plugs in.
5. **`next.config.ts` sets no CSP `script-src`.** Next.js inlines bootstrap scripts, so a strict policy needs per-request nonces through middleware. `frame-ancestors`, `object-src` and `base-uri` are set; script policy is not.
