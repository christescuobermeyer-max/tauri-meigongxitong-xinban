import { assertVersion, assertInstaller } from "./config.mjs";
import { uploadArtifact, updateConfig, readUpdateRow, verifyDownload } from "./transport.mjs";

const defaultDependencies = { uploadArtifact, updateConfig, readUpdateRow, verifyDownload };

export async function stage(config, filePath, version, notesBase64, dependencies = defaultDependencies) {
  assertVersion(version);
  if (!filePath) throw new Error("stage 缺少安装包路径");
  const notes = Buffer.from(notesBase64 ?? "", "base64").toString("utf8").trim();
  if (!notes) throw new Error("stage 缺少更新说明");
  const objectKey = `app-updates/${version}/csgh-image-studio-${version}-x64-setup.exe`;
  const artifact = await dependencies.uploadArtifact(config, filePath, objectKey);
  assertInstaller(artifact.installerUrl, artifact.sha256);
  await dependencies.updateConfig(config, { latest_version: version, update_enabled: false,
    force_update: false, installer_url: artifact.installerUrl, installer_sha256: artifact.sha256,
    release_notes: notes });
  const row = await dependencies.readUpdateRow(config);
  if (row.latest_version !== version || row.update_enabled !== false || row.force_update ||
      row.installer_url !== artifact.installerUrl || row.installer_sha256 !== artifact.sha256) {
    throw new Error("暂存更新配置验收失败");
  }
}

export async function uploadMsi(config, filePath, version, dependencies = defaultDependencies) {
  assertVersion(version);
  if (!filePath) throw new Error("upload-msi 缺少安装包路径");
  return dependencies.uploadArtifact(config, filePath, `app-updates/${version}/csgh-image-studio-${version}-x64-zh-CN.msi`);
}

export async function enable(config, version, dependencies = defaultDependencies) {
  assertVersion(version);
  const before = await dependencies.readUpdateRow(config);
  if (before.latest_version !== version) throw new Error("拒绝启用：暂存版本与目标版本不同");
  assertInstaller(before.installer_url, before.installer_sha256);
  if (typeof before.update_enabled !== "boolean") throw new Error("拒绝启用：请先执行更新配置迁移");
  await dependencies.verifyDownload(before.installer_url, before.installer_sha256);
  await dependencies.updateConfig(config, { update_enabled: true, force_update: true });
  const after = await dependencies.readUpdateRow(config);
  if (after.latest_version !== version || !after.update_enabled || !after.force_update ||
      after.installer_url !== before.installer_url || after.installer_sha256 !== before.installer_sha256) {
    throw new Error("更新发布启用验收失败");
  }
}

export async function disable(config, dependencies = defaultDependencies) {
  await dependencies.updateConfig(config, { update_enabled: false, force_update: false });
  const row = await dependencies.readUpdateRow(config);
  if (row.update_enabled !== false || row.force_update) throw new Error("暂停更新失败");
}
