-- Reopening an invite link from the same Telegram account must keep the user in the family.
create or replace function public.accept_invite(p_code text)
returns public.households
language plpgsql security definer set search_path=public
as $$
declare invite_row public.household_invites; result public.households;
begin
  select * into invite_row from household_invites where code=trim(p_code) for update;
  if not found then raise exception 'Invite is invalid or expired'; end if;
  if invite_row.used_by is not null and invite_row.used_by <> auth.uid() then raise exception 'Invite is already used'; end if;
  if invite_row.expires_at <= now() then raise exception 'Invite is expired'; end if;
  insert into household_members(household_id,user_id,role) values (invite_row.household_id,auth.uid(),'member') on conflict do nothing;
  update household_invites set used_by=auth.uid(), used_at=coalesce(used_at,now()) where id=invite_row.id;
  select * into result from households where id=invite_row.household_id;
  return result;
end $$;
grant execute on function public.accept_invite(text) to authenticated;
