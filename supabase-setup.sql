-- Run this once in Supabase Dashboard → SQL Editor → New query → Run.

create table if not exists subscriptions (
  gstin text primary key,
  plan text not null,
  status text not null default 'pending',
  subscription_id text,
  customer_name text,
  customer_email text,
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

alter table subscriptions enable row level security;

-- Anyone can READ subscription status (GSTIN isn't secret information — it's
-- meant to be publicly verifiable). This is what lets FingerTax.html check
-- "is this user's plan active" directly from the browser.
create policy "Public read access"
  on subscriptions for select
  using (true);

-- Deliberately no insert/update/delete policy for the anon/authenticated roles.
-- Only the service_role key (used exclusively inside the Netlify Functions,
-- never in the browser) can write here — that's what makes "is this
-- subscription real" trustworthy.
