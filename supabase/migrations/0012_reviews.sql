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
