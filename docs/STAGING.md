# Staging deployment runbook (Railway + Neon)

Exact steps from zero to a working staging site. Total hands-on time: ~20 minutes.
Nothing here costs money up front: Neon has a free tier, Railway's Hobby plan is $5/mo.

## 1. Database — Neon (~5 min)

1. Sign up at https://neon.tech (GitHub login works).
2. Create a project — name `sms-stores-staging`, region **AWS ap-southeast-1 (Singapore)**
   (closest to Indian customers among Neon regions; latency from Railway is fine).
3. On the project dashboard, copy the **connection string** (pooled is fine), it looks like:
   `postgresql://neondb_owner:npg_xxxx@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
4. That's it. Migrations run automatically on first app start.

## 2. App — Railway (~10 min)

1. Sign up at https://railway.com (GitHub login), choose the Hobby plan.
2. **New Project → Deploy from GitHub repo** → select `rajsureshpanda/SMS-STORES-WEBSITE`
   (grant Railway access to the repo when prompted).
3. Railway detects `railway.toml` + `Dockerfile` automatically. Before the first
   deploy finishes, open the service → **Variables** and add:

   | Variable | Value for staging |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from step 1.3 |
   | `SITE_URL` | the Railway URL (see step 4 below; set after generating the domain, then redeploy) |
   | `INITIAL_ADMIN_EMAIL` | your email |
   | `INITIAL_ADMIN_PASSWORD` | a strong password — quote it if it contains `#` |
   | `SEED_KEY` | any long random string (staging only — lets you load demo data) |
   | `CSP_REPORT_ONLY` | `1` (observe CSP for a day before enforcing) |
   | `TRUSTED_PROXY_HOPS` | `1` (Railway sits one proxy in front of the app) |

   Leave `RAZORPAY_*` and `SMTP_*` unset on staging: checkout falls back to
   Cash on Delivery and emails no-op — both by design.
4. Service → **Settings → Networking → Generate Domain** → you get
   `https://<something>.up.railway.app`. Put that value into `SITE_URL` and redeploy.
5. Watch the deploy logs: you should see the migration runner apply all
   migrations, then the server start. The deploy only goes live once
   `/api/health` returns 200.

## 3. Load demo data (optional, staging only)

Open `https://<your-app>.up.railway.app/api/seed?key=<your SEED_KEY>&demo=1` once.
This creates the demo catalog, demo customers and the admin account from
`INITIAL_ADMIN_*`. Staging runs with `NODE_ENV=production`, so demo content
must be requested explicitly with `&demo=1` — without it the seed only
bootstraps settings, outlets, categories, services, content pages, banners
and the first admin.

## 4. Verify (5 min)

- `/api/health` → `{"ok":true,...}`
- Homepage renders with products.
- Log in at `/admin/login` with `INITIAL_ADMIN_*`, edit a homepage section title,
  confirm it changes on the storefront.
- Place a Cash-on-Delivery order end to end; open the invoice from the account page.

## 5. Promote to production later

Same recipe with a second Railway service + a Neon production project:
real domain in `SITE_URL`, real `RAZORPAY_*` + `SMTP_*`, **no `SEED_KEY` at all**,
and remove `INITIAL_ADMIN_*` after the first login. See README “Deploying”.

## Automating this (optional)

Both providers are scriptable if you prefer not to click through dashboards:
- Neon: create an API key at https://console.neon.tech/app/settings/api-keys
- Railway: create a token at https://railway.com/account/tokens

With those two tokens, the whole setup above can be executed via their APIs/CLI.
