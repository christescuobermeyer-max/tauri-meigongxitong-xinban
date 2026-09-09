# Task Plan: 生图结果 OSS 直连分发

## Goal

在不破坏旧版桌面客户端的前提下，让新版客户端直接从阿里云 OSS 获取生成结果，减少云网关大图片响应流量，并将兼容网关同步到生产服务器。

## Phases

- [x] Phase 1: 盘点现有网关响应、OSS 归档、客户端消费和发布流程
- [x] Phase 2: 编写并评审 OSS 直连分发方案文档
- [x] Phase 3: 先补兼容契约和客户端行为测试
- [x] Phase 4: 实现网关协商式 URL 响应和客户端直连消费
- [x] Phase 5: 完成本地前端、Rust、Tauri 构建与回归验证
- [x] Phase 6: 部署兼容网关到生产服务器并完成健康与日志验收
- [x] Phase 7: 按发布流程交付新版客户端，验证灰度、自动更新与回滚

## Key Questions

1. 当前 OSS 归档 URL 是否可由客户端直接、安全地访问？
2. 哪些前端和 Tauri 路径默认把结果当作 Base64，如何统一兼容 URL？
3. 如何让旧客户端继续收到 Base64，而新版客户端显式选择 URL 模式？
4. 归档失败、签名过期、客户端下载失败时如何回退？
5. 如何验证服务器实际不再向新版客户端返回数 MB 的 JSON？

## Decisions Made

- 使用请求协商实现灰度兼容，生产网关部署不得直接改变旧客户端响应契约。
- 方案文档放入 `docs/architecture/`，执行记录保留在 `docs/plans/`。
- 不在文档、日志或测试中写入真实密钥、数据库连接串或完整签名 URL。
- 新客户端请求 `result_delivery: "oss_url"`；未声明该字段的旧客户端默认保持 `inline_base64`。
- URL 模式归档失败时返回内联 Base64，不能因为 OSS 故障丢失已生成结果。
- 新客户端先兼容旧网关的内联响应，再部署兼容网关，保证任意回滚顺序均可运行。
- OSS 归档图升级为可交付规格，至少覆盖每类图片的最大导出尺寸，避免客户端二次放大低分辨率归档图。

## Errors Encountered

- 一次 PowerShell 只读搜索使用了 Bash 花括号路径语法，触发解析错误；已改为显式路径后完成盘点，未产生文件修改。
- 生产服务器 `/opt/csgh-image-studio` 不是 Git 工作树，不能使用 `git pull` 部署；后续按“暂存源码、服务器编译、备份二进制、原子替换”的流程发布。
- 直接运行 Windows `cargo test` 时未加载 Visual Studio 环境，`ring` 编译因缺少 `vcruntime.h` 失败；改用项目约定的 `VsDevCmd.bat` 后编译和测试通过。
- `tests/p-signboard.test.ts` 和 `tests/data-analysis.test.ts` 命中已有重构留下的旧源码字符串断言（`PSignboardPage`、`dataAnalysis.busy`）；本次相关业务断言此前均已通过，不修改无关工作区。
- 93 个 TypeScript 行为测试逐文件执行超过 5 分钟命令上限；超时前绝大多数通过，补跑剩余直连相关测试通过。失败项均为工作区已有旧断言或已删除旧组件，与本次修改文件无关。
- `rustfmt --check` 报告 `backend_gateway.rs` 中已有代码的格式差异；为避免改写用户未提交代码，本次未执行整文件自动格式化。`git diff --check` 无空白错误。
- 外层 PowerShell 会话曾注入过期的 Vite 环境变量；最终构建显式加载项目本地生产环境，并扫描产物确认只包含生产 Supabase 项目标识。
- `dist/assets` 一度保留历史哈希资源；已在 Vite 配置中启用 `emptyOutDir` 并重新构建，最终 `dist` 只保留当前版本资源。

## Status

**Completed** - 兼容网关已部署到生产 `8787`，`3.0.15` 已完成本机安装和真实 OSS 直连灰度，并在最终复核后启用强制自动更新。
