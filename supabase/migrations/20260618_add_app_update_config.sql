create table if not exists public.app_update_config (
  id text primary key default 'desktop',
  latest_version text not null,
  force_update boolean not null default false,
  installer_url text not null default '',
  release_notes text not null default '',
  updated_at timestamptz not null default now(),
  constraint app_update_config_singleton check (id = 'desktop')
);

comment on table public.app_update_config is '桌面软件强制更新配置';
comment on column public.app_update_config.latest_version is '最新桌面版本号，需高于本机版本才触发强制更新';
comment on column public.app_update_config.force_update is '是否强制低版本客户端更新';
comment on column public.app_update_config.installer_url is '可公开访问的 .msi 或 .exe 安装包地址';
comment on column public.app_update_config.release_notes is '启动弹窗展示的更新内容，每行一条';

alter table public.app_update_config enable row level security;

drop policy if exists "app_update_config: public read" on public.app_update_config;
create policy "app_update_config: public read"
  on public.app_update_config for select
  to anon, authenticated
  using (true);

insert into public.app_update_config (id, latest_version, force_update, installer_url, release_notes)
values ('desktop', '3.0.1', false, '', '')
on conflict (id) do nothing;
