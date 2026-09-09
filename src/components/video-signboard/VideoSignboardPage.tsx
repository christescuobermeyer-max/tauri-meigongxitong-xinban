import { IconAlert, IconDownload, IconFolder, IconRefresh, IconScissors, IconUpload, IconVideo } from "../Icons";
import { useToast } from "../Toast";
import VideoEditor from "./VideoEditor";
import VideoHistory from "./VideoHistory";
import { useVideoSignboard } from "./useVideoSignboard";

export default function VideoSignboardPage() {
  const toast = useToast();
  const {
    exportPath,
    inputUrl,
    setInputUrl,
    videoSource,
    previewUrl,
    isLoading,
    isProcessing,
    processingTarget,
    progress,
    error,
    category,
    customFileName,
    setCustomFileName,
    includeAudio,
    setIncludeAudio,
    refreshTrigger,
    handleParse,
    handleSelectLocalVideo,
    handleProcess,
    handleReset,
    openExportFolder,
    setCropArea,
    setTimeRange,
  } = useVideoSignboard({ onToast: toast.show });

  function handleVideoError(message: string) {
    toast.show(message, "error");
  }

  return (
    <div className="video-signboard">
      <section className="card video-signboard__main">
        <div className="card__header video-signboard__header">
          <div className="card__heading">
            <div className="card__title">
              <IconVideo />
              <span>外卖视频店招制作工具</span>
            </div>
            <div className="card__hint">支持小红书、抖音链接解析，也支持本地视频裁剪导出。</div>
          </div>
          <div className="video-signboard__header-actions">
            {previewUrl ? (
              <button className="btn btn--secondary btn--sm" type="button" onClick={handleReset} disabled={isProcessing}>
                <IconRefresh style={{ width: 13, height: 13 }} />
                重新选择
              </button>
            ) : null}
            <button className="btn btn--secondary btn--sm" type="button" onClick={openExportFolder} disabled={!exportPath}>
              <IconFolder style={{ width: 13, height: 13 }} />
              打开导出文件夹
            </button>
          </div>
        </div>

        <div className="card__body video-signboard__body">
          <div className="video-signboard__source">
            <label className="field">
              <span className="field__label">视频链接（小红书 / 抖音）</span>
              <textarea
                className="textarea video-signboard__textarea"
                value={inputUrl}
                onChange={(event) => setInputUrl(event.target.value)}
                disabled={isLoading || isProcessing}
                placeholder="粘贴小红书或抖音分享链接..."
              />
              <span className="field__hint">也可以直接上传本地 MP4 / MOV / MKV / AVI / WEBM 视频。</span>
            </label>
            <div className="video-signboard__source-actions">
              <button className="btn btn--primary" type="button" onClick={handleParse} disabled={isLoading || isProcessing}>
                <IconVideo style={{ width: 14, height: 14 }} />
                {isLoading ? "解析中..." : "解析链接"}
              </button>
              <button className="btn btn--secondary" type="button" onClick={handleSelectLocalVideo} disabled={isLoading || isProcessing}>
                <IconUpload style={{ width: 14, height: 14 }} />
                上传本地视频
              </button>
            </div>
          </div>

          {error ? (
            <div className="video-signboard__alert" role="alert">
              <IconAlert style={{ width: 15, height: 15 }} />
              <span>{error}</span>
            </div>
          ) : null}

          {videoSource ? (
            <div className="video-signboard__meta">
              {videoSource.type === "remote" ? (
                <>
                  <span className="badge" data-tone={videoSource.info.platform === "douyin" ? "info" : "success"}>
                    {videoSource.info.platform === "douyin" ? "抖音" : "小红书"}
                  </span>
                  <strong>{videoSource.info.title}</strong>
                  <span>@{videoSource.info.author}</span>
                </>
              ) : (
                <>
                  <span className="badge">本地视频</span>
                  <strong>{videoSource.displayName}</strong>
                </>
              )}
            </div>
          ) : null}

          {videoSource ? (
            <div className="video-signboard__filename-grid">
              {videoSource.type === "remote" ? (
                <label className="field">
                  <span className="field__label">识别品类</span>
                  <input className="input" value={category} disabled />
                </label>
              ) : null}
              <label className="field">
                <span className="field__label">视频名称</span>
                <input
                  className="input"
                  value={customFileName}
                  onChange={(event) => setCustomFileName(event.target.value)}
                  disabled={isProcessing}
                  placeholder="输入导出文件名..."
                />
              </label>
            </div>
          ) : null}

          {previewUrl ? (
            <div className="video-signboard__editor-block">
              <div className="video-signboard__section-title">
                <IconScissors style={{ width: 15, height: 15 }} />
                <span>裁剪编辑</span>
              </div>
              <VideoEditor
                videoUrl={previewUrl}
                onCropChange={setCropArea}
                onTimeRangeChange={setTimeRange}
                onVideoError={handleVideoError}
              />
              <div className="video-signboard__export-settings">
                <div className="video-signboard__export-setting-copy">
                  <span className="video-signboard__export-setting-label">导出声音</span>
                  <span className="video-signboard__export-setting-hint">
                    {includeAudio ? "保留原视频音轨" : "导出无声视频"}
                  </span>
                </div>
                <label className="video-signboard__sound-toggle">
                  <input
                    type="checkbox"
                    checked={includeAudio}
                    onChange={(event) => setIncludeAudio(event.target.checked)}
                    disabled={isProcessing}
                    aria-label={includeAudio ? "关闭导出声音" : "开启导出声音"}
                  />
                  <span className="video-signboard__sound-toggle-track" aria-hidden="true" />
                  <span className="video-signboard__sound-toggle-value">{includeAudio ? "开启" : "关闭"}</span>
                </label>
              </div>
              <div className="video-signboard__export-actions">
                <button className="btn btn--primary btn--lg" type="button" onClick={() => handleProcess("meituan")} disabled={isProcessing}>
                  <IconDownload style={{ width: 15, height: 15 }} />
                  {isProcessing && processingTarget === "meituan" ? `处理中 ${progress}%` : "导出为美团视频店招"}
                </button>
                <button className="btn btn--secondary btn--lg" type="button" onClick={() => handleProcess("taobaoFlash")} disabled={isProcessing}>
                  <IconDownload style={{ width: 15, height: 15 }} />
                  {isProcessing && processingTarget === "taobaoFlash" ? `处理中 ${progress}%` : "导出为淘宝闪购视频店招"}
                </button>
              </div>
            </div>
          ) : (
            <div className="video-signboard__empty">
              <IconVideo style={{ width: 36, height: 36 }} />
              <strong>粘贴视频链接或上传本地视频开始制作</strong>
              <span>输出 MP4，可用于美团视频店招或淘宝闪购视频店招。</span>
            </div>
          )}
        </div>
      </section>

      <VideoHistory exportPath={exportPath} refreshTrigger={refreshTrigger} onToast={toast.show} />
    </div>
  );
}
