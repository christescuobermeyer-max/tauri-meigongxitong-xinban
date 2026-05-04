-- 记录每张图使用的生图线路：line1 / line2；旧记录保留为空。
alter table public.generation_logs
  add column if not exists generation_line text;

alter table public.generation_logs
  drop constraint if exists generation_logs_generation_line_check;

alter table public.generation_logs
  add constraint generation_logs_generation_line_check
  check (generation_line in ('line1', 'line2'));
