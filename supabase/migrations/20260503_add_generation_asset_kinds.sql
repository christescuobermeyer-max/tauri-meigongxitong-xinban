-- 新增 P门头、图片墙独立生图分类，并修正已归档历史记录的分类。
alter table public.generation_logs
  drop constraint if exists generation_logs_asset_kind_check;

alter table public.generation_logs
  add constraint generation_logs_asset_kind_check
  check (asset_kind in ('avatar', 'storefront', 'poster', 'product', 'p_signboard', 'picture_wall'));

update public.generation_logs
   set asset_kind = 'p_signboard'
 where asset_kind = 'storefront'
   and oss_url ilike '%p-signboard%';

update public.generation_logs
   set asset_kind = 'picture_wall'
 where asset_kind = 'product'
   and oss_url ilike '%picture-wall%';

create or replace view public.daily_generation_stats
with (security_invoker = true) as
select
  user_id,
  (created_at at time zone 'Asia/Shanghai')::date as stat_day,
  count(*)                                              as total_count,
  count(*) filter (where asset_kind = 'avatar')         as avatar_count,
  count(*) filter (where asset_kind = 'storefront')     as storefront_count,
  count(*) filter (where asset_kind = 'poster')         as poster_count,
  count(*) filter (where asset_kind = 'product')        as product_count,
  count(*) filter (where asset_kind = 'p_signboard')    as p_signboard_count,
  count(*) filter (where asset_kind = 'picture_wall')   as picture_wall_count
from public.generation_logs
group by user_id, stat_day;
