import path from "node:path";
import { pathToFileURL } from "node:url";
import { releaseConfig } from "./update/config.mjs";
import { stage, enable, disable, uploadMsi } from "./update/actions.mjs";
import { readPublicStatus } from "./update/transport.mjs";

export { stage, enable, disable, uploadMsi, readPublicStatus };

export async function main(args = process.argv.slice(2)) {
  const [command, ...values] = args;
  const config = releaseConfig();
  if (command === "stage") return stage(config, values[0], values[1], values[2]);
  if (command === "upload-msi") return uploadMsi(config, values[0], values[1]);
  if (command === "enable") return enable(config, values[0]);
  if (command === "disable") return disable(config);
  if (command === "status") return readPublicStatus(config);
  throw new Error("用法：stage <NSIS路径> <版本> <更新说明Base64> | upload-msi <MSI路径> <版本> | enable <版本> | disable | status");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
