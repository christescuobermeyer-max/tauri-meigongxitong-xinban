# 线路6/7生产保护排查记录

## 已确认

- 生产网关服务健康检查正常。
- 当前部署源码与工作区相关源码 SHA-256 一致。
- 线路6日志包含 `insufficient_user_quota`、`Network is unreachable` 和连接超时。
- 线路7日志包含连接超时和 `error decoding response body`。
- 线路7已显式请求 `response_format=b64_json`；线路6尚未显式请求。
- 当前服务没有 OOM 或网卡链路错误证据。

## 代码层风险

- `src-tauri/src/bin/backend_gateway.rs` 在共享 Zikl 线路失败后排除 line2/3/4，使 fallback 更容易进入 line6/7。
- 线路6模块有 3 次内部重试；不确定结果可能已经产生上游费用。
- 当前请求链没有统一的上游请求追踪 ID。

## 待验证

- 新增保护后，生产日志是否停止 line6/7调用。
- 网关重启后暂停状态是否保留。

## 2026-09-21 19:50（Asia/Shanghai）继续执行记录

- 生产 `https://gw.hbcsch.pw/health` 返回 HTTP 200，服务仍在线。
- TCP 22 端口可达，但 SSH 在密钥交换前被服务器主动关闭；`ssh-keyscan` 同样拿不到 SSH banner。
- 已用低频方式重试，现象可复现；因此尚未进行源码安装、生产编译或重启。
- 线路6/7的生产暂停保护保持不变；没有发起收费生图测试，也没有读取密钥文件。
- 待 SSH 接入恢复后，继续执行“上传临时源码 → 备份 → 安装 → 编译 → 重启 → 健康检查”的部署流程。
