-- After paid: the 15% cut, bought with receipt and item photo, the receiver's photo check, swaps, "I'm in Addis" with an SMS code,
-- the phone reveal, handover, admin holds, refunds and payouts, and their deadlines.
-- Spec: docs/superpowers/specs/2026-10-29-after-paid-design.md. Apply inside begin;/commit;.

-- The cut ------------------------------------------------------------------------------

-- One row. Zakbis keeps this share of the traveler's reward (never of the item cost); locked on each order when the price is agreed.
create table settings (
  id boolean primary key default true check (id),
  fee_pct int not null check (fee_pct between 0 and 50)
);
insert into settings (fee_pct) values (15);
alter table settings enable row level security;
create policy "settings public" on settings for select to anon, authenticated using (true);

create function fee_pct() returns int language sql stable security definer set search_path = public as $$
  select fee_pct from settings
$$;

-- 15% applies to every order, including ones already agreed (user, 2026-10-29).
alter table requests drop column payout_etb, drop column fee_etb;
alter table requests add column fee_pct int not null default 15 check (fee_pct between 0 and 50);
alter table requests
  add column fee_etb int generated always as (round(reward_etb * fee_pct / 100.0)::int) stored,
  add column payout_etb int generated always as (round(unit_price * quantity * fx_rate)::int + reward_etb - round(reward_etb * fee_pct / 100.0)::int) stored;

create or replace function requests_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare
  shop date;
begin
  new.receiver_id := auth.uid();
  if new.receiver_id is null then raise exception 'login required'; end if;
  if (select first_name from profiles where id = new.receiver_id) is null then raise exception 'set up your receiver side first'; end if;
  if has_contact(new.item_name) or has_contact(new.notes) then raise exception 'please remove phone numbers, @handles, emails and links'; end if;
  new.status := 'open';
  new.reward_etb := null; -- the traveler names it; it's fixed when a price is accepted
  new.receipt_path := null;
  new.accepted_at := null;
  new.purchased_at := null;
  new.landed_at := null;
  new.answer_due_at := null;
  new.answer_reminded := false;
  new.payment_due_at := null;
  new.payment_left := null;
  new.payment_reminded := false;
  new.decline_reason := null;
  new.fee_pct := fee_pct(); -- the cut is Zakbis's to set, never the browser's
  select etb_per_unit into new.fx_rate from fx_rates where currency = new.currency;
  if not found then raise exception 'no fx rate for %', new.currency; end if;

  if new.kind = 'trip' then
    select traveler_id, shop_by into new.traveler_id, shop from trips where id = new.trip_id and shop_by >= addis_today() and status = 'live';
    if not found then raise exception 'trip is not available'; end if;
    if new.traveler_id = new.receiver_id then raise exception 'cannot request on your own trip'; end if;
    if not is_verified_traveler(new.traveler_id) then raise exception 'this traveler is not verified'; end if;
    new.answer_due_at := least(now() + interval '48 hours', end_of_addis_day(shop));
    new.answer_reminded := new.answer_due_at - now() <= interval '24 hours';
  else
    new.traveler_id := null;
    new.trip_id := null;
    if new.needed_by is null or new.needed_by not between addis_today() + 3 and addis_today() + 60 then
      raise exception 'needed by must be 3 to 60 days ahead';
    end if;
  end if;
  return new;
end $$;

create or replace function settle_offer(o offers, p_reward int) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
  t trips;
  due timestamptz;
  by_receiver boolean;
  x record;
begin
  select * into r from requests where id = o.request_id;
  by_receiver := auth.uid() = r.receiver_id;
  if not is_verified_traveler(o.traveler_id) then raise exception 'this traveler is not verified'; end if;
  select * into t from trips where id = o.trip_id and status = 'live' and shop_by >= addis_today();
  if not found or (r.kind = 'open' and not (t.origin_country = any (r.countries) and t.arrival_date <= r.needed_by and r.needed_by >= addis_today())) then
    raise exception 'this offer is no longer valid for the trip';
  end if;
  due := least(now() + interval '24 hours', end_of_addis_day(t.shop_by));
  update requests set traveler_id = o.traveler_id, trip_id = o.trip_id, reward_etb = p_reward, status = 'awaiting_payment',
    accepted_at = now(), updated_at = now(), fee_pct = fee_pct(), payment_due_at = due, payment_reminded = due - now() <= interval '4 hours'
    where id = r.id;
  update offers set status = 'accepted', suggestion_etb = case when by_receiver then suggestion_etb else p_reward end where id = o.id;
  perform log_offer(o.id, case when by_receiver then 'receiver' else 'traveler' end, 'accept', p_reward);
  for x in update offers set status = 'closed' where request_id = r.id and status = 'pending' returning id, traveler_id loop
    perform log_offer(x.id, null, 'close', null);
    perform notify(x.traveler_id, 'traveler', r.id, format('The receiver chose another traveler for %s', r.item_name));
  end loop;
  if by_receiver then
    perform notify(o.traveler_id, 'traveler', r.id, format('%s accepted %s for %s. We''ll tell you when they pay.', receiver_name(r.receiver_id), etb_text(p_reward), r.item_name));
  else
    perform notify(o.traveler_id, 'traveler', r.id, format('You accepted %s for %s. We''ll tell you when %s pays.', etb_text(p_reward), r.item_name, receiver_name(r.receiver_id)));
  end if;
  perform notify(r.receiver_id, 'receiver', r.id, format('%s for %s is agreed. Pay %s within 24 h.', etb_text(p_reward), r.item_name, etb_text(r.item_etb + p_reward)));
end $$;
