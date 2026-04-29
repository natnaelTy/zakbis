-- ============================================================
-- Fix chats RLS for buy-me acceptance flow
-- ============================================================
-- The buy-me accept endpoint creates a chat after the request is accepted.
-- This policy makes the intended participant checks explicit for both
-- delivery and buy-me chats so the insert works consistently in production.

drop policy if exists "Participants can create chats" on chats;

create policy "Participants can create chats" on chats
  for insert with check (
    (
      delivery_request_id is not null and exists (
        select 1
        from delivery_requests dr
        join trips t on t.id = dr.trip_id
        where dr.id = chats.delivery_request_id
          and auth.uid() in (dr.sender_id, dr.receiver_id, t.traveler_id)
      )
    )
    or
    (
      buy_me_request_id is not null and exists (
        select 1
        from buy_me_requests bmr
        where bmr.id = chats.buy_me_request_id
          and auth.uid() in (bmr.receiver_id, bmr.traveler_id)
      )
    )
  );