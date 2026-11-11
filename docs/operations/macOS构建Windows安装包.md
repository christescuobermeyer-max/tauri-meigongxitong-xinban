# 在 macOS 构建 Windows 安装包

此流程在 Mac 上生成 Windows x64 NSIS `.exe`，沿用现有员工端和自动更新协议。
不生成 macOS 应用或 MSI，也不执行 OSS 上传、数据库迁移、网关部署或更新启用。
正式发布前仍按 `../自动更新.md` 升级版本、提交并推送源码，在 Windows 机器验收。

## 一、准备工具链

安装 Xcode Command Line Tools、Node.js、Homebrew 和 Rust。Rust 工具链按常规安装在
`~/.cargo`、`~/.rustup`；本项目的构建入口会为子进程补充 Cargo 和 Homebrew 工具路径。

```sh
brew install nsis llvm lld
export PATH="$HOME/.cargo/bin:$PATH"
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
npm ci
```

仓库位于 NTFS 卷时，`npm ci` 可能因无法设置执行权限失败。应在支持 Unix 权限的本机
目录安装依赖，再将项目 `node_modules` 指向该目录；不要复用 Windows 的 `node_modules`。
首次交叉编译还需要联网下载 Rust 依赖、Windows SDK 和打包工具。

外置程序不由 Git 分发。构建前需将已验证的 Windows x64 文件放到：

- `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`
- `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe`

运行工具链检查，无需提供客户端配置：

```sh
npm run tauri:doctor:windows
```

## 二、提供公开客户端配置并构建

通过当前进程环境传入下面三个变量。只允许 Supabase 的 publishable key 或 anon key，
不得使用 service role、secret key、生图上游密钥或 OSS 密钥。

```sh
export VITE_BACKEND_GATEWAY_URL='https://gw.hbcsch.pw'
export VITE_SUPABASE_URL='https://<项目标识>.supabase.co'
export VITE_SUPABASE_ANON_KEY='<公开 publishable key 或 anon key>'
npm run tauri:build:windows
```

入口会检查配置、工具链和两个外置程序，执行 `npm run build`，然后使用 `cargo-xwin`
构建 Windows x64 目标并打包 NSIS。Cargo 使用 `--locked`，不会主动升级依赖。
Vite 在此入口下禁用环境文件自动加载，并只保留三个允许的 `VITE_` 变量。
Windows 原有 PowerShell 构建入口不变。

macOS 版 Tauri CLI 的 `--bundles` 参数只接受当前宿主的包类型，直接传
`--bundles nsis` 会在编译前失败。因此脚本通过合并配置 `bundle.targets = "nsis"`
指定产物类型，并用 `--target x86_64-pc-windows-msvc` 指定编译目标。

默认缓存和安装包位于本机目录，避免 NTFS 的权限和文件操作限制：

```text
~/Library/Caches/csgh-image-studio/windows-build/
  xwin/                                        Windows SDK 缓存
  target/x86_64-pc-windows-msvc/release/
    bundle/nsis/                               Windows 安装包
```

可通过 `CARGO_TARGET_DIR`、`XWIN_CACHE_DIR` 指定其他本机缓存路径。构建结束后脚本会输出
安装包目录。不要将上述目录或安装包提交到 Git。

## 三、验收与发布边界

构建成功只证明编译和打包完成。发布前需要在 Windows 上验证首次安装、已有版本覆盖、
启动登录、生图与历史记录、图片下载、视频解析/导出，以及更新后的重新打开。
macOS 上不能替代这些 Windows 运行验收。

版本号需同步维护 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json`。
同版本的验证包不得作为新版本直接启用；发布工作区必须没有未提交改动。
构建包中的网关地址只配置客户端连接，网关源码和数据库迁移仍需独立部署。

验证入口：

```sh
node tests/windows-cross-build.test.mjs
npm test
npm run tauri:doctor:windows
```
