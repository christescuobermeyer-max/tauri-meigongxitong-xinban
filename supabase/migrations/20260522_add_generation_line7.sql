-- 新增线路7 otuapi（image2 模型）。
-- 用作主力分担：稳定性 100% 但响应较慢（~22-26s），并发 = 3。
alter table public.generation_logs
  drop constraint if exists generation_logs_generation_line_check;

alter table public.generation_logs
  add constraint generation_logs_generation_line_check
  check (generation_line in ('line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7'));
