---
name: deploy
description: Set up and deploy UVL Expense Scanner on Firebase (Hosting, Firestore, Authentication) and manage Security Rules, the local emulators, member emails and rollbacks. Use when deploying, changing Security Rules, changing who can sign in, or debugging the live app.
---

# Deploy and operate (Firebase)

Design: D2, D3, D4 in `openspec/changes/add-expense-tracker-mvp/design.md`. The owners' step-by-step guide is `docs/setup.md`; keep it consistent with this file.

> **Status:** the rules and emulator commands below run in CI. `firebase deploy` has not yet been run against the owners' real project; correct this file with whatever differs the first time.

There is no server. A deploy is the static app plus the Firestore rules. The Anthropic key is not part of any deploy: a member enters it in the app's Settings and it is stored in the `config/app` document.

## What exists

| Piece | Where |
|---|---|
| Firebase project | free **Spark** plan; no Cloud Functions, no Cloud Storage (both need the paid plan) |
| Hosting | serves `apps/web/dist` |
| Firestore | all data; receipt images are chunked into the `blobs` collection |
| Authentication | Email/Password, with email verification |
| Rules | `firebase/firestore.rules`, tests in `firebase/firestore.rules.test.ts` |
| Config | `firebase/firebase.json`; web app settings in `apps/web/.env` (public identifiers, safe to commit) |

## Deploy

```
npm ci && npm run typecheck && npm test && npm run test:rules
npm run build
npx firebase deploy --config firebase/firebase.json --project <project-id> --only firestore:rules,hosting
```

- Deploy rules together with or before hosting.
- Record shapes change additively only (new optional fields). There are no migrations.
- From a cloud session there is no stored Firebase login. Ask the owner for a deploy credential through the session's credential request; never ask them to paste one into chat.

## Local development and tests

```
npm run emulators                      # Auth on 9099, Firestore on 8080, project demo-uvl
npm run dev -- --mode emulator         # app against the emulators (apps/web/.env.emulator)
npm run test:rules                     # rules tests
npm run test:e2e                       # Playwright; mocks the Anthropic API
```

The emulators need Java. In the e2e tests the member accounts are `member-one@example.com` and `member-two@example.com`, which is why those placeholders must stay valid in the committed rules until the owners replace them; when they do, update `MEMBER` in the rules test and `e2e/helpers.ts` to match.

## Changing who can sign in

Edit the two addresses in `firebase/firestore.rules` (lowercase), run `npm run test:rules`, deploy the rules. An address only gets access once its owner has confirmed it by email.

## Rollback

- Hosting: `npx firebase hosting:rollback --project <project-id>` or the Hosting page of the console.
- Rules: the console keeps a history under Firestore → Rules.

## Free-plan limits

Firestore: 1 GiB stored, 50,000 reads and 20,000 writes a day. Expected use: about 100 MB of images a year and a few hundred reads a day. Verification and password-reset emails are rate-limited on the free plan; two members will not notice.

## Never

- Loosen the rules to `if true`, even briefly.
- Deploy a rules change that has not passed `npm run test:rules`.
- Commit an Anthropic key, or put one in `apps/web/.env`.
