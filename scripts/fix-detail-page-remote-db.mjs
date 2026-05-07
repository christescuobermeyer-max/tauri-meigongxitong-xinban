import pkg from "../node_modules/pg/lib/index.js";

const { Client } = pkg;

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }
  return value;
}

const client = new Client({
  host: readEnv("PGHOST"),
  port: Number(process.env.PGPORT ?? "5432"),
  database: process.env.PGDATABASE ?? "postgres",
  user: readEnv("PGUSER"),
  password: readEnv("PGPASSWORD"),
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  const constraints = await client.query(`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.generation_logs'::regclass
      and contype = 'c'
    order by conname;
  `);

  console.log("当前 generation_logs 约束：");
  console.log(JSON.stringify(constraints.rows, null, 2));

  const hasDetailPage = constraints.rows.some((row) => String(row.def).includes("'detail_page'"));
  if (!hasDetailPage) {
    await client.query(`
      alter table public.generation_logs
        drop constraint if exists generation_logs_asset_kind_check;
    `);
    await client.query(`
      alter table public.generation_logs
        add constraint generation_logs_asset_kind_check
        check (asset_kind in ('avatar', 'storefront', 'poster', 'product', 'p_signboard', 'picture_wall', 'detail_page'));
    `);
    console.log("已补充 generation_logs_asset_kind_check 允许 detail_page");
  } else {
    console.log("generation_logs_asset_kind_check 已包含 detail_page");
  }

  await client.query(`
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
      count(*) filter (where asset_kind = 'detail_page')    as detail_page_count
    from public.generation_logs
    group by user_id, stat_day;
  `);
  console.log("已确认 daily_generation_stats 包含 detail_page_count");

  if (process.env.VERIFY_INSERT === "1") {
    const profile = await client.query(`
      select id
      from public.profiles
      order by created_at asc
      limit 1;
    `);
    const userId = profile.rows[0]?.id;
    if (!userId) throw new Error("未找到可用于验证的 profiles 记录");

    await client.query("begin");
    try {
      await client.query(
        `
          insert into public.generation_logs (
            user_id, shop_name, asset_kind, platform, generation_line, oss_url, oss_key
          ) values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          userId,
          "详情页验证店",
          "detail_page",
          "meituan",
          "line1",
          "https://example.com/detail-page-verify.png",
          null,
        ]
      );
      console.log("detail_page 临时写入校验成功");
    } finally {
      await client.query("rollback");
    }
  }
} finally {
  await client.end();
}
