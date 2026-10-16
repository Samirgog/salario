-- Household onboarding and invite workflow. Calls run as the authenticated user.
create or replace function public.create_household(p_name text)
returns public.households
language plpgsql security definer set search_path=public
as $$
declare result public.households; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from profiles where id=current_user_id) then raise exception 'Profile not found'; end if;
  insert into households(name, created_by) values (trim(p_name), current_user_id) returning * into result;
  insert into household_members(household_id,user_id,role) values (result.id,current_user_id,'owner');
  return result;
end $$;

create or replace function public.create_invite(p_household_id uuid)
returns text
language plpgsql security definer set search_path=public
as $$
declare invite_code text;
begin
  if not is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  invite_code := encode(gen_random_bytes(12), 'hex');
  insert into household_invites(household_id, code, created_by, expires_at) values (p_household_id, invite_code, auth.uid(), now() + interval '7 days');
  return invite_code;
end $$;

create or replace function public.accept_invite(p_code text)
returns public.households
language plpgsql security definer set search_path=public
as $$
declare invite_row public.household_invites; result public.households;
begin
  select * into invite_row from household_invites where code=trim(p_code) and used_by is null and expires_at > now() for update;
  if not found then raise exception 'Invite is invalid or expired'; end if;
  insert into household_members(household_id,user_id,role) values (invite_row.household_id,auth.uid(),'member') on conflict do nothing;
  update household_invites set used_by=auth.uid(), used_at=now() where id=invite_row.id;
  select * into result from households where id=invite_row.household_id;
  return result;
end $$;

create or replace function public.create_list(p_household_id uuid, p_title text, p_kind public.list_kind default 'custom', p_mode public.list_mode default 'permanent')
returns public.lists
language plpgsql security definer set search_path=public
as $$
declare result public.lists;
begin
  if not is_household_member(p_household_id) then raise exception 'Not a household member'; end if;
  insert into lists(household_id,title,kind,mode,created_by) values(p_household_id,trim(p_title),p_kind,p_mode,auth.uid()) returning * into result;
  return result;
end $$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.create_list(uuid,text,public.list_kind,public.list_mode) to authenticated;
