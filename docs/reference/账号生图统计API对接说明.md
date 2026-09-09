# 账号生图统计 API 对接说明

本文档用于新 Web 页面接入后台账号生图统计数据。接口由云端网关提供，返回每个未删除账号的累计生图总张数和本月已生图总张数。

## 接口信息

| 项 | 值 |
|---|---|
| Method | `GET` |
| Path | `/api/admin/account-generation-summary` |
| 生产域名 | `https://gw.hbcsch.pw` |
| 完整地址 | `https://gw.hbcsch.pw/api/admin/account-generation-summary` |
| 鉴权 | 无需登录，公开只读 |
| 权限 | 网关使用服务器端 `SUPABASE_SERVICE_ROLE_KEY` 读取，只返回统计数据 |

简写：`GET /api/admin/account-generation-summary`

## 请求头

无需传鉴权请求头。普通 Web 页面可以直接 `fetch` 这个接口读取展示数据。

## 响应示例

```json
{
  "month_start": "2026-06-30T16:00:00Z",
  "month_end": "2026-07-31T16:00:00Z",
  "accounts": [
    {
      "user_id": "00000000-0000-0000-0000-000000000000",
      "display_name": "张三",
      "role": "user",
      "is_active": true,
      "created_at": "2026-05-01T08:20:00Z",
      "last_login_at": "2026-07-09T02:15:00Z",
      "total_count": 1280,
      "month_count": 320
    }
  ]
}
```

## 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `month_start` | string | 本月统计开始时间，按 Asia/Shanghai 月份切分后转换为 UTC ISO 时间 |
| `month_end` | string | 下月统计开始时间，前端按半开区间 `[month_start, month_end)` 理解 |
| `accounts` | array | 账号统计列表，只包含 `deleted_at IS NULL` 的账号 |
| `accounts[].user_id` | string | Supabase 用户 ID |
| `accounts[].display_name` | string | 后台展示名 |
| `accounts[].role` | string | `admin` 或 `user` |
| `accounts[].is_active` | boolean | 账号是否启用 |
| `accounts[].created_at` | string/null | 账号创建时间 |
| `accounts[].last_login_at` | string/null | 最近登录时间 |
| `accounts[].total_count` | number | 累计生图总张数，来源于 `generation_totals.total_count`，持续叠加，不随历史清理减少 |
| `accounts[].month_count` | number | 本月已生图总张数，来源于 `generation_monthly_totals.month_count`，按上海自然月持续累计 |

## JavaScript 对接示例

export async function fetchAccountGenerationSummary() {
  const res = await fetch(
    "https://gw.hbcsch.pw/api/admin/account-generation-summary",
    {
      method: "GET"
    }
  );

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `接口请求失败：${res.status}`);
  }
  return body as {
    month_start: string;
    month_end: string;
    accounts: Array<{
      user_id: string;
      display_name: string;
      role: "admin" | "user";
      is_active: boolean;
      created_at: string | null;
      last_login_at: string | null;
      total_count: number;
      month_count: number;
    }>;
  };
}
```

## curl 调试

```bash
curl -sS "https://gw.hbcsch.pw/api/admin/account-generation-summary"
```

## 错误响应

```json
{ "error": "未配置 SUPABASE_SERVICE_ROLE_KEY，无法公开读取账号生图统计" }
```

常见状态码：

| 状态码 | 含义 |
|---|---|
| `502` | 网关未配置 `SUPABASE_SERVICE_ROLE_KEY`、读取 Supabase 失败或解析数据失败 |

## 数据口径

- `total_count` 复用当前软件已有永久累计表 `generation_totals`，每次成功写入 `generation_logs` 后由数据库触发器递增，不会因为历史记录清理而减少。
- `month_count` 使用当前月份窗口从 `generation_monthly_totals` 读取，月份边界按 Asia/Shanghai 计算；该表由数据库触发器随 `generation_logs` 插入同步递增，不随历史明细清理减少。
- 首次上线迁移时，会用当前仍保留的 `generation_logs` 回填月度基线；之后新增生图会持续累加到对应自然月。
- 接口不需要前端登录；请只在确认这些账号统计数据可以公开展示的 Web 页面中使用。
