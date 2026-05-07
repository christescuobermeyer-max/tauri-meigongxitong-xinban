# Windows 本地后端网关部署

## 适用场景

把 `backend-gateway` 放在你可以控制的一台 Windows 电脑上，这台电脑作为办公室本地服务器。6 个员工电脑只安装桌面软件，并通过局域网访问这台电脑。

## 受控电脑要求

- 电脑必须长期开机，不能休眠。
- 电脑必须能访问 Supabase、OSS、生图线路接口。
- 员工电脑和这台电脑在同一个局域网，或能通过内网穿透访问。
- `.env.local` 只放在这台受控电脑，不能发给员工。

## 1. 配置受控电脑密钥

在项目根目录准备 `.env.local`，包含：

```env
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的 anon key
SUPABASE_SERVICE_ROLE_KEY=你的 service role key

IMAGE_2_API_KEY=线路1 key
IMAGE_2_LINE2_API_KEY=线路2 key
VECTORENGINE_IMAGE_2_API_KEY=线路3 key
POCKGO_IMAGE_2_API_KEY=线路4 key
APIMART_IMAGE_2_API_KEY=线路5 key

ALI_OSS_REGION=oss-cn-hangzhou
ALI_OSS_ACCESS_KEY_ID=你的 OSS key id
ALI_OSS_ACCESS_KEY_SECRET=你的 OSS secret
ALI_OSS_BUCKET=你的 bucket
```

## 2. 构建本地网关

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-local-backend-gateway.ps1
```

也可以使用快捷命令：

```powershell
npm run gateway:build
```

## 3. 启动本地网关

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-backend-gateway.ps1
```

也可以使用快捷命令：

```powershell
npm run gateway:start
```

默认监听端口是 `8787`，服务地址：

```text
http://本机局域网 IP:8787
```

在受控电脑本机测试：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

## 4. 放行 Windows 防火墙

如果员工电脑访问不了，使用管理员 PowerShell 执行：

```powershell
New-NetFirewallRule -DisplayName "CSGH Backend Gateway 8787" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow
```

也可以使用快捷命令：

```powershell
npm run gateway:firewall
```

## 5. 设置开机自启动

如果这台电脑会长期作为受控网关，建议设置开机自启动：

```powershell
npm run gateway:startup
```

该命令会创建 Windows 任务计划程序任务：`CSGH Backend Gateway`。

## 6. 员工端安装包配置

构建员工安装包时写入网关地址：

```powershell
$env:VITE_BACKEND_GATEWAY_URL="http://受控电脑局域网IP:8787"
npm run tauri:build
```

也可以使用专用脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-employee-installer.ps1 -GatewayUrl "http://受控电脑局域网IP:8787"
```

员工电脑不需要任何生图 API Key、OSS Key、Supabase service_role。

## 7. 注意事项

- 受控电脑 IP 建议固定，避免重启路由器后地址变化。
- 不建议直接暴露公网 HTTP。如需外网使用，必须加 HTTPS、域名和防火墙白名单。
- 如果受控电脑关机、断网、休眠，员工端生图会全部不可用。
