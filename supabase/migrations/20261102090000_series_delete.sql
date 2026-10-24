-- Deleting a series is the largest destructive action in the product: it takes
-- every chapter, page, text block, glossary column and assignment with it.
--
-- There is no `series` delete policy on purpose. The browser cannot delete the
-- row directly; it has to come through this RPC, which re-checks the caller's
-- role against the row instead of trusting the UI that hid the button.

create or replace function public.delete_series(p_series_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select group_id into v_group_id from public.series where id = p_series_id;

  if v_group_id is null then
    raise exception 'That series no longer exists.' using errcode = 'HF002';
  end if;

  if not public.has_group_role(v_group_id, array['owner', 'manager']) then
    raise exception 'Only an Owner or Manager can delete a series.'
      using errcode = 'HF001';
  end if;

  -- Chapters, pages, text blocks, glossary terms and assignments all cascade.
  delete from public.series where id = p_series_id;
end;
$$;

revoke all on function public.delete_series(uuid) from public;
grant execute on function public.delete_series(uuid) to authenticated;
