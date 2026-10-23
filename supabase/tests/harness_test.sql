-- The stand-in auth.uid() reads the user the test sets, like Supabase does.
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000aa';
do $$ begin
  assert auth.uid() = '00000000-0000-0000-0000-0000000000aa', 'auth.uid() follows request.jwt.claim.sub';
end $$;
rollback;
