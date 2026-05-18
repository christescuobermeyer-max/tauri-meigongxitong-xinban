-- 给 generation_logs 增加 elapsed_ms（成功生成图片的耗时，单位毫秒）
-- 可空：仅 2026-05-18 之后写入的新记录会有值；历史数据保持 NULL。

alter table public.generation_logs
  add column if not exists elapsed_ms integer;

comment on column public.generation_logs.elapsed_ms
  is '从发起生图到拿到 base64 的耗时（毫秒），不含 OSS 归档；老记录为 NULL';
