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

-- Filled in below (Keeping reviews clean): flags a person whose visible reviews turn low.
create function check_flags(p_user uuid, p_side text) returns void language plpgsql security definer set search_path = public as $$
begin
  null;
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
    update reviews set visible_at = now() where request_id = r.id and visible_at is null;
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

revoke execute on function check_flags(uuid, text) from public, anon, authenticated;

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
  for x in update reviews v set visible_at = now() from requests q
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
