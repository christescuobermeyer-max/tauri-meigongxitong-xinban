export default function SettingsPanel() {
  return (
    <div className="card" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="card__header">
        <div className="card__title">系统设置</div>
        <span className="card__hint">仅展示当前应用配置</span>
      </div>
      <div className="card__body">
        <div className="meta-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
          <span>
            系统：<strong>图片生成系统</strong>
          </span>
          <span>
            接口：<strong>https://api3.wlai.vip/v1/images/generations</strong>
          </span>
          <span>
            原图尺寸：<strong>头像 1024×1024 · 店招 1792×1024</strong>
          </span>
          <span>
            导出尺寸（美团）：
            <strong>头像 800×800 · 店招 692×390</strong>
          </span>
          <span>
            导出尺寸（淘宝闪购）：
            <strong>头像 800×800 · 店招 750×423</strong>
          </span>
          <span>
            超时：<strong>单次生成最多 300s</strong>
          </span>
        </div>
        <div
          style={{
            marginTop: 18,
            padding: 12,
            border: "1px dashed var(--border-strong)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-subtle)",
            fontSize: 12,
            color: "var(--fg-muted)",
            lineHeight: 1.7,
          }}
        >
          API 密钥通过 <code>.env.local</code>、<code>.env</code> 或系统环境变量读取，不写入源码。
          下载图片时会按所选平台尺寸做整体缩放（不裁剪、不留边）。
        </div>
      </div>
    </div>
  );
}
