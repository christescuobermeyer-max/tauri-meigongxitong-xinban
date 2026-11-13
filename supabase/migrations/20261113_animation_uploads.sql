-- Animations made on the desktop "动图制作" page and uploaded to OSS by the gateway.
-- Video clips (style = 'video') are listed in "动图展示". Only the gateway (service_role) reads or writes.
create table if not exists public.animation_uploads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  style text not null check (style ~ '^[a-z]{2,20}$'),
  title text not null default '' check (char_length(title) <= 60),
  format text not null check (format in ('gif', 'webp')),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  duration_ms integer not null check (duration_ms between 2000 and 5000),
  frames integer not null check (frames between 2 and 100),
  bytes integer not null check (bytes between 1 and 5000000),
  oss_key text not null check (oss_key like 'product-animations/%'),
  poster_key text not null check (poster_key like 'product-animations/%'),
  created_at timestamptz not null default now()
);
create index if not exists animation_uploads_style_recent on public.animation_uploads(style, created_at desc);
alter table public.animation_uploads enable row level security;
revoke all on public.animation_uploads from public, anon, authenticated;
grant select, insert on public.animation_uploads to service_role;
