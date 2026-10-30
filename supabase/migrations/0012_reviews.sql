-- Reviews: both sides review each other after a paid order ends; hidden until both have reviewed or 14 days pass;
-- tags, optional comment, private note to Zakbis; reports, low-rating flags and receiver blocks.
-- Spec: docs/superpowers/specs/2026-10-30-reviews-design.md. Apply inside begin;/commit;.

-- Reviews -------------------------------------------------------------------------------------------

alter table reviews alter column text drop not null;
alter table reviews
  add column side text check (side in ('traveler', 'receiver')), -- the side of the person reviewed
  add column tags text[] not null default '{}',
  add column visible_at timestamptz,
  add column hidden_at timestamptz,          -- an admin hid it after a report
  add column reported_at timestamptz,
  add column report_reason text check (report_reason in ('contact', 'abusive', 'untrue')),
  add column report_kept_at timestamptz;
-- Reviews written before this piece stay visible.
update reviews v set side = case when v.author_id = r.receiver_id then 'traveler' else 'receiver' end, visible_at = v.created_at
  from requests r where r.id = v.request_id;
alter table reviews alter column side set not null;

-- Only admins read these (through reviews_about); no policies at all.
create table review_notes (
  review_id uuid primary key references reviews on delete cascade,
  note text not null check (length(note) <= 1000)
);
alter table review_notes enable row level security;

alter table requests
  add column review_open_at timestamptz,
  add column review_reminded boolean not null default false;

-- Delivered, or a refund decided after payment: both sides get 14 days to review.
create function requests_review_window() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.review_open_at is null and new.traveler_id is not null
     and ((new.status = 'delivered' and old.status is distinct from 'delivered') or (old.refund_decided_at is null and new.refund_decided_at is not null)) then
    new.review_open_at := now();
    perform notify(new.receiver_id, 'receiver', new.id, format('How was %s? Leave a review for %s.', traveler_name(new.traveler_id), new.item_name));
    perform notify(new.traveler_id, 'traveler', new.id, format('How was %s? Leave a review for %s.', receiver_name(new.receiver_id), new.item_name));
  end if;
  return new;
end $$;
create trigger requests_review_window before update on requests for each row execute function requests_review_window();

create or replace function can_review(p_request uuid, p_author uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from requests r
    where r.id = p_request and r.review_open_at is not null and now() <= r.review_open_at + interval '14 days'
      and ((p_author = r.receiver_id and p_subject = r.traveler_id) or (p_author = r.traveler_id and p_subject = r.receiver_id))
  )
$$;

-- Same keys as TRAVELER_TAGS / RECEIVER_TAGS in lib/reviews.ts.
create function review_tag_ok(p_side text, p_tags text[]) returns boolean language sql immutable as $$
  select p_tags <@ case p_side when 'traveler' then array['easy_to_reach', 'on_time', 'polite', 'as_described']
                               else array['easy_to_reach', 'on_time', 'polite', 'clear_request'] end
$$;

create table review_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  side text not null check (side in ('traveler', 'receiver')),
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,
  decision text check (decision in ('dismiss', 'revoke', 'block'))
);
alter table review_flags enable row level security;

create table blocked_receivers (
  user_id uuid primary key references profiles on delete cascade,
  blocked_at timestamptz not null default now(),
  blocked_by uuid references profiles
);
alter table blocked_receivers enable row level security;

create function is_blocked_receiver(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocked_receivers where user_id = uid)
$$;

create function notify_admins(p_body text) returns void language sql security definer set search_path = public as $$
  select notify(id, 'receiver', null, p_body) from profiles where is_admin
$$;

-- Flags a person when, among visible reviews about them on that side, 2 of the last 10 are 1-2 stars, or 3+ average under 3.5.
-- Once until an admin decides; after a dismissal, only a newer 1-2 star review brings them back.
create function check_flags(p_user uuid, p_side text) returns void language plpgsql security definer set search_path = public as $$
declare
  dismissed timestamptz;
  low int;
  n int;
  average numeric;
begin
  if p_user is null or exists (select 1 from review_flags where user_id = p_user and side = p_side and decided_at is null) then return; end if;
  if (p_side = 'receiver' and is_blocked_receiver(p_user)) or (p_side = 'traveler' and not is_verified_traveler(p_user)) then return; end if;
  select max(decided_at) into dismissed from review_flags where user_id = p_user and side = p_side and decision = 'dismiss';
  if dismissed is not null and not exists (select 1 from reviews where subject_id = p_user and side = p_side and hidden_at is null
                                           and visible_at > dismissed and rating <= 2) then
    return;
  end if;
  select count(*) filter (where rating <= 2) into low from (
    select rating from reviews where subject_id = p_user and side = p_side and visible_at is not null and hidden_at is null
    order by visible_at desc limit 10) last10;
  select count(*), avg(rating) into n, average from reviews where subject_id = p_user and side = p_side and visible_at is not null and hidden_at is null;
  if low >= 2 or (n >= 3 and average < 3.5) then
    insert into review_flags (user_id, side) values (p_user, p_side);
    perform notify_admins(format('Reviews to check: %s (%s) has low ratings.',
      case p_side when 'traveler' then traveler_name(p_user) else receiver_name(p_user) end, p_side));
  end if;
end $$;

create function submit_review(p_request uuid, p_rating int, p_tags text[] default '{}', p_text text default null, p_private text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r requests;
  subject uuid;
  side text;
  body text := nullif(trim(p_text), '');
  note text := nullif(trim(p_private), '');
  new_id uuid;
begin
  select * into r from requests where id = p_request for update;
  if not found or uid is null or uid not in (r.receiver_id, r.traveler_id) or r.review_open_at is null then raise exception 'you can''t review this order'; end if;
  if now() > r.review_open_at + interval '14 days' then raise exception 'time is up'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'choose a rating from 1 to 5'; end if;
  subject := case when uid = r.receiver_id then r.traveler_id else r.receiver_id end;
  side := case when uid = r.receiver_id then 'traveler' else 'receiver' end;
  if not review_tag_ok(side, coalesce(p_tags, '{}')) then raise exception 'unknown tag'; end if;
  if length(body) > 1000 or length(note) > 1000 then raise exception 'keep it under 1,000 characters'; end if;
  if has_contact(body) then raise exception 'please remove phone numbers, @handles, emails and links'; end if;
  if exists (select 1 from reviews where request_id = r.id and author_id = uid) then raise exception 'you already reviewed this order'; end if;
  insert into reviews (request_id, author_id, subject_id, side, rating, tags, text)
    values (r.id, uid, subject, side, p_rating, coalesce(p_tags, '{}'), body) returning id into new_id;
  if note is not null then insert into review_notes (review_id, note) values (new_id, note); end if;
  -- Both sides have now reviewed: show both, and check both people's records.
  if exists (select 1 from reviews where request_id = r.id and author_id = subject) then
    update reviews set visible_at = clock_timestamp() where request_id = r.id and visible_at is null;
    perform check_flags(subject, side);
    perform check_flags(uid, case side when 'traveler' then 'receiver' else 'traveler' end);
  end if;
  return new_id;
end $$;

drop policy "write own review" on reviews;
drop policy "reviews public" on reviews;
create policy "visible reviews" on reviews for select to anon, authenticated using (
  (visible_at is not null and hidden_at is null) or author_id = auth.uid() or is_admin()
);

-- Ratings count only visible reviews.
create or replace view traveler_stats as
  select p.id as traveler_id,
    (select round(avg(v.rating), 1)::numeric(2,1) from reviews v
      where v.subject_id = p.id and v.side = 'traveler' and v.visible_at is not null and v.hidden_at is null) as rating,
    (select count(*) from reviews v
      where v.subject_id = p.id and v.side = 'traveler' and v.visible_at is not null and v.hidden_at is null) as review_count,
    (select count(*) from requests r where r.traveler_id = p.id and r.status in ('delivered', 'paid_out')) as deliveries,
    is_verified_traveler(p.id) as verified
  from profiles p;
create or replace view receiver_stats as
  select p.id as receiver_id,
    (select round(avg(v.rating), 1)::numeric(2,1) from reviews v
      where v.subject_id = p.id and v.side = 'receiver' and v.visible_at is not null and v.hidden_at is null) as rating,
    (select count(*) from reviews v
      where v.subject_id = p.id and v.side = 'receiver' and v.visible_at is not null and v.hidden_at is null) as review_count
  from profiles p;
create view review_tag_counts as
  select v.subject_id, v.side, t.tag, count(*)::int as n
  from reviews v cross join lateral unnest(v.tags) as t(tag)
  where v.visible_at is not null and v.hidden_at is null
  group by v.subject_id, v.side, t.tag;
grant select on review_tag_counts to anon, authenticated;

revoke execute on function check_flags(uuid, text), notify_admins(text), is_blocked_receiver(uuid) from public, anon, authenticated;

-- Deadlines (the every-minute cron already calls run_deadlines) ------------------------------------------

create or replace function run_deadlines() returns void language plpgsql security definer set search_path = public as $$
declare
  x record;
  rq requests;
begin
  -- 1. Trip requests the traveler never answered.
  for x in update requests r set status = 'expired', updated_at = now()
           where r.kind = 'trip' and r.status = 'open' and r.answer_due_at < now()
             and not exists (select 1 from offers o where o.request_id = r.id)
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('%s didn''t answer in time, so your request for %s closed.', traveler_name(x.traveler_id), x.item_name));
    perform notify(x.traveler_id, 'traveler', x.id, format('You didn''t answer in time, so the request for %s closed.', x.item_name));
  end loop;

  -- 2. Reminder 24 hours before the first answer is due.
  for x in update requests r set answer_reminded = true
           where r.kind = 'trip' and r.status = 'open' and not r.answer_reminded and r.answer_due_at - now() <= interval '24 hours'
             and not exists (select 1 from offers o where o.request_id = r.id)
           returning r.id, r.receiver_id, r.traveler_id, r.item_name, r.answer_due_at loop
    perform notify(x.traveler_id, 'traveler', x.id, format('Reminder: %s h left to answer %s about %s', hours_left(x.answer_due_at), receiver_name(x.receiver_id), x.item_name));
  end loop;

  -- 3. Pricing turns that ran out. A trip request has only this offer, so it ends too.
  for x in update offers o set status = 'expired'
           from requests r where r.id = o.request_id and o.status = 'pending' and o.due_at < now()
           returning o.id, o.traveler_id, r.id as rid, r.kind, r.receiver_id, r.item_name loop
    perform log_offer(x.id, null, 'expire', null);
    if x.kind = 'trip' then update requests set status = 'expired', updated_at = now() where id = x.rid and status = 'open'; end if;
    perform notify(x.receiver_id, 'receiver', x.rid, format('Time ran out on %s''s offer for %s, so it closed in time.', traveler_name(x.traveler_id), x.item_name));
    perform notify(x.traveler_id, 'traveler', x.rid, format('Time ran out on your offer for %s, so it closed in time.', x.item_name));
  end loop;

  -- 4. Reminder 4 hours before a pricing turn ends, to whoever's turn it is.
  for x in update offers o set reminded = true
           from requests r where r.id = o.request_id and o.status = 'pending' and not o.reminded and o.due_at - now() <= interval '4 hours'
           returning o.turn, o.traveler_id, o.due_at, r.id as rid, r.receiver_id, r.item_name loop
    if x.turn = 'receiver' then
      perform notify(x.receiver_id, 'receiver', x.rid, format('Reminder: %s h left to answer %s about %s', hours_left(x.due_at), traveler_name(x.traveler_id), x.item_name));
    else
      perform notify(x.traveler_id, 'traveler', x.rid, format('Reminder: %s h left to answer %s about %s', hours_left(x.due_at), receiver_name(x.receiver_id), x.item_name));
    end if;
  end loop;

  -- 5. Open requests past their needed-by date.
  for x in update requests r set status = 'expired', updated_at = now()
           where r.kind = 'open' and r.status = 'open' and r.needed_by < addis_today()
           returning r.id, r.receiver_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('Your request for %s reached its needed-by date and closed.', x.item_name));
    perform log_offer(o.id, null, 'close', null) from offers o where o.request_id = x.id and o.status = 'pending';
    perform notify(o.traveler_id, 'traveler', x.id, format('The request for %s closed.', x.item_name)) from offers o where o.request_id = x.id and o.status = 'pending';
    update offers set status = 'closed' where request_id = x.id and status = 'pending';
  end loop;

  -- 6. Orders not paid in time (a waiting screenshot stops the clock).
  for x in update requests r set status = 'cancelled', updated_at = now()
           where r.status = 'awaiting_payment' and r.payment_due_at < now() and not has_pending_escrow(r.id)
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('You didn''t pay for %s in time, so the order was cancelled.', x.item_name));
    perform notify(x.traveler_id, 'traveler', x.id, format('%s didn''t pay for %s in time, so the order was cancelled.', receiver_name(x.receiver_id), x.item_name));
  end loop;

  -- 7. Reminder 4 hours before payment is due.
  for x in update requests r set payment_reminded = true
           where r.status = 'awaiting_payment' and not r.payment_reminded and r.payment_due_at - now() <= interval '4 hours'
             and not has_pending_escrow(r.id)
           returning r.id, r.receiver_id, r.item_name, r.payment_due_at loop
    perform notify(x.receiver_id, 'receiver', x.id, format('Reminder: %s h left to pay for %s', hours_left(x.payment_due_at), x.item_name));
  end loop;

  -- 8. The receiver didn't check the item photo in time: it counts as looks right.
  for x in update requests r set photo_status = 'ok', updated_at = now()
           where r.status = 'purchased' and r.photo_status = 'pending' and r.photo_due_at < now() and r.hold is null
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.traveler_id, 'traveler', x.id, format('%s didn''t answer in time, so the photo of %s counts as right.', receiver_name(x.receiver_id), x.item_name));
  end loop;

  -- 9. Not marked bought by the buying deadline: an admin decides (the traveler may have bought without uploading).
  for x in update requests r set hold = 'not_bought', held_at = now(), updated_at = now()
           where r.status = 'paid' and r.hold is null and buy_due(r) < now()
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('%s hasn''t marked %s bought yet. Zakbis is looking into it.', traveler_name(x.traveler_id), x.item_name));
    perform notify(x.traveler_id, 'traveler', x.id, format('You didn''t mark %s bought in time. Zakbis will contact you.', x.item_name));
  end loop;

  -- 10. "Not right" and no swap by the buying deadline: cancelled and refunded.
  for rq in select * from requests q where q.status = 'purchased' and q.photo_status = 'rejected' and q.hold is null and buy_due(q) < now() for update loop
    perform decide_refund(rq, format('%s didn''t swap %s in time, so the order is cancelled. We''ll refund you %s.', traveler_name(rq.traveler_id), rq.item_name, etb_text(rq.total_etb)),
      format('You didn''t swap %s in time, so the order is cancelled.', rq.item_name));
  end loop;

  -- 11. The traveler never said they're in Addis, a week after the arrival date: cancelled and refunded.
  for rq in select q.* from requests q join trips t on t.id = q.trip_id
           where q.status = 'purchased' and q.hold is null and addis_today() > t.arrival_date + 7 for update of q loop
    perform decide_refund(rq, format('%s didn''t arrive with %s, so the order is cancelled. We''ll refund you %s.', traveler_name(rq.traveler_id), rq.item_name, etb_text(rq.total_etb)),
      format('You didn''t mark yourself in Addis within a week of landing, so the order for %s is cancelled.', rq.item_name));
  end loop;

  -- 12. A week after "I'm in Addis" with no handover: the traveler is paid if the receiver had their number, otherwise an admin decides.
  for rq in select * from requests q where q.status = 'landed' and q.hold is null and q.handover_due_at < now() for update loop
    if phone_of(rq.receiver_id) is not null then
      update requests set status = 'delivered', delivered_by_timeout = true, updated_at = now() where id = rq.id;
      perform notify(rq.traveler_id, 'traveler', rq.id, format('%s didn''t meet you within a week. We''ll send you %s for %s.', receiver_name(rq.receiver_id), etb_text(rq.payout_etb), rq.item_name));
      perform notify(rq.receiver_id, 'receiver', rq.id, format('You didn''t meet %s within a week, so the order for %s is closed.', traveler_name(rq.traveler_id), rq.item_name));
    else
      update requests set hold = 'no_receiver_phone', held_at = now(), updated_at = now() where id = rq.id;
      perform notify(rq.traveler_id, 'traveler', rq.id, format('%s never confirmed their number. Zakbis will look into %s.', receiver_name(rq.receiver_id), rq.item_name));
    end if;
  end loop;

  -- 13. Reminders: the last day to buy (traveler), and the arrival day (receiver).
  for x in update requests r set buy_reminded = true from trips t
           where t.id = r.trip_id and r.status = 'paid' and r.hold is null and not r.buy_reminded and addis_today() = t.shop_by
           returning r.id, r.traveler_id, r.item_name loop
    perform notify(x.traveler_id, 'traveler', x.id, format('Today is the last day to buy %s.', x.item_name));
  end loop;
  for x in update requests r set arrival_reminded = true from trips t
           where t.id = r.trip_id and r.status = 'purchased' and r.hold is null and not r.arrival_reminded and addis_today() >= t.arrival_date
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('%s is due in Addis today. We''ll tell you when they''re here.', traveler_name(x.traveler_id)));
  end loop;

  -- 14. Handover reminders to the receiver on days 3 and 6 of the week.
  for x in update requests r set handover_reminders = handover_reminders + 1
           where r.status = 'landed' and r.hold is null
             and ((r.handover_reminders < 1 and now() > r.landed_at + interval '3 days') or (r.handover_reminders < 2 and now() > r.landed_at + interval '6 days'))
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    if phone_of(x.receiver_id) is not null then
      perform notify(x.receiver_id, 'receiver', x.id, format('%s is waiting to hand over %s. Call them on %s.', traveler_name(x.traveler_id), x.item_name, display_phone(phone_of(x.traveler_id))));
    else
      perform notify(x.receiver_id, 'receiver', x.id, format('%s is waiting to hand over %s. Confirm your phone number to meet them.', traveler_name(x.traveler_id), x.item_name));
    end if;
  end loop;

  -- 15. Reviews still hidden when the 14-day window closes: show them anyway, and check the people reviewed.
  for x in update reviews v set visible_at = clock_timestamp() from requests q
           where q.id = v.request_id and v.visible_at is null and q.review_open_at + interval '14 days' < now()
           returning v.subject_id, v.side loop
    perform check_flags(x.subject_id, x.side);
  end loop;

  -- 16. A week into the window: remind whoever hasn't reviewed yet.
  for x in update requests q set review_reminded = true
           where q.review_open_at is not null and not q.review_reminded
             and now() > q.review_open_at + interval '7 days' and now() < q.review_open_at + interval '14 days'
           returning q.id, q.receiver_id, q.traveler_id, q.item_name loop
    if not exists (select 1 from reviews where request_id = x.id and author_id = x.receiver_id) then
      perform notify(x.receiver_id, 'receiver', x.id, format('A week left to review %s for %s.', traveler_name(x.traveler_id), x.item_name));
    end if;
    if not exists (select 1 from reviews where request_id = x.id and author_id = x.traveler_id) then
      perform notify(x.traveler_id, 'traveler', x.id, format('A week left to review %s for %s.', receiver_name(x.receiver_id), x.item_name));
    end if;
  end loop;
end $$;

-- Keeping reviews clean: reports, admin decisions on flags, receiver blocks ------------------------------------

-- The person reviewed reports a visible review once; an admin hides or keeps it.
create function report_review(p_review uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare
  v reviews;
begin
  select * into v from reviews where id = p_review for update;
  if not found or v.subject_id is distinct from auth.uid() or v.visible_at is null or v.hidden_at is not null then
    raise exception 'only the person reviewed can report a review';
  end if;
  if p_reason is null or p_reason not in ('contact', 'abusive', 'untrue') then raise exception 'choose a reason'; end if;
  if v.reported_at is not null then raise exception 'you already reported this review'; end if;
  update reviews set reported_at = now(), report_reason = p_reason where id = v.id;
  perform notify_admins(format('A review of %s was reported: %s.',
    case v.side when 'traveler' then traveler_name(v.subject_id) else receiver_name(v.subject_id) end,
    case p_reason when 'contact' then 'contact details' when 'abusive' then 'abusive' else 'not true' end));
end $$;

create function decide_report(p_review uuid, p_hide boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update reviews set hidden_at = case when p_hide then now() end, report_kept_at = case when not p_hide then now() end
    where id = p_review and reported_at is not null and hidden_at is null and report_kept_at is null;
  if not found then raise exception 'this report was already decided'; end if;
end $$;

-- Closes a receiver's unpaid activity (open requests, pending offers, orders waiting for payment with no screenshot) and blocks new ones.
create function block_receiver(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  x record;
  t uuid;
begin
  insert into blocked_receivers (user_id, blocked_by) values (p_user, auth.uid()) on conflict do nothing;
  for x in update requests set status = 'cancelled', updated_at = now()
           where receiver_id = p_user and (status = 'open' or (status = 'awaiting_payment' and not has_pending_escrow(id)))
           returning id, traveler_id, item_name loop
    perform log_offer(o.id, null, 'close', null) from offers o where o.request_id = x.id and o.status = 'pending';
    for t in with c as (update offers set status = 'closed' where request_id = x.id and status = 'pending' returning traveler_id)
             select traveler_id from c union select x.traveler_id where x.traveler_id is not null loop
      perform notify(t, 'traveler', x.id, format('The request for %s closed.', x.item_name));
    end loop;
  end loop;
end $$;

-- dismiss for anyone; revoke a traveler's verification; block a receiver from new requests.
create function resolve_flag(p_flag uuid, p_action text) returns void language plpgsql security definer set search_path = public as $$
declare
  f review_flags;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select * into f from review_flags where id = p_flag for update;
  if not found or f.decided_at is not null then raise exception 'this flag was already decided'; end if;
  if p_action = 'revoke' and f.side = 'traveler' then
    perform decide_verification(f.user_id, false, 'Other');
  elsif p_action = 'block' and f.side = 'receiver' then
    perform block_receiver(f.user_id);
  elsif p_action <> 'dismiss' then
    raise exception 'that is not an option for this flag';
  end if;
  update review_flags set decided_at = clock_timestamp(), decision = p_action where id = f.id;
end $$;

create function unblock_receiver(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  delete from blocked_receivers where user_id = p_user;
end $$;

-- Open flags, undecided reports and blocked receivers, for the admin Reviews page.
create function reviews_to_check() returns table (
  kind text, flag_id uuid, review_id uuid, user_id uuid, side text, name text, created_at timestamptz,
  rating int, report_reason text, review_text text, blocked boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  return query
    select 'flag'::text, f.id, null::uuid, f.user_id, f.side,
           case f.side when 'traveler' then traveler_name(f.user_id) else receiver_name(f.user_id) end,
           f.created_at, null::int, null::text, null::text, is_blocked_receiver(f.user_id)
      from review_flags f where f.decided_at is null
    union all
    select 'report', null, v.id, v.subject_id, v.side,
           case v.side when 'traveler' then traveler_name(v.subject_id) else receiver_name(v.subject_id) end,
           v.reported_at, v.rating, v.report_reason, v.text, false
      from reviews v where v.reported_at is not null and v.hidden_at is null and v.report_kept_at is null
    union all
    select 'blocked', null, null, b.user_id, 'receiver', receiver_name(b.user_id), b.blocked_at, null, null, null, true
      from blocked_receivers b
    order by 7;
end $$;

-- The last 20 reviews about someone on one side, hidden ones and private notes included.
create function reviews_about(p_user uuid, p_side text) returns table (
  review_id uuid, rating int, tags text[], text text, note text, author_name text, created_at timestamptz, hidden_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  return query
    select v.id, v.rating, v.tags, v.text, n.note,
           case v.side when 'traveler' then receiver_name(v.author_id) else traveler_name(v.author_id) end, v.created_at, v.hidden_at
    from reviews v left join review_notes n on n.review_id = v.id
    where v.subject_id = p_user and v.side = p_side
    order by v.created_at desc limit 20;
end $$;

revoke execute on function block_receiver(uuid) from public, anon, authenticated;

-- A blocked receiver can't post, price or pay.
create or replace function requests_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare
  shop date;
begin
  new.receiver_id := auth.uid();
  if new.receiver_id is null then raise exception 'login required'; end if;
  if is_blocked_receiver(new.receiver_id) then raise exception 'your account can''t make new requests'; end if;
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

create or replace function check_turn(o offers, r requests, p_who text) returns void language plpgsql stable as $$
begin
  if p_who = 'receiver' and is_blocked_receiver(auth.uid()) then raise exception 'your account can''t make new requests'; end if;
  if p_who = 'receiver' and r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can do that'; end if;
  if p_who = 'traveler' and o.traveler_id is distinct from auth.uid() then raise exception 'only the traveler can do that'; end if;
  if o.status <> 'pending' or r.status <> 'open' then raise exception 'this offer is no longer valid'; end if;
  if o.turn <> p_who then raise exception 'not your turn'; end if;
  if o.due_at < now() then raise exception 'time is up'; end if;
end $$;

create or replace function submit_payment(p_request uuid, p_method text, p_proof text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r requests;
  new_id uuid;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can pay'; end if;
  if is_blocked_receiver(auth.uid()) then raise exception 'your account can''t make new requests'; end if;
  if r.status <> 'awaiting_payment' then raise exception 'this order is not waiting for payment'; end if;
  if has_pending_escrow(r.id) then raise exception 'we already have your screenshot; we''re checking it'; end if;
  if r.payment_due_at < now() then raise exception 'time is up'; end if;
  if not exists (select 1 from trips where id = r.trip_id and status = 'live') then raise exception 'this trip is no longer open'; end if;
  if p_method is null or p_method not in ('telebirr', 'bank') then raise exception 'choose Telebirr or bank'; end if;
  if p_proof is null or split_part(p_proof, '/', 1) <> auth.uid()::text
     or not exists (select 1 from storage.objects where bucket_id = 'proofs' and name = p_proof) then
    raise exception 'upload your payment screenshot';
  end if;
  insert into payments (request_id, kind, amount_etb, proof_path, method) values (r.id, 'escrow', r.total_etb, p_proof, p_method)
    returning id into new_id;
  update requests set payment_left = payment_due_at - now() where id = r.id;
  perform notify(r.traveler_id, 'traveler', r.id, format('%s sent payment for %s. We''re checking it.', receiver_name(r.receiver_id), r.item_name));
  return new_id;
end $$;
