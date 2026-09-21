alter table public.generation_logs
  add column if not exists product_name text;

comment on column public.generation_logs.product_name
  is '产品图对应的菜品名称，用于历史记录和批量导出按菜品名命名；非产品图可为空';
