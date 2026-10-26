-- The engine job belongs to the chapter, not to one browser tab.
--
-- Until now the job id lived in `localStorage`, so closing the tab (or switching
-- device) lost the run, its comparison images, and any chance of pressing
-- "Import text" or "Save pages" again. A Manager reviewing a chapter could not
-- see that someone had already run the engine on it.
--
-- One nullable column, written through an RPC because `chapters` has no UPDATE
-- policy — every write already goes through `security definer` functions.
--
-- Deliberately does not bump `chapters.updated_at`: starting a run is not an
-- edit to the chapter.

alter table public.chapters
  add column if not exists engine_job_id text;

comment on column public.chapters.engine_job_id is
  'Most recent image-engine run started for this chapter. A handle only — every route re-authorizes jobId -> chapterId.';

create or replace function public.set_chapter_engine_job(
  p_chapter_id uuid,
  p_job        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_chapter(p_chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  update public.chapters
     set engine_job_id = nullif(btrim(p_job), '')
   where id = p_chapter_id;
end;
$$;

revoke all on function public.set_chapter_engine_job(uuid, text) from public;
grant execute on function public.set_chapter_engine_job(uuid, text) to authenticated;
