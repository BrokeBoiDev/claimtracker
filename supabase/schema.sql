-- ClaimTrack hosted SaaS schema
-- Run this in the Supabase SQL editor after creating the project.

create extension if not exists "pgcrypto";

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  google_review_link text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'trialing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'service_advisor',
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  email text not null,
  role text not null default 'service_advisor',
  status text not null default 'pending',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  ro_number text not null,
  insurance_company text,
  claim_number text,
  status text not null default 'Vehicle Received',
  estimated_pickup text,
  delay_reason text,
  next_update text,
  repair_notes text,
  public_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (public_token)
);

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  repair_id uuid not null references public.repairs(id) on delete cascade,
  name text not null,
  status text,
  eta text,
  delay_reason text,
  created_at timestamptz not null default now()
);

create table public.insurance_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  repair_id uuid not null references public.repairs(id) on delete cascade,
  note text,
  supplement_status text,
  adjuster_contact text,
  approval_status text,
  created_at timestamptz not null default now()
);

create table public.photo_updates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  repair_id uuid not null references public.repairs(id) on delete cascade,
  label text not null,
  file_path text,
  url text not null,
  is_customer_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pickup_checklists (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  repair_id uuid not null references public.repairs(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.review_messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  repair_id uuid references public.repairs(id) on delete set null,
  message_type text not null,
  body text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.shops(id) on delete cascade,
  default_update_message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_members_user_id on public.team_members(user_id);
create index if not exists idx_team_members_shop_id on public.team_members(shop_id);
create index if not exists idx_team_invitations_shop_id on public.team_invitations(shop_id);
create index if not exists idx_team_invitations_email_status on public.team_invitations(lower(email), status);
create index if not exists idx_customers_shop_id on public.customers(shop_id);
create index if not exists idx_repairs_shop_id on public.repairs(shop_id);
create index if not exists idx_repairs_customer_id on public.repairs(customer_id);
create index if not exists idx_repairs_public_token on public.repairs(public_token);
create index if not exists idx_parts_shop_id on public.parts(shop_id);
create index if not exists idx_parts_repair_id on public.parts(repair_id);
create index if not exists idx_insurance_notes_shop_id on public.insurance_notes(shop_id);
create index if not exists idx_insurance_notes_repair_id on public.insurance_notes(repair_id);
create index if not exists idx_photo_updates_shop_id on public.photo_updates(shop_id);
create index if not exists idx_photo_updates_repair_id on public.photo_updates(repair_id);
create index if not exists idx_pickup_checklists_shop_id on public.pickup_checklists(shop_id);
create index if not exists idx_pickup_checklists_repair_id on public.pickup_checklists(repair_id);
create index if not exists idx_review_messages_shop_id on public.review_messages(shop_id);

create or replace function public.is_shop_member(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members
    where shop_id = target_shop_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.accept_pending_invitation_for_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
begin
  for invite in
    select *
    from public.team_invitations
    where lower(email) = lower((auth.jwt() ->> 'email'))
      and status = 'pending'
  loop
    insert into public.team_members (shop_id, user_id, role)
    values (invite.shop_id, auth.uid(), invite.role)
    on conflict (shop_id, user_id) do nothing;

    update public.team_invitations
    set status = 'accepted'
    where id = invite.id;
  end loop;
end;
$$;

alter table public.shops enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.customers enable row level security;
alter table public.repairs enable row level security;
alter table public.parts enable row level security;
alter table public.insurance_notes enable row level security;
alter table public.photo_updates enable row level security;
alter table public.pickup_checklists enable row level security;
alter table public.review_messages enable row level security;
alter table public.settings enable row level security;

create policy "Shop owners can create shops" on public.shops
  for insert with check (owner_id = auth.uid());
create policy "Shop members can read shops" on public.shops
  for select using (owner_id = auth.uid() or public.is_shop_member(id));
create policy "Shop members can update shops" on public.shops
  for update using (owner_id = auth.uid() or public.is_shop_member(id));

create policy "Members can read team members" on public.team_members
  for select using (public.is_shop_member(shop_id) or user_id = auth.uid());
create policy "Owners can add team members" on public.team_members
  for insert with check (exists (select 1 from public.shops where id = shop_id and owner_id = auth.uid()));

create policy "Members can manage invitations" on public.team_invitations
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy "Members can manage customers" on public.customers
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy "Members can manage repairs" on public.repairs
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy "Members can manage parts" on public.parts
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy "Members can manage insurance notes" on public.insurance_notes
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy "Members can manage photo updates" on public.photo_updates
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy "Members can manage pickup checklists" on public.pickup_checklists
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy "Members can manage review messages" on public.review_messages
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy "Members can manage settings" on public.settings
  for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

insert into storage.buckets (id, name, public)
values ('repair-photos', 'repair-photos', true)
on conflict (id) do nothing;

drop policy if exists "Members can upload repair photos" on storage.objects;
create policy "Members can upload repair photos" on storage.objects
  for insert with check (
    bucket_id = 'repair-photos'
    and auth.role() = 'authenticated'
    and public.is_shop_member((storage.foldername(name))[1]::uuid)
  );

create policy "Repair photos are readable by link" on storage.objects
  for select using (bucket_id = 'repair-photos');

create or replace function public.get_public_repair_status(token_input uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'repair', jsonb_build_object(
      'id', r.id,
      'customer_name', c.name,
      'shop_name', s.name,
      'shop_phone', s.phone,
      'vehicle_year', r.vehicle_year,
      'vehicle_make', r.vehicle_make,
      'vehicle_model', r.vehicle_model,
      'ro_number', r.ro_number,
      'status', r.status,
      'estimated_pickup', r.estimated_pickup,
      'delay_reason', r.delay_reason,
      'next_update', r.next_update,
      'repair_notes', r.repair_notes
    ),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'url', p.url, 'created_at', p.created_at) order by p.created_at desc)
      from public.photo_updates p
      where p.repair_id = r.id
        and p.is_customer_visible = true
    ), '[]'::jsonb),
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object('id', pc.id, 'label', pc.label, 'done', pc.done, 'sort_order', pc.sort_order) order by pc.sort_order asc)
      from public.pickup_checklists pc
      where pc.repair_id = r.id
    ), '[]'::jsonb)
  )
  from public.repairs r
  join public.customers c on c.id = r.customer_id
  join public.shops s on s.id = r.shop_id
  where r.public_token = token_input
  limit 1;
$$;
