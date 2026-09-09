import { useEffect, useState } from "react";
import {
  CURRENT_APP_VERSION,
  fetchMandatoryUpdate,
  type MandatoryUpdateInfo,
} from "../lib/app-update";
import { installAppUpdate, listenAppUpdateProgress, type AppUpdateProgress } from "../lib/tauri";

const EMPTY_PROGRESS: AppUpdateProgress = {
  phase: "downloading",
  downloadedBytes: 0,
  totalBytes: null,
  percent: 0,
};

interface Props {
  suspend?: boolean;
}

export default function MandatoryUpdateGate({ suspend = false }: Props) {
  const [update, setUpdate] = useState<MandatoryUpdateInfo | null>(null);
  const [checkingFailed, setCheckingFailed] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState("");
  const [progress, setProgress] = useState<AppUpdateProgress>(EMPTY_PROGRESS);

  useEffect(() => {
    let alive = true;
    if (suspend) {
      setUpdate(null);
      return () => {
        alive = false;
      };
    }
    fetchMandatoryUpdate()
      .then((result) => {
        if (alive) setUpdate(result);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setCheckingFailed(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, [suspend]);

  useEffect(() => {
    if (!update) return;
    let alive = true;
    let cleanup: (() => void) | null = null;
    listenAppUpdateProgress((nextProgress) => {
      if (!alive) return;
      setProgress({
        ...nextProgress,
        percent: Math.max(0, Math.min(100, Math.round(nextProgress.percent))),
      });
    })
      .then((unlisten) => {
        if (alive) {
          cleanup = unlisten;
        } else {
          unlisten();
        }
      })
      .catch(() => {
        // Web 环境没有 Tauri 事件时忽略，安装命令仍会给出错误提示。
      });
    return () => {
      alive = false;
      cleanup?.();
    };
  }, [update]);

  if (suspend) return null;
  if (!update) return null;

  async function handleInstall() {
    if (!update) return;
    setInstalling(true);
    setInstallError("");
    setProgress(EMPTY_PROGRESS);
    try {
      await installAppUpdate({
        installerUrl: update.installerUrl,
        latestVersion: update.latestVersion,
      });
    } catch (error: unknown) {
      setInstallError(error instanceof Error ? error.message : String(error));
      setInstalling(false);
    }
  }

  return (
    <div className="mandatory-update__mask" role="dialog" aria-modal="true">
      <div className="mandatory-update__dialog">
        <span className="mandatory-update__eyebrow">检测到新版本</span>
        <h2>需要更新后继续使用</h2>
        <p className="mandatory-update__desc">
          当前版本 v{CURRENT_APP_VERSION}，最新版本 v{update.latestVersion}。本次更新为强制更新，
          下载完成后会自动安装并重新打开软件。
        </p>

        {update.releaseNotes.length > 0 ? (
          <div className="mandatory-update__notes">
            <strong>更新内容</strong>
            <ul>
              {update.releaseNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {checkingFailed ? <p className="mandatory-update__error">{checkingFailed}</p> : null}
        {installError ? <p className="mandatory-update__error">{installError}</p> : null}

        {installing ? (
          <div className="mandatory-update__progress">
            <div className="mandatory-update__progress-head">
              <span>{progress.phase === "installing" ? "正在启动安装程序" : "正在下载安装包"}</span>
              <strong>{progress.percent}%</strong>
            </div>
            <div
              className="mandatory-update__progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div
                className="mandatory-update__progress-bar"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="mandatory-update__progress-meta">
              进度到 100% 后会自动安装，安装完成后自动打开软件。
            </p>
          </div>
        ) : null}

        <button className="btn btn--primary btn--lg" type="button" onClick={handleInstall} disabled={installing}>
          {installing ? "更新中..." : "自动更新"}
        </button>
      </div>
    </div>
  );
}
