-- The traveler's real-photo path stays an unreadable column (receivers see it only through storage after acceptance),
-- so the owner's Profile reads its own path through this.
create function my_photo_path() returns text language sql stable security definer set search_path = public as $$
  select photo_path from profiles where id = auth.uid()
$$;
