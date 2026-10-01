import { execFileSync } from "node:child_process";

const runGit = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();

// 发布前要求源码已全部提交，避免线上版本只存在于本机未提交改动中
export function assertCommitted(git = runGit) {
  const dirty = git(["status", "--porcelain"]);
  if (dirty) {
    const files = dirty.split("\n").slice(0, 10).join("\n");
    throw new Error(`拒绝发布：存在未提交的改动，请先 git commit 后再发布。\n${files}`);
  }
  let ahead = "0";
  try {
    ahead = git(["rev-list", "--count", "@{upstream}..HEAD"]);
  } catch {
    console.warn("提醒：当前分支没有远端跟踪分支，提交仅保存在本机。");
    return;
  }
  if (ahead !== "0") console.warn(`提醒：有 ${ahead} 个提交尚未推送到远端，建议发布后立即 git push。`);
}
