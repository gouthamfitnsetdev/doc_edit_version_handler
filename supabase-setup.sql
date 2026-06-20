-- ============================================================
-- Run this in Supabase SQL Editor (full setup including auth)
-- ============================================================

-- 1. Tables
create table if not exists documents (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  file_type   text not null,
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);

create table if not exists versions (
  id              uuid default gen_random_uuid() primary key,
  document_id     uuid references documents(id) on delete cascade,
  version_number  integer not null,
  content         text not null,
  label           text,
  created_at      timestamptz default now()
);

-- 2. RLS
alter table documents enable row level security;
alter table versions  enable row level security;

-- Drop old anon policies if they exist
drop policy if exists "anon full access" on documents;
drop policy if exists "anon full access" on versions;

-- Users can only see/edit their own documents
create policy "user own docs" on documents for all to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Versions inherit access from the parent document
create policy "user own versions" on versions for all to authenticated
  using  (exists (
    select 1 from documents d
    where d.id = versions.document_id and d.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from documents d
    where d.id = versions.document_id and d.user_id = auth.uid()
  ));

-- 3. Storage bucket for PDFs
insert into storage.buckets (id, name, public)
  values ('pdf-files', 'pdf-files', true)
  on conflict (id) do nothing;

-- Drop old anon storage policies if they exist
drop policy if exists "anon upload pdf-files"  on storage.objects;
drop policy if exists "anon read pdf-files"    on storage.objects;
drop policy if exists "anon update pdf-files"  on storage.objects;

create policy "auth upload pdf-files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pdf-files');

create policy "auth read pdf-files"
  on storage.objects for select to authenticated
  using (bucket_id = 'pdf-files');

create policy "auth update pdf-files"
  on storage.objects for update to authenticated
  using (bucket_id = 'pdf-files');

create policy "auth delete pdf-files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pdf-files');
