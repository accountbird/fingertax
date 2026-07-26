# FingerTax + Razorpay — Netlify + Supabase edition

This replaces the earlier Firebase backend with one that needs **no card
verification / billing account at all** to get started — both Netlify
Functions and Supabase have genuinely free tiers with no card required.

```
Netlify  → hosts FingerTax.html (static site)
         → ALSO hosts the two backend functions below (same domain, no CORS pain)
Supabase → hosts the "subscriptions" database (Postgres, free tier)
Firebase → kept ONLY for Google Sign-In (Firebase Auth is free, no Blaze needed)
```

---

## Part 1 — Create your free Supabase project

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in with GitHub or email.
2. **New project** → pick any name (e.g. `fingertax`) → choose a region close to India (e.g. Singapore) → set a database password (save it somewhere) → Create.
3. Wait ~2 minutes for it to provision.
4. Go to **SQL Editor** (left sidebar) → **New query** → paste the entire contents of `supabase-setup.sql` (in this folder) → **Run**.
5. Go to **Project Settings → API**. Copy these three values — you'll need them below:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** key (safe to use in the browser)
   - **service_role** key (⚠️ secret — only ever goes into Netlify environment variables, never into FingerTax.html)

---

## Part 2 — Update FingerTax.html with your Supabase details

Open FingerTax.html, find this block near the bottom (search for `YOUR-PROJECT-REF`):

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
```

Replace both with your actual **Project URL** and **anon public** key from Part 1. Re-upload the file to Netlify (drag-and-drop onto your existing site, or push to your connected Git repo).

---

## Part 3 — Deploy the two Netlify Functions

**If your Netlify site is connected to a Git repo (recommended):**
1. Copy the `netlify/` folder and `netlify.toml` from this package into the root of your repo (same level as FingerTax.html).
2. Commit and push — Netlify auto-deploys the functions on the next build.

**If you deployed via drag-and-drop instead:**
1. Netlify's drag-and-drop only accepts a folder, and functions need a proper Netlify site config to run. The simplest fix: switch your site to deploy from a GitHub repo instead (Netlify → Site settings → Build & deploy → Link repository), then push this whole folder structure (FingerTax.html + netlify.toml + netlify/functions/) to that repo.

Either way, once deployed, go to **Site settings → Environment variables** on Netlify and add:

| Key | Value |
|---|---|
| `RAZORPAY_KEY_ID` | from Razorpay Dashboard → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | from Razorpay Dashboard → Settings → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you set when creating the webhook |
| `RAZORPAY_GROWTH_PLAN_ID` | from Razorpay Dashboard → Subscriptions → Plans |
| `SUPABASE_URL` | same Project URL from Part 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | the **service_role** key from Part 1 (the secret one) |

After adding these, trigger a redeploy (Netlify → Deploys → Trigger deploy) so the functions pick up the new environment variables.

---

## Part 4 — Point the Razorpay webhook here

Your webhook URL is now:
```
https://fingertax.netlify.app/.netlify/functions/razorpay-webhook
```

Go to Razorpay Dashboard → Settings → Webhooks → edit your existing webhook →
replace the URL with the one above (same events as before: `subscription.activated`,
`subscription.charged`, `subscription.cancelled`, `subscription.completed`,
`subscription.halted`, `payment.failed`).

---

## Part 5 — Test it end to end

1. Open your live Netlify site, sign in, complete your profile with a real (or valid-format) GSTIN.
2. Profile → View plans / Upgrade → Upgrade to Growth.
3. Razorpay Checkout should open. Test card: `4111 1111 1111 1111`, any future expiry, any CVV, OTP = any 4–10 digit number for success.
4. Check Supabase → Table Editor → `subscriptions` table — status should flip from `pending` to `active` within a few seconds.
5. Refresh FingerTax — Profile should now show "Active — billed via Razorpay".

---

## What you no longer need

- No Google Cloud billing account, no Blaze plan, no card verification hold.
- No Firebase Functions, no Firestore, no `firebase deploy`.
- Firebase is kept for exactly one thing: Google Sign-In (Firebase Auth), which
  has always been free and doesn't need any of the above.
