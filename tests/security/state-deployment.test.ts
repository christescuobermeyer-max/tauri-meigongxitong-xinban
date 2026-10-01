import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const unit = readFileSync(new URL("../../docs/cloud-gateway/csgh-backend-gateway.service", import.meta.url), "utf8");
ok(/^ReadWritePaths=.*\/opt\/csgh-gateway\/state/m.test(unit), "状态目录必须在 systemd 可写范围内");
for (const name of ["bootstrap.sh", "build-and-install.sh", "update.sh"]) {
  const source = readFileSync(new URL(`../../docs/cloud-gateway/${name}`, import.meta.url), "utf8");
  ok(/install -d[^\n]*-o csgh[^\n]*\/opt\/csgh-gateway\/state/.test(source), `${name} 必须创建状态目录`);
}
const update = readFileSync(new URL("../../docs/cloud-gateway/update.sh", import.meta.url), "utf8");
ok(update.includes("state-directory.conf") && update.includes("systemctl daemon-reload"), "升级旧服务时也必须加载状态目录可写配置");
console.log("状态持久化部署模板验证通过");
