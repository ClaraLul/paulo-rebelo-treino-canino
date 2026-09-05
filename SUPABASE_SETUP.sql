create table if not exists site_content (
  id text primary key,
  content jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists contact_requests (
  id text primary key,
  created_at timestamptz not null default now(),
  payload jsonb not null
);
