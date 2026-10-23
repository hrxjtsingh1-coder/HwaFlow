-- Assertion script for 20261030090000_extraction_preserves_text.sql
--
-- Requires a scratch database with every migration applied, and a real
-- auth.users row for the acting user (FK from public.profiles).
--
--   psql "$DATABASE_URL" -v actor='<auth-user-uuid>' -f supabase/tests/extraction_preserves_text.sql
--
-- Expected final output: "PASS: extraction preserved translated text".
-- Anything else raises and the transaction rolls back.

begin;

-- Fixtures ---------------------------------------------------------------
insert into auth.users (id, email)
values (:'actor', :'actor' || '@users.internal')
on conflict (id) do nothing;

insert into public.profiles (id, username, display_name)
values (:'actor', 'fixture_' || substr(:'actor', 1, 8), 'Fixture')
on conflict (id) do nothing;

insert into public.groups (id, name, slug, created_by)
values ('00000000-0000-4000-8000-000000000001', 'Fixture Group', 'fixture-group', :'actor');

insert into public.group_members (group_id, user_id, role)
values ('00000000-0000-4000-8000-000000000001', :'actor', 'owner');

insert into public.series (id, group_id, title, source_language, created_by)
values ('00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000001', 'Fixture Series', 'ko', :'actor');

insert into public.chapters (id, series_id, number, created_by)
values ('00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000002', 1, :'actor');

insert into public.chapter_pages (id, chapter_id, page_index, original_path, storage_state)
values ('00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000003', 0,
        '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003/p.webp',
        'stored');

-- Act as the signed-in user so can_edit_chapter() passes.
set local role authenticated;
set local request.jwt.claims = json_build_object('sub', :'actor', 'role', 'authenticated')::text;

-- 1. Translate the block.
select public.set_panel_blocks(
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '[{"index":0,"sourceText":"raw","baseTranslation":"BASE","finalText":"FINAL"}]'::jsonb
);

-- 2. Re-run extraction: no text fields at all.
select public.set_panel_blocks(
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '[{"index":0,"sourceText":"raw v2"}]'::jsonb
);

do $$
declare
  v_base  text;
  v_final text;
  v_src   text;
begin
  select base_translation, final_text, source_text
    into v_base, v_final, v_src
    from public.text_blocks
   where page_id = '00000000-0000-4000-8000-000000000004'
     and block_index = 0;

  if v_base is distinct from 'BASE' then
    raise exception 'FAIL: base_translation was % (expected BASE)', v_base;
  end if;
  if v_final is distinct from 'FINAL' then
    raise exception 'FAIL: final_text was % (expected FINAL)', v_final;
  end if;
  if v_src is distinct from 'raw v2' then
    raise exception 'FAIL: source_text was not refreshed (got %)', v_src;
  end if;

  raise notice 'PASS: extraction preserved translated text';
end;
$$;

rollback;
