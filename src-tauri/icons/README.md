# 应用图标

打包前请把以下尺寸的 PNG/ICO/ICNS 放入此目录：

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`（256×256）
- `icon.ico`（Windows）
- `icon.icns`（macOS）

最简方式：

```bash
# 准备一张 1024×1024 的 PNG（例如 source.png），运行：
npm run tauri icon ./source.png
```

Tauri CLI 会自动输出适配各平台的尺寸到本目录。
