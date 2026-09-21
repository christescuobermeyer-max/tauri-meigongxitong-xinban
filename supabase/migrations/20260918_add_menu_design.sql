begin;
alter table public.generation_logs drop constraint if exists generation_logs_asset_kind_check;
alter table public.generation_logs add constraint generation_logs_asset_kind_check
  check (asset_kind in ('avatar', 'storefront', 'poster', 'product', 'p_signboard', 'picture_wall', 'detail_page', 'brand_story', 'data_analysis', 'patrol_script', 'menu_design'));
commit;
