-- Optional ClaimTrack sample data.
-- This creates an authenticated RPC. It uses the caller's current shop through RLS instead of hardcoded service-role inserts.

create or replace function public.seed_claimtrack_sample_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_shop_id uuid;
  customer_one uuid;
  customer_two uuid;
  repair_one uuid;
  repair_two uuid;
  repair_three uuid;
begin
  select shop_id into target_shop_id
  from public.team_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if target_shop_id is null then
    raise exception 'No shop found for current user.';
  end if;

  if exists (select 1 from public.repairs where shop_id = target_shop_id) then
    raise exception 'This shop already has repair records.';
  end if;

  insert into public.customers (shop_id, name, phone, email)
  values
    (target_shop_id, 'Alex Rivera', '555-0104', 'alex.rivera@example.com')
  returning id into customer_one;

  insert into public.customers (shop_id, name, phone, email)
  values
    (target_shop_id, 'Maya Thompson', '555-0118', 'maya.thompson@example.com')
  returning id into customer_two;

  insert into public.repairs (shop_id, customer_id, vehicle_year, vehicle_make, vehicle_model, ro_number, insurance_company, claim_number, status, estimated_pickup, delay_reason, next_update, repair_notes)
  values
    (target_shop_id, customer_one, '2021', 'Dodge', 'Charger', 'RO-1042', 'State Farm', 'CLM-44591', 'Parts Ordered', 'Jun 14', 'Bumper cover backorder', 'Update customer Friday', 'Rear cover removed. Waiting on OEM bumper cover.')
  returning id into repair_one;

  insert into public.repairs (shop_id, customer_id, vehicle_year, vehicle_make, vehicle_model, ro_number, insurance_company, claim_number, status, estimated_pickup, delay_reason, next_update, repair_notes)
  values
    (target_shop_id, customer_two, '2020', 'Toyota', 'Camry', 'RO-1043', 'Progressive', 'CLM-44592', 'Insurance Review', 'Jun 18', 'Waiting on supplement approval', 'Call adjuster', 'Supplement sent with tear-down photos.')
  returning id into repair_two;

  insert into public.repairs (shop_id, customer_id, vehicle_year, vehicle_make, vehicle_model, ro_number, insurance_company, claim_number, status, estimated_pickup, delay_reason, next_update, repair_notes)
  values
    (target_shop_id, customer_one, '2019', 'Chevrolet', 'Silverado', 'RO-1044', 'GEICO', 'CLM-44593', 'Ready for Pickup', 'Today', 'None', 'Collect deductible', 'Quality check complete. Vehicle is ready at the front counter.')
  returning id into repair_three;

  insert into public.parts (shop_id, repair_id, name, status, eta, delay_reason)
  values
    (target_shop_id, repair_one, 'Rear bumper cover', 'Backordered', 'Jun 11', 'OEM cover not in local warehouse'),
    (target_shop_id, repair_two, 'Left headlamp bracket', 'Ordered', 'Jun 10', 'Waiting on vendor confirmation');

  insert into public.insurance_notes (shop_id, repair_id, note, supplement_status, adjuster_contact, approval_status)
  values
    (target_shop_id, repair_two, 'Supplement sent with photos after tear-down.', 'Submitted', 'Jordan Smith, 555-0148', 'Waiting');

  insert into public.photo_updates (shop_id, repair_id, label, url, is_customer_visible)
  values
    (target_shop_id, repair_one, 'Check-in damage', 'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200', true);

  insert into public.pickup_checklists (shop_id, repair_id, label, done, sort_order)
  select target_shop_id, repair_three, label, sort_order < 5, sort_order
  from unnest(array[
    'Final wash complete',
    'Quality check complete',
    'Customer notified',
    'Deductible collected',
    'Paperwork ready',
    'Keys ready',
    'Review request sent'
  ]) with ordinality as item(label, sort_order);

  insert into public.review_messages (shop_id, repair_id, message_type, body)
  values
    (target_shop_id, repair_three, 'review_request', 'Thanks for trusting us with your repair. If everything looks good after pickup, a review helps local drivers find our shop.');
end;
$$;
