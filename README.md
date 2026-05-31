# ClaimTrack

ClaimTrack is a hosted repair-status system for collision repair and auto body shops.

It gives service advisors one place to track repair status, parts delays, insurance notes, repair photos, pickup checklists, customer messages, and review follow-up.

## Stack

- Vite React
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Netlify Functions
- Stripe Checkout

## Local Setup

1. Install dependencies.

```bash
npm install
```

2. Copy `.env.example` to `.env`.

```bash
cp .env.example .env
```

3. Add Supabase values.

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SITE_URL=http://localhost:5500
```

4. Add Stripe values when checkout is ready.

```bash
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_SUCCESS_URL=http://localhost:5500/settings?billing=success
STRIPE_CANCEL_URL=http://localhost:5500/settings?billing=cancelled
```

5. Start the app.

```bash
npm run dev
```

The Vite dev server is configured for port `5500`.

## Supabase Setup

1. Create a Supabase project.
2. In Authentication, enable email signups.
3. Open the SQL editor.
4. Run `supabase/schema.sql`.
5. Confirm the `repair-photos` storage bucket exists.
6. Add the app URL to Auth redirect URLs:

```text
http://localhost:5500
https://your-netlify-site.netlify.app
```

Tables created:

- `shops`
- `team_members`
- `team_invitations`
- `customers`
- `repairs`
- `parts`
- `insurance_notes`
- `photo_updates`
- `pickup_checklists`
- `review_messages`
- `settings`

Security:

- RLS is enabled on shop data tables.
- Users can only read and write records for shops they belong to.
- Shop owners can create shops and invite team members.
- Pending invitations are accepted by `accept_pending_invitation_for_current_user()`.
- Public customer status pages use `get_public_repair_status(token_input)` and return only customer-safe fields.

## Optional Sample Data

After a user creates a shop, run `supabase/seed-demo.sql` in Supabase, then call this RPC as the signed-in user:

```js
await supabase.rpc("seed_claimtrack_sample_data")
```

The seed creates two customers, three repairs, parts records, an insurance note, a visible photo update, a pickup checklist, and one review message. It uses the current user's shop and does not insert records with a service-role shortcut.

## Stripe Setup

1. Create a Stripe product and recurring price.
2. Add the Stripe secret key and price ID to Netlify environment variables.
3. The Settings page calls `/.netlify/functions/create-checkout-session`.
4. Checkout returns to:

```text
/settings?billing=success
/settings?billing=cancelled
```

Subscription status lives on `shops.subscription_status`.

For a first launch, update the shop status to `active` after payment clears or wire a Stripe webhook to update it automatically. The dashboard allows `trialing` and `active`; other statuses are sent to the billing panel.

## Netlify Deploy

`netlify.toml` is configured for Vite and Netlify Functions:

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"
```

Deployment checklist:

- Add all `.env.example` values to Netlify.
- Set `VITE_SITE_URL` to the production URL.
- Confirm Supabase Auth redirect URLs include the production URL.
- Confirm Stripe success and cancel URLs use the production URL.
- Deploy.
- Open `/status/test` and confirm the SPA redirect loads the app.
- Create an account, create a shop, add one repair, copy the customer status link, and open it in a logged-out browser.

## QA Commands

```bash
npm install
npm run build
node --check netlify/functions/create-checkout-session.js
rg "localStorage|mock|Reset Demo" -n src README.md supabase netlify --glob "!dist/**" --glob "!node_modules/**"
```

## Manual Testing Still Needed

- Real Supabase signup and email confirmation.
- Shop onboarding in a fresh Supabase project.
- Team invitation acceptance with a second email address.
- Supabase Storage upload with real repair photos.
- Public customer status link in a logged-out browser.
- Stripe Checkout with a test card.
- Subscription status update after Stripe payment.
