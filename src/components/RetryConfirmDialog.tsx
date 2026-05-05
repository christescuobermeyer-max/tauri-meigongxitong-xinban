import { useEffect } from "react";
import "../styles/retry-confirm-dialog.css";

interface Props {
  open: boolean;
  title: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function RetryConfirmDialog({
  open,
  title,
  message = "重新生成会再次调用生图接口，可能产生费用。请确认是否继续。",
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div className="retry-confirm" role="presentation" onClick={onCancel}>
      <div
        aria-modal="true"
        className="retry-confirm__dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="retry-confirm__eyebrow">防误触确认</span>
        <h3 className="retry-confirm__title">{title}</h3>
        <p className="retry-confirm__message">{message}</p>
        <div className="retry-confirm__actions">
          <button className="btn btn--secondary" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn--primary" type="button" onClick={onConfirm}>
            确认重新生成
          </button>
        </div>
      </div>
    </div>
  );
}
