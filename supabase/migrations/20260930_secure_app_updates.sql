begin;

alter table public.app_update_config
  add column if not exists installer_sha256 text,
  add column if not exists update_enabled boolean;

alter table public.app_update_config
  drop constraint if exists app_update_config_installer_sha256;
alter table public.app_update_config
  add constraint app_update_config_installer_sha256
  check (installer_sha256 is null or installer_sha256 ~ '^[a-fA-F0-9]{64}$');

-- 保留已发布版本可见性，摘要需从对应安装包计算后补充。
update public.app_update_config
set update_enabled = force_update
where update_enabled is null;

alter table public.app_update_config
  alter column update_enabled set default false,
  alter column update_enabled set not null;

comment on table public.app_update_config is '桌面软件可选更新发布配置';
comment on column public.app_update_config.update_enabled is '是否向新客户端提示该版本；暂存或暂停时为 false';
comment on column public.app_update_config.installer_sha256 is '安装包 SHA-256 摘要；缺少时新客户端禁止自动安装';
comment on column public.app_update_config.force_update is '旧客户端更新提示兼容字段，与发布可见性同步维护';

commit;
