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
  const constraintCheck = await client.query(`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.generation_logs'::regclass
      and contype = 'c'
    order by conname;
  `);

  console.log("当前 generation_logs 约束：");
  console.log(JSON.stringify(constraintCheck.rows, null, 2));

  const hasLine6 = constraintCheck.rows.some((row) => String(row.def).includes("'line6'"));

  if (!hasLine6) {
    await client.query(`
      alter table public.generation_logs
        drop constraint if exists generation_logs_generation_line_check;
    `);
    await client.query(`
      alter table public.generation_logs
        add constraint generation_logs_generation_line_check
        check (generation_line in ('line1', 'line2', 'line3', 'line4', 'line5', 'line6'));
    `);
    console.log("已补充 generation_logs_generation_line_check 允许 line6");
  } else {
    console.log("generation_logs_generation_line_check 已包含 line6");
  }

  const line6Count = await client.query(`
    select count(*)::int as count
    from public.generation_logs
    where generation_line = 'line6';
  `);
  console.log("现有 line6 生图记录数：", line6Count.rows[0]?.count ?? 0);

  if (process.env.VERIFY_INSERT === "1") {
    const profile = await client.query(`
      select id
      from public.profiles
      order by created_at asc
      limit 1;
    `);
    const userId = profile.rows[0]?.id;
    if (!userId) {
      throw new Error("未找到可用于验证的 profiles 记录");
    }
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
          "线路6验证店",
          "picture_wall",
          "meituan",
          "line6",
          "https://example.com/verify.png",
          null,
        ]
      );
      console.log("线路6 临时写入校验成功");
    } finally {
      await client.query("rollback");
    }
  }
} finally {
  await client.end();
}
