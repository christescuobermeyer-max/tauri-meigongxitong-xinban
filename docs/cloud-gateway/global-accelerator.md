# 阿里云全球加速 (GA) 接入说明

> 启用时间：2026-05-18
> 目的：解决香港 ECS ↔ 大陆员工电脑之间的跨境公网抖动/丢包，避免早高峰生图变慢

---

## 1. 背景：为什么要上 GA

### 原架构（跨境公网 × 3 条慢链路）

```
大陆员工电脑 ━ 跨境公网 ━▶ 香港 ECS ━ 跨境公网 ━▶ 大陆 OSS（杭州）
                                    ━ 跨境公网 ━▶ 大陆上游 API（云雾/vectorengine/pockgo/apimart）
```

### 实测的痛点

| 时段 | 现象 |
|---|---|
| 早 10:00-12:00 | 跨境链路丢包 20-60%，TLS 握手 0.5-3s |
| 全天偶发 | gateway 拉 OSS 失败 (`fetch_error`)，生图整体失败 |
| /health TTFB | 0.4-3s 抖动（正常应 < 100ms） |

### 为什么不迁服务器或换 OSS

| 方案 | 障碍 |
|---|---|
| 迁 ECS 到大陆 | 必须 ICP 备案，周期 7-20 天 |
| 迁 OSS 到香港 | 客户端下载成图也跨境，反而变慢 |
| 备案 + 大陆 ECS | 慢，影响业务 |

### GA 的核心价值

> **租阿里云骨干网当快递员**：客户端连阿里香港 BGP 精品 IP（走 CN2 GIA 直连大陆），不再走公网跨境。免备案。

---

## 2. 最终架构

```
大陆员工电脑
    │  访问 gw.hbcsch.pw（DNS CNAME 到 GA 入口）
    ▼
GA 入口（香港 BGP精品 IP：47.75.104.156 / 47.75.104.169）
    │  阿里骨干网专线（非公网）
    ▼
GA 终端节点组（地域：中国香港）
    │  阿里内网
    ▼
HK ECS：47.86.225.83:443（Caddy + csgh-backend-gateway）
    │
    ├─▶ 大陆 OSS（meigong-design-system-v2.oss-accelerate.aliyuncs.com）
    └─▶ 上游 API（yunwu / vectorengine / aicohere / apimart）
```

---

## 3. 实测效果

| 链路 | TTFB | TLS 握手抖动 | 丢包 |
|---|---|---|---|
| **旧（直连 HK 跨境公网）** | 390-785ms | 270-650ms | 20-60% (早高峰) |
| **新（GA 阿里专线）** | **27-29ms** | **22ms（无抖动）** | 0% |

**14× 提速 + 完全消除跨境抖动**。

---

## 4. 关键资源清单

### 阿里云控制台

| 资源 | 值 |
|---|---|
| 阿里云账号 | aliyun6833765024 |
| GA 实例名 | csgh-gateway-ga |
| GA 实例 ID | `ga-bp1ia1cv6v0m3b9auhmnc` |
| GA 资源组 | rg-acfmxn4psvq7qni（默认） |
| GA CNAME | `ga-bp1ia1cv6v0m3b9auhmnc.aliyunga0018.com` |
| GA 入口 IP | `47.75.104.156`, `47.75.104.169`（2 个 LB） |
| 监听 ID | `lsr-bp12dz70ykkgg3ypo5qbo`（csgh-gateway-tcp443） |
| 终端节点组 ID | `epg-bp1tmcef20s5znm496mit`（csgh-hk-ecs） |

### GA 配置摘要

| 字段 | 值 |
|---|---|
| 计费方式 | 按量付费 |
| 加速地域 | 中国香港 · 亚太 |
| 公网质量类型 | **BGP精品**（阿里 CN2 GIA） |
| 带宽峰值 | 5 Mbps |
| IP 地址协议 | IPv4 |
| 监听协议 | **TCP**（透传，不做 TLS 终止） |
| 监听端口 | 443 |
| 路由类型 | 智能路由 |
| 终端节点地域 | 中国香港 |
| 后端服务类型 | **自定义公网IP**（非阿里云分组 — 因为 HK ECS 是轻量服务器，不被识别为标准 ECS） |
| 后端服务 | `47.86.225.83` |
| 端口映射 | 留空（443→443 透传） |
| 保持客户端源IP | 不保持 |

### DNS 配置

> 域名 hbcsch.pw 在 **阿里云解析（万网/HiChina）**
> NS：`dns23.hichina.com` / `dns24.hichina.com`
> 控制台：https://dns.console.aliyun.com/

| 主机记录 | 类型 | 记录值 | TTL |
|---|---|---|---|
| `gw` | **CNAME** | `ga-bp1ia1cv6v0m3b9auhmnc.aliyunga0018.com` | 600 秒（10 分钟） |

> 用 CNAME 而不是 A 记录的理由：阿里云能在背后切换 GA 入口 IP，不需要我们手动改 DNS。

---

## 5. 客户端无需任何改动

- 桌面 App 访问的是 `https://gw.hbcsch.pw`（域名）
- DNS 切换不影响 App 的代码或环境变量
- **不需要重新打包 MSI**
- 员工电脑只需 `ipconfig /flushdns` 刷新 DNS 缓存（或等 10 分钟 TTL 自动到期）

---

## 6. 成本估算

| 项目 | 月费 |
|---|---|
| GA 实例（按量付费 小型 I） | ~¥420（按小时 ¥0.6 × 720h） |
| 带宽（BGP精品 5 Mbps 包月） | ~¥150-180 |
| 跨境流量 | ~¥9-50（按实际 GB） |
| **合计预估** | **~¥600/月** |

> 实际账单以阿里云为准。可以登录 https://billing.console.aliyun.com 查实际消费。

---

## 7. 运维操作

### 验证 GA 是否在生效

从任何无 Clash/代理 的电脑：

```powershell
# Windows
nslookup gw.hbcsch.pw
# 应该看到 CNAME 链：gw.hbcsch.pw → ga-xxx.aliyunga0018.com → 47.75.x.x

# 测 TTFB（应该看到 < 50ms）
curl.exe -s -o NUL -w "ttfb=%{time_starttransfer}s status=%{http_code}\n" https://gw.hbcsch.pw/health
```

从香港 ECS（绕过本机代理）：

```bash
ssh admin@47.86.225.83
getent hosts gw.hbcsch.pw
# 应该看到一组 47.75.x.x（GA IP），不是 47.86.225.83（原 ECS IP）
```

### 回滚到直连 HK ECS

如果 GA 出问题需要紧急回滚，在阿里云 DNS 控制台：

| 主机记录 | 类型 | 记录值 | TTL |
|---|---|---|---|
| gw | **A** | `47.86.225.83` | 600 |

把 CNAME 改回 A 记录指向 ECS IP，10 分钟内 DNS 全网生效。

### 查看 GA 流量/费用

- GA 实例详情 → "监控图表" Tab：看连接数 / 流量 / 转发情况
- 账单：https://billing.console.aliyun.com

---

## 8. 排错指南

### "本机访问 gw.hbcsch.pw 慢"

- 检查本机有没有 Clash/V2Ray 之类的代理软件：会劫持 DNS 返回 `198.18.x.x` fake-IP，导致连接异常
- 关闭代理或把 `*.aliyunga0018.com` 加入直连规则

### "员工电脑显示连不上 gw.hbcsch.pw"

```powershell
ipconfig /flushdns          # 清本机 DNS 缓存
nslookup gw.hbcsch.pw 223.5.5.5   # 用阿里公共 DNS 解析
```

如果 nslookup 还显示 `47.86.225.83`（旧 IP），等 10 分钟 TTL 过期再试。

### "GA 实例失败了"

阿里云 GA 实例如果状态变红/不可用：

1. 进入 GA 实例详情 → "监听" Tab → 检查监听状态
2. 检查 "终端节点组" → 健康检查未开启时，GA 默认认为后端始终健康
3. 实在不行，按 §7 的"回滚到直连 HK ECS"步骤回滚

---

## 9. 创建过程踩过的坑（避免重蹈）

1. **加速区域选大陆 → 报错需要备案**
   - 必须选 **中国香港** 才免备案
   - 选香港 + BGP精品 = 阿里专线服务大陆用户（CN2 GIA）

2. **后端服务类型选"阿里云公网IP" → 创建失败**
   - HK ECS 是**轻量服务器**，IP 不被识别为标准 ECS 公网 IP
   - 必须选 **自定义公网IP**（"非阿里云"分组下），手填 `47.86.225.83`

3. **端口映射填了 443→443 → 报错"不能相同"**
   - 端口相同时**完全不填映射**，留空即可
   - 只在监听端口 ≠ 后端端口时才需要填

4. **带宽默认 200 Mbps → 月费会爆**
   - 6 员工日常用 **5 Mbps 够**
   - 200 Mbps × BGP精品月费几千上万

---

## 10. 维护备忘

- **TTL 600 秒（10 分钟）**：DNS 修改后 10 分钟全网生效
- **GA 实例需要保持启用状态**：账户欠费会停服，回退到直连 HK ECS（DNS 不变的情况下会失败）
- **如果停用 GA**：先回退 DNS 到 `47.86.225.83`，再停 GA 实例
- **HK ECS 47.86.225.83 仍是源站**：不要停掉这台，否则 GA 后端不通

---

## 11. 参考链接

- 阿里云 GA 控制台：https://gaplus.console.aliyun.com/
- 阿里云 DNS 控制台：https://dns.console.aliyun.com/
- 阿里云账单：https://billing.console.aliyun.com/
- 全球加速产品文档：https://help.aliyun.com/product/153289.html
