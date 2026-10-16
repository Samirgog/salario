-- User-facing CRUD RPCs keep required ownership columns server-side and make the client safe by default.
create or replace function public.create_section(p_list_id uuid, p_title text, p_period_start date, p_period_end date, p_planned_for date)
returns public.list_sections language plpgsql security definer set search_path=public as $$
declare result public.list_sections; list_row public.lists;
begin
  select * into list_row from lists where id=p_list_id;
  if not found or not is_household_member(list_row.household_id) then raise exception 'List is not accessible'; end if;
  insert into list_sections(list_id,household_id,title,period_start,period_end,planned_for,status)
  values(p_list_id,list_row.household_id,trim(p_title),p_period_start,p_period_end,p_planned_for,case when p_period_start <= current_date and p_period_end >= current_date then 'active'::section_status else 'planned'::section_status end)
  returning * into result;
  return result;
end $$;

create or replace function public.create_item(p_list_id uuid, p_section_id uuid, p_title text, p_quantity numeric default 1, p_unit text default null, p_price numeric default null)
returns public.list_items language plpgsql security definer set search_path=public as $$
declare result public.list_items; list_row public.lists;
begin
  select * into list_row from lists where id=p_list_id;
  if not found or not is_household_member(list_row.household_id) then raise exception 'List is not accessible'; end if;
  if p_section_id is not null and not exists(select 1 from list_sections where id=p_section_id and list_id=p_list_id and household_id=list_row.household_id) then raise exception 'Section is not accessible'; end if;
  insert into list_items(household_id,list_id,section_id,title,quantity,unit,price,created_by) values(list_row.household_id,p_list_id,p_section_id,trim(p_title),p_quantity,p_unit,p_price,auth.uid()) returning * into result;
  return result;
end $$;

create or replace function public.update_list(p_id uuid, p_title text, p_icon text default null, p_color text default null, p_mode public.list_mode default null)
returns public.lists language plpgsql security definer set search_path=public as $$
declare result public.lists;
begin
  update lists set title=trim(p_title),icon=p_icon,color=p_color,mode=coalesce(p_mode,mode) where id=p_id and is_household_member(household_id) returning * into result;
  if not found then raise exception 'List is not accessible'; end if; return result;
end $$;

create or replace function public.delete_list(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin delete from lists where id=p_id and is_household_member(household_id); if not found then raise exception 'List is not accessible'; end if; end $$;

create or replace function public.update_item(p_id uuid, p_title text, p_quantity numeric, p_unit text, p_price numeric, p_is_done boolean)
returns public.list_items language plpgsql security definer set search_path=public as $$
declare result public.list_items;
begin update list_items set title=trim(p_title),quantity=p_quantity,unit=p_unit,price=p_price,is_done=p_is_done,done_at=case when p_is_done then coalesce(done_at,now()) else null end,done_by=case when p_is_done then auth.uid() else null end where id=p_id and is_household_member(household_id) returning * into result; if not found then raise exception 'Item is not accessible'; end if; return result; end $$;

create or replace function public.delete_item(p_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin delete from list_items where id=p_id and is_household_member(household_id); if not found then raise exception 'Item is not accessible'; end if; end $$;

create or replace function public.update_goal(p_id uuid, p_title text, p_target_amount numeric) returns public.savings_goals language plpgsql security definer set search_path=public as $$ declare result public.savings_goals; begin update savings_goals set title=trim(p_title),target_amount=p_target_amount where id=p_id and is_household_member(household_id) returning * into result; if not found then raise exception 'Goal is not accessible'; end if; return result; end $$;
create or replace function public.delete_goal(p_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin delete from savings_goals where id=p_id and is_household_member(household_id); if not found then raise exception 'Goal is not accessible'; end if; end $$;
create or replace function public.add_contribution(p_goal_id uuid, p_amount numeric, p_note text default null) returns public.savings_contributions language plpgsql security definer set search_path=public as $$ declare result public.savings_contributions; goal_row public.savings_goals; begin select * into goal_row from savings_goals where id=p_goal_id; if not found or not is_household_member(goal_row.household_id) then raise exception 'Goal is not accessible'; end if; insert into savings_contributions(goal_id,household_id,amount,note,user_id) values(p_goal_id,goal_row.household_id,p_amount,p_note,auth.uid()) returning * into result; return result; end $$;

grant execute on function public.create_section(uuid,text,date,date,date) to authenticated;
grant execute on function public.create_item(uuid,uuid,text,numeric,text,numeric) to authenticated;
grant execute on function public.update_list(uuid,text,text,text,public.list_mode) to authenticated;
grant execute on function public.delete_list(uuid) to authenticated;
grant execute on function public.update_item(uuid,text,numeric,text,numeric,boolean) to authenticated;
grant execute on function public.delete_item(uuid) to authenticated;
grant execute on function public.update_goal(uuid,text,numeric) to authenticated;
grant execute on function public.delete_goal(uuid) to authenticated;
grant execute on function public.add_contribution(uuid,numeric,text) to authenticated;
