-- 巡店话术工作区迁移：在 generation_logs.asset_kind 约束中加入 patrol_script，
-- 并扩展 daily_generation_stats 视图以暴露每日巡店话术卡片张数。

alter table public.generation_logs
  drop constraint if exists generation_logs_asset_kind_check;

alter table public.generation_logs
  add constraint generation_logs_asset_kind_check
  check (asset_kind in (
    'avatar',
    'storefront',
    'poster',
    'product',
    'p_signboard',
    'picture_wall',
    'detail_page',
    'brand_story',
    'data_analysis',
    'patrol_script'
  ));

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
  count(*) filter (where asset_kind = 'picture_wall')   as picture_wall_count,
  count(*) filter (where asset_kind = 'detail_page')    as detail_page_count,
  count(*) filter (where asset_kind = 'brand_story')    as brand_story_count,
  count(*) filter (where asset_kind = 'data_analysis')  as data_analysis_count,
  count(*) filter (where asset_kind = 'patrol_script')  as patrol_script_count
from public.generation_logs
group by user_id, stat_day;
