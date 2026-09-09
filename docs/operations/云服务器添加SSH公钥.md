# 云服务器（47.86.225.83）添加 Windows 公钥

> **注意**：服务器禁用了 root 直接 SSH，日常登录用户是 `admin`（阿里云 Alibaba Cloud Linux 默认）。
> 需要 root 权限的操作用 `sudo`。

## 一、SSH 登录服务器（用你现有可用的方式）

```
ssh admin@47.86.225.83
```

## 二、登录后整段粘贴

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPzcYLVIMVQRhGT0yps/0eodJa/5PwrI0NENT4eMnIbh windows-claude-code-OS-20251028ZUDU'
grep -qxF "$PUBKEY" ~/.ssh/authorized_keys || echo "$PUBKEY" >> ~/.ssh/authorized_keys

echo "[完成] 当前 authorized_keys 内容："
cat ~/.ssh/authorized_keys

echo "---"
echo "[sudo 测试]"
sudo -n true 2>&1 || echo "需要密码才能 sudo（运维操作时会提示输入）"
```

## 三、回到本地 Windows 验证

之后你这台 Windows 可以直接：

```powershell
ssh admin@47.86.225.83
```

## 附：本机 Windows 端密钥信息

| 项 | 值 |
|---|---|
| 私钥 | `C:\Users\Administrator\.ssh\id_ed25519`（ACL 已锁，仅 Administrator 可读） |
| 公钥 | `C:\Users\Administrator\.ssh\id_ed25519.pub` |
| 算法 | ed25519 |
| 指纹 | `SHA256:nO38Vo6isLyp+o2ns09zt11eomwQy1ZCmU4ir0ZkVGU` |
| 注释 | `windows-claude-code-OS-20251028ZUDU` |
| Passphrase | 无 |

## 后续：品牌故事上线服务器侧操作

加好 key 后，之前给的"四步走"流程里的 SSH 命令都改成 `ssh admin@47.86.225.83`，进去后 cd 到项目目录跑 `sudo bash docs/cloud-gateway/update.sh` 即可（sudo 会要 admin 的密码）。
