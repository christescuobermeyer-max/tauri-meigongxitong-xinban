import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "../styles/close-confirmation.css";

export default function CloseConfirmation() {
  const dialog = useRef<HTMLDialogElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const [closing, setClosing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    const listener = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      const element = dialog.current;
      if (!active || !element || element.open) return;

      setFailed(false);
      element.showModal();
      continueButton.current?.focus();
    });
    void listener.catch((error) => {
      if (active) console.error("无法监听窗口关闭请求", error);
    });
    return () => {
      active = false;
      void listener.then((unlisten) => unlisten(), () => undefined);
    };
  }, []);

  async function confirmClose() {
    if (closing) return;
    setFailed(false);
    setClosing(true);
    try {
      await getCurrentWindow().destroy();
    } catch (error) {
      console.error("无法关闭窗口", error);
      setFailed(true);
      setClosing(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="close-confirmation"
      role="alertdialog"
      aria-labelledby="close-confirmation-title"
      aria-describedby="close-confirmation-description"
      onCancel={(event) => { if (closing) event.preventDefault(); }}
    >
      <h2 id="close-confirmation-title">确定关闭软件？</h2>
      <p id="close-confirmation-description">
        关闭后，未保存到本地的图片可能丢失。请先保存需要的图片。
      </p>
      {failed && <p className="close-confirmation__error" role="alert">关闭失败，请重试。</p>}
      <div className="close-confirmation__actions">
        <button ref={continueButton} type="button" className="btn btn--primary"
          onClick={() => dialog.current?.close()} disabled={closing}>
          继续使用
        </button>
        <button type="button" className="btn btn--secondary" onClick={confirmClose} disabled={closing}>
          确认关闭
        </button>
      </div>
    </dialog>
  );
}
