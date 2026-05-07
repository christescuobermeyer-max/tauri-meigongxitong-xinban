-- 新增线路4 pockgo，线路2 改为 yunwu gpt-image-2 后保留旧 pockgo 线路记录能力。
alter table public.generation_logs
  drop constraint if exists generation_logs_generation_line_check;

alter table public.generation_logs
  add constraint generation_logs_generation_line_check
  check (generation_line in ('line1', 'line2', 'line3', 'line4'));
