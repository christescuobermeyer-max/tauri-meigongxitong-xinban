import { useState } from "react";
import { createUser, type CreatedAccount } from "../lib/admin";
import { useToast } from "./Toast";
import { IconClose, IconCheck } from "./Icons";

interface Props {
  onClose: () => void;
  onCreated: (account: CreatedAccount) => void;
}

export default function NewAccountDialog({ onClose, onCreated }: Props) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedAccount | null>(null);

  async function handleCreate() {
    if (!displayName.trim()) {
      toast.show("请输入姓名", "error");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await createUser(displayName);
      setCreated(result);
      onCreated(result);
      toast.show("账号已创建", "success");
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    const text = [
      `姓名：${created.display_name}`,
      `登录邮箱：${created.email}`,
      `登录密码：${created.password}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.show("账号信息已复制到剪贴板", "success");
    } catch {
      toast.show("复制失败，请手动选中文本复制", "error");
    }
  }

  return (
    <div className="dialog-mask" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__head">
          <strong>{created ? "账号创建成功" : "新增账号"}</strong>
          <button
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            aria-label="关闭"
          >
            <IconClose style={{ width: 13, height: 13 }} />
          </button>
        </div>

        <div className="dialog__body">
          {!created ? (
            <div className="field">
              <label className="field__label">姓名</label>
              <input
                className="input"
                placeholder="例如：张三"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
                autoFocus
                maxLength={20}
              />
              <span className="field__hint">
                登录邮箱与密码会自动生成，创建后请把账号信息发给该员工
              </span>
            </div>
          ) : (
            <>
              <div className="dialog__success">
                <IconCheck style={{ width: 14, height: 14 }} />
                请把下方账号信息发送给该员工，关闭弹窗后将无法再次查看密码。
              </div>
              <div className="dialog__credentials">
                <div>
                  <span>姓名</span>
                  <strong>{created.display_name}</strong>
                </div>
                <div>
                  <span>登录邮箱</span>
                  <code>{created.email}</code>
                </div>
                <div>
                  <span>登录密码</span>
                  <code>{created.password}</code>
                </div>
              </div>
              <button
                className="btn btn--secondary btn--block"
                onClick={() => void handleCopy()}
              >
                复制全部账号信息
              </button>
            </>
          )}
        </div>

        <div className="dialog__foot">
          {!created ? (
            <>
              <button className="btn btn--ghost" onClick={onClose}>
                取消
              </button>
              <button
                className="btn btn--primary"
                onClick={() => void handleCreate()}
                disabled={submitting}
              >
                {submitting ? "创建中…" : "创建账号"}
              </button>
            </>
          ) : (
            <button className="btn btn--primary" onClick={onClose}>
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
