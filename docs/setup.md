# Setting up UVL Expenses

This is a one-time setup. Parts 1–3 are done in a web browser and take about 20 minutes. Part 4 needs a computer for a few minutes (or ask Claude Code to do it for you in a session).

Nothing here costs money except the AI reading in Part 3, which is about $1–2 a month.

## Part 1 – Create the Firebase project (free)

Firebase is the Google service that hosts the app, stores your records and keeps your two phones in sync.

1. Go to <https://console.firebase.google.com> and sign in with a Google account you both can keep long-term.
2. **Add project**. Name it (for example `uvl-expenses`). Google Analytics is not needed. Stay on the free **Spark** plan; do not add a credit card.
3. In the left menu: **Build → Authentication → Get started → Email/Password → Enable → Save**.
4. In the left menu: **Build → Firestore Database → Create database**. Choose a US location (for example `nam5`), then **Start in production mode**.
5. Click the gear icon → **Project settings → Your apps → the `</>` (Web) icon**. Give it a nickname and register it. Firebase shows a block of settings (`apiKey`, `authDomain`, `projectId`, `appId`). Keep this page open; you need those four values in Part 4.

## Part 2 – Say who the two members are

Only the two email addresses listed in the security rules can open the records.

1. Open `firebase/firestore.rules` in the repository.
2. Replace `member-one@example.com` and `member-two@example.com` with your two email addresses, in lowercase.
3. Save (commit) the change.

To change a member later, edit the same two lines and deploy the rules again (Part 4, last step).

## Part 3 – Get an AI key and cap the spending

Receipts are read by Claude, an AI service from Anthropic.

1. Go to <https://console.anthropic.com>, create an account and add a small amount of credit (for example $10).
2. **Set a monthly spend limit** under the billing/limits settings, for example $10. This is the real safety net: even if the key leaked, it could not spend more.
3. Create an **API key** and copy it. You will paste it into the app in Part 5. Do not put it in the repository or send it in chat.

## Part 4 – Publish the app

On a computer with [Node.js 22](https://nodejs.org) installed, in the repository folder:

1. Put the four values from Part 1 into `apps/web/.env`:

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

   These identify your project. They are not secret; the rules from Part 2 are what protect your data.

2. Run:

   ```
   npm ci
   npm run build
   npx firebase login
   npx firebase deploy --config firebase/firebase.json --project YOUR_PROJECT_ID --only firestore:rules,hosting
   ```

3. Firebase prints the app's address, like `https://YOUR_PROJECT_ID.web.app`.

To publish a new version later, run `npm run build` and the `deploy` line again.

## Part 5 – Install it on your phones

On each iPhone or iPad:

1. Open the app's address in **Safari**.
2. Tap **Share → Add to Home Screen**. From now on, open it from the home screen icon.
3. Tap **First time? Create an account**, enter your email and a password. Let the iPhone save the password.
4. Open the email from Firebase and tap the link to confirm your address (any browser is fine). Go back to the app and tap **Continue**.

Then, on one phone only:

5. **Settings → Reading receipts**: paste the AI key from Part 3 and tap **Save key**. The other phone picks it up by itself.
6. **Properties → Add property** for each rental and flip.

You are ready to scan.

## Good to know

- **Year-end:** in January, go to **Reports**, choose last year and **Close** it. Save the archive file in two places. The IRS generally expects records to be kept at least 3 years, up to 7 in some cases.
- **Lost phone:** change that member's password from the other device's browser (use "Forgot password" on the sign-in screen), and replace the AI key in the Anthropic console and in Settings.
- **Straight scans:** for a crumpled or angled receipt, the iPhone Notes app's **Scan Documents** makes a clean PDF that you can bring in with **Import photo or PDF**.
- **Limits:** the free Firebase plan allows far more than this app uses (about 100 MB of receipt images a year against 1 GB).
