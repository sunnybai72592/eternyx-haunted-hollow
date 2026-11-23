-- REVIEW-ONLY SQL. Do not execute on production without staging approval.
-- Indexed lexical full-text search; NOT embeddings or semantic RAG.
-- Prerequisite: public.ai_documents, public.document_chunks and their RLS policies.
-- Apply deliberately with the Supabase migration workflow after schema drift checks.
create index if not exists idx_eternyx_document_chunks_simple_fts
  on public.document_chunks
  using gin (pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, content));

create or replace function public.search_owned_document_chunks(
  p_document_id uuid,
  p_query text,
  p_limit integer default 60
)
returns table(content text, chunk_index integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- Never accept caller-supplied user IDs or bypass per-row policies.
  if (select auth.uid()) is null
     or p_document_id is null
     or p_query is null
     or length(p_query) < 2
     or length(p_query) > 200
     or p_query !~ '^[[:alnum:]]+( \| [[:alnum:]]+){0,7}$'
     or p_limit is null or p_limit < 1 or p_limit > 80 then
    return;
  end if;

  return query
    select c.content, c.chunk_index
    from public.document_chunks as c
    join public.ai_documents as d on d.id = c.document_id
    where c.document_id = p_document_id
      and d.user_id = (select auth.uid())
      and d.status = 'ready'
      and pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, c.content)
        @@ pg_catalog.to_tsquery('simple'::pg_catalog.regconfig, p_query)
    order by pg_catalog.ts_rank_cd(
        pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, c.content),
        pg_catalog.to_tsquery('simple'::pg_catalog.regconfig, p_query)
      ) desc,
      c.chunk_index asc
    limit p_limit;
end;
$$;

-- Functions have PUBLIC EXECUTE by default; restrict to signed-in users.
revoke all on function public.search_owned_document_chunks(uuid, text, integer)
  from public, anon;
grant execute on function public.search_owned_document_chunks(uuid, text, integer)
  to authenticated;

-- Verify RLS and function ownership after applying.
-- Non-owner's p_document_id must always return zero rows, including with valid tsquery.
