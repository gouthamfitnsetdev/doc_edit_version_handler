-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/cdimcpnixdjldfbyukiq/sql/new

create table if not exists documents (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  file_type   text not null,
  session_id  text not null,
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

-- Enable RLS
alter table documents enable row level security;
alter table versions  enable row level security;

-- Allow anon (public) full access — no login required
create policy "anon full access" on documents for all to anon using (true) with check (true);
create policy "anon full access" on versions  for all to anon using (true) with check (true);

-- Storage bucket for original PDFs (enables cross-refresh persistence)
insert into storage.buckets (id, name, public)
  values ('pdf-files', 'pdf-files', true)
  on conflict (id) do nothing;

create policy "anon upload pdf-files"
  on storage.objects for insert to anon
  with check (bucket_id = 'pdf-files');

create policy "anon read pdf-files"
  on storage.objects for select to anon
  using (bucket_id = 'pdf-files');

create policy "anon update pdf-files"
  on storage.objects for update to anon
  using (bucket_id = 'pdf-files');
