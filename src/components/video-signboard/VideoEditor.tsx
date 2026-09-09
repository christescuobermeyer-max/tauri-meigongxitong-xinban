import { useRef, useState } from "react";
import { IconPause, IconPlay, IconRefresh } from "../Icons";
import CropBox from "./CropBox";
import TimelineSlider from "./TimelineSlider";

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

interface Props {
  videoUrl: string;
  onCropChange: (crop: CropArea) => void;
  onTimeRangeChange: (range: TimeRange) => void;
  onVideoError?: (message: string) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function VideoEditor({ videoUrl, onCropChange, onTimeRangeChange, onVideoError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [timeRange, setTimeRange] = useState<TimeRange>({ start: 0, end: 0 });

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
    const initialRange = { start: 0, end: video.duration };
    setTimeRange(initialRange);
    onTimeRangeChange(initialRange);
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    const current = video.currentTime;
    setCurrentTime(current);
    if (current >= timeRange.end && isPlaying) {
      video.currentTime = timeRange.start;
      setCurrentTime(timeRange.start);
    }
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      return;
    }
    if (video.currentTime < timeRange.start || video.currentTime >= timeRange.end) {
      video.currentTime = timeRange.start;
      setCurrentTime(timeRange.start);
    }
    void video.play();
    setIsPlaying(true);
  }

  function resetPlayhead() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = timeRange.start;
    video.pause();
    setCurrentTime(timeRange.start);
    setIsPlaying(false);
  }

  function handleSeek(time: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  }

  function handleRangeChange(range: TimeRange) {
    setTimeRange(range);
    onTimeRangeChange(range);
    const video = videoRef.current;
    if (video && (video.currentTime < range.start || video.currentTime > range.end)) {
      video.currentTime = range.start;
      setCurrentTime(range.start);
    }
  }

  function handleVideoError() {
    onVideoError?.("视频预览加载失败，请换用 MP4，或重新上传后让系统转码预览。");
  }

  return (
    <div className="video-signboard-editor">
      <div ref={containerRef} className="video-signboard-editor__stage">
        <video
          ref={videoRef}
          src={videoUrl}
          className="video-signboard-editor__video"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          onError={handleVideoError}
          preload="metadata"
        />
        {videoDimensions.width > 0 ? (
          <CropBox containerRef={containerRef} videoDimensions={videoDimensions} onCropChange={onCropChange} />
        ) : null}
      </div>

      <div className="video-signboard-editor__controls">
        <button className="icon-btn" type="button" onClick={togglePlay} title={isPlaying ? "暂停" : "播放"}>
          {isPlaying ? <IconPause /> : <IconPlay />}
        </button>
        <button className="icon-btn" type="button" onClick={resetPlayhead} title="回到片段开始">
          <IconRefresh />
        </button>
        <span className="video-signboard-editor__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {duration > 0 ? (
        <TimelineSlider
          duration={duration}
          currentTime={currentTime}
          onSeek={handleSeek}
          onRangeChange={handleRangeChange}
        />
      ) : null}
    </div>
  );
}
