-- 新增线路5 APIMart 备用线路，允许历史记录和后台明细同步展示线路5。
alter table public.generation_logs
  drop constraint if exists generation_logs_generation_line_check;

alter table public.generation_logs
  add constraint generation_logs_generation_line_check
  check (generation_line in ('line1', 'line2', 'line3', 'line4', 'line5'));
