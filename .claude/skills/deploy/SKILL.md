---
name: deploy
description: Set up and deploy UVL Expense Scanner on Firebase (Hosting, Firestore, Storage, Authentication) and manage Security Rules, the local emulator, rollbacks and free-tier limits. Use when deploying, changing Security Rules, changing who can sign in, or debugging production.
---

# Deploy and operate (Firebase)

Design: D2, D3, D4 and the Migration Plan in `openspec/changes/add-expense-tracker-mvp/design.md`. The owners' step-by-step version is `docs/setup.md` (task 3.5). Keep the two consistent.

> **Status:** written before implementation. Verify each command against the current Firebase CLI docs when first executing it, and update this file with what actually worked.

There is **no server** in this project. Everything below is either a one-time Firebase project setting, a Security Rules file, or a static-file deploy. The Anthropic API key is never part of this deploy — it lives on each member's device (see the `receipt-extraction` skill).

## Resources

| Resource | Notes |
|---|---|
| Firebase project | free **Spark** plan — no credit card, no Cloud Functions |
| Firebase Hosting | serves the built `apps/web` PWA |
| Firestore | the D8 data model |
| Firebase Storage | receipt images/PDFs |
| Firebase Authentication | email-link sign-in, restricted in the UI and in rules to the two member emails |

## One-time setup

1. Create a Firebase project in the [Firebase console](https://console.firebase.google.com) on the **Spark** (free) plan.
2. Enable **Authentication → Email link (passwordless sign-in)**.
3. Enable **Firestore** (production mode) and **Storage**.
4. `npm install -g firebase-tools` (or use `npx firebase-tools`), then `firebase login`.
5. `firebase init` in the repo root, selecting Hosting, Firestore and Storage, pointing Hosting's public directory at `apps/web/dist`. This writes `firebase.json`, `firestore.rules`, `firestore.indexes.json` and `storage.rules` under `firebase/` per D11.
6. Put the two member email addresses directly into `firebase/firestore.rules` and `firebase/storage.rules` (see D3 — this is deliberate; there is no admin UI for a fixed, 2-person allowlist).
7. `firebase deploy --only firestore:rules,storage:rules`
8. Copy the project's Firebase web config (apiKey, projectId, etc. — these are public identifiers, not secrets) into `apps/web`'s config. Firebase config values are safe to commit; Security Rules are the actual access control.
9. In the Anthropic Console, each owner (or the household account used for billing) sets a **hard monthly spend limit**. Each member then enters their own API key in the app's Settings on their own device — this step is per-device, not part of deploy.

## Routine deploy

```
npm ci && npm run lint && npm run typecheck && npm test
npm run build -w apps/web
firebase deploy --only firestore:rules,storage:rules   # only when rules changed
firebase deploy --only hosting
```

- Deploy rules before Hosting when both changed, so the new client never runs against rules that don't yet match it.
- Firestore document shapes change additively by convention (new optional fields only) — no migration step exists or is needed.

## Local development and testing Security Rules

```
firebase emulators:start
```

Starts local Firestore, Storage and Auth emulators. Run the rules-test suite (task 3.1) against the emulator before every rules deploy — never test rules changes against the production project.

## Rollback

- Hosting: `firebase hosting:rollback` restores the previous release immediately.
- Firestore/Storage rules: `firebase deploy --only firestore:rules,storage:rules` with the previous version checked out, or restore the previous rules from the Firebase console's rules history.
- There is no database to roll back — Firestore data isn't versioned by deploys, only by the app's own `version` field (D4) and the year-end archive/backup (year-end-archive spec).

## Changing who can sign in

Edit the hardcoded email list in `firebase/firestore.rules` and `firebase/storage.rules`, redeploy both, and update the matching allowlist in the app's sign-in UI. There is no Cloud Function or Admin SDK step — this is why the emails are kept in the rules files rather than a database.

## Free-tier (Spark) limits to watch

- Firestore: 1 GiB stored, 50K reads / 20K writes / 20K deletes per day — all far above ~20 receipts/month plus two people's casual usage.
- Storage: 5 GB stored, 1 GB/day download — expect roughly 150 MB of images a year.
- Hosting: 10 GB stored, 360 MB/day transfer.
- Authentication: email-link sign-in has no meaningful cap at this scale.
- If any of these are ever approached, the project can move to the paid **Blaze** plan (still effectively free at this volume — it only changes the billing model, not the price, until usage is much higher). That also unlocks Cloud Functions, which is the path to the Cloud Function key-proxy noted as an open question in design.md.

## Never

- Commit the Anthropic API key anywhere. It belongs on-device only, entered through Settings.
- Loosen `firestore.rules` or `storage.rules` to `allow read, write: if true;` even "temporarily" — those files are the entire access control for this app.
- Deploy a rules change that hasn't passed the emulator rules-test suite.
