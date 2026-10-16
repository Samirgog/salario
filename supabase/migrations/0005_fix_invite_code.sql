-- Keep invite creation independent from optional pgcrypto installation state.
create or replace function public.create_invite(p_household_id uuid)
returns text
language plpgsql security definer set search_path=public
as $$
declare invite_code text;
begin
  if not is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  invite_code := md5(auth.uid()::text || clock_timestamp()::text || random()::text);
  insert into household_invites(household_id, code, created_by, expires_at)
  values (p_household_id, invite_code, auth.uid(), now() + interval '7 days');
  return invite_code;
end $$;
grant execute on function public.create_invite(uuid) to authenticated;
