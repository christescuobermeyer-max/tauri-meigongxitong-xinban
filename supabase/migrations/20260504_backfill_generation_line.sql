update public.generation_logs
   set generation_line = 'line1'
 where generation_line is null
   and asset_kind <> 'picture_wall';
