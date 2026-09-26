---
name: deploy
description: Set up and deploy UVL Expense Scanner on Cloudflare (Pages, Workers, D1, R2, Access) and manage its secrets, database migrations, rollbacks and free-tier limits. Use when deploying, running migrations, rotating the Anthropic key, changing who can sign in, or debugging production.
---

# Deploy and operate (Cloudflare)

Design: D2, D3 and the Migration Plan in `openspec/changes/add-expense-tracker-mvp/design.md`. The owners' step-by-step version is `docs/setup.md` (task 3.5). Keep the two consistent.

> **Status:** written before implementation. Verify each command against the current Wrangler docs when first executing it, and update this file with what actually worked.

## Resources (names are fixed; code and `wrangler.toml` depend on them)

| Resource | Name |
|---|---|
| Pages project (web app) | `uvl-expenses` |
| Worker (API, routed at `/api/*`) | `uvl-expenses-api` |
| D1 database | `uvl-expenses` |
| R2 bucket (images/PDFs) | `uvl-receipts` |
| Access application | "UVL Expenses", covering the Pages domain and `/api/*` |

## One-time setup

1. `npx wrangler login`
2. `npx wrangler d1 create uvl-expenses`, then copy the `database_id` into `apps/api/wrangler.toml`.
3. `npx wrangler r2 bucket create uvl-receipts`
4. `npx wrangler secret put ANTHROPIC_API_KEY` (run in `apps/api`). The owners paste the key; never commit it or echo it.
5. `npx wrangler d1 migrations apply uvl-expenses --remote`
6. In the Cloudflare dashboard, go to Zero Trust → Access → Applications → add a **Self-hosted** application for the app domain:
   - identity provider: **One-time PIN**;
   - policy: Allow, Include → Emails, with exactly the two member addresses;
   - session duration: 1 month.
   - Put the Application Audience (AUD) tag and team domain into Worker vars `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`.
7. In the Anthropic Console, set a monthly spend limit as a second safety net behind the in-app cap.

## Routine deploy

```
npm ci && npm run lint && npm run typecheck && npm test
npm run build -w apps/web
npx wrangler d1 migrations apply uvl-expenses --remote   # only when migrations changed
npx wrangler deploy -c apps/api/wrangler.toml
npx wrangler pages deploy apps/web/dist --project-name uvl-expenses
```

- Deploy the API before the web app when both change, so the new client never talks to an old API.
- Migrations must be **additive** (add columns or tables). A destructive change needs its own OpenSpec change with a data plan.

## Rollback

- Worker: `npx wrangler rollback` (to the previous version).
- Pages: re-activate the previous deployment from the dashboard or CLI.
- D1: use Time Travel restore (`npx wrangler d1 time-travel restore uvl-expenses --timestamp=<ISO>`). This rewinds **all** data, so confirm with the owners first.

## Changing who can sign in

Edit the Access policy's email list. No code change or deploy is needed. The Worker also checks the email claim against the `MEMBER_EMAILS` var, so keep both in sync.

## Free-tier limits to watch

- Workers free plan: about 10 ms CPU per request. Keep heavy work (zip, xlsx, base64) off the Worker. If it's exceeded, Workers Paid costs $5/month; ask the owners first.
- D1: 5 GB. R2: 10 GB storage, free egress. Expected use is about 150 MB of images a year.
- Access free plan: up to 50 users.

## Never

- Commit secrets, `.dev.vars`, or real receipt images to a public repository.
- Run `--remote` migrations or a D1 restore without telling the owners.
