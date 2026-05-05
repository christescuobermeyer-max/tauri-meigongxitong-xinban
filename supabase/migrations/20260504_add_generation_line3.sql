-- 新增线路3 vectorengine，允许云端生图记录写入 line3。
alter table public.generation_logs
  drop constraint if exists generation_logs_generation_line_check;

alter table public.generation_logs
  add constraint generation_logs_generation_line_check
  check (generation_line in ('line1', 'line2', 'line3'));
