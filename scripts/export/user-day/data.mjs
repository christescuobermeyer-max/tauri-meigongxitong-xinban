export function createDataTasks(context) {
  const { SUPABASE_URL, SERVICE_ROLE_KEY, USER_NAME } = context;
function buildQueryUrl(table, params) {
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) url.searchParams.append(key, item);
  }
  return url;
}

async function supabaseGet(table, params) {
  const response = await fetch(buildQueryUrl(table, params), {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase 读取 ${table} 失败：HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function findProfiles() {
  const exact = await supabaseGet("profiles", {
    select: "id,display_name",
    display_name: `eq.${USER_NAME}`,
  });
  if (exact.length) return exact;
  return supabaseGet("profiles", {
    select: "id,display_name",
    display_name: `ilike.*${USER_NAME}*`,
  });
}

async function fetchLogs(userIds, startIso, endIso) {
  const all = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const rows = await supabaseGet("generation_logs", {
      select: "id,user_id,shop_name,product_name,asset_kind,platform,generation_line,oss_url,oss_key,created_at",
      user_id: `in.(${userIds.join(",")})`,
      created_at: [`gte.${startIso}`, `lt.${endIso}`],
      order: "created_at.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
  return { buildQueryUrl, supabaseGet, findProfiles, fetchLogs };
}
