import { useEffect, useRef, useState } from "react";
import type { TimeRange } from "./VideoEditor";

interface TimelineSliderProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onRangeChange: (range: TimeRange) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function TimelineSlider({ duration, currentTime, onSeek, onRangeChange }: TimelineSliderProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(duration);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (duration > 0) {
      setStartTime(0);
      setEndTime(duration);
      onRangeChange({ start: 0, end: duration });
    }
  }, [duration]);

  function handleTrackClick(event: React.MouseEvent) {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, percent)) * duration);
  }

  function handleHandleDrag(type: "start" | "end", event: React.MouseEvent) {
    event.stopPropagation();

    function handleMove(moveEvent: MouseEvent) {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      const time = percent * duration;

      if (type === "start") {
        const nextStart = Math.min(time, endTime - 0.5);
        setStartTime(nextStart);
        onRangeChange({ start: nextStart, end: endTime });
      } else {
        const nextEnd = Math.max(time, startTime + 0.5);
        setEndTime(nextEnd);
        onRangeChange({ start: startTime, end: nextEnd });
      }
    }

    function handleUp() {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    }

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }

  const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endTime / duration) * 100 : 0;
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="video-signboard-timeline">
      <div ref={trackRef} className="video-signboard-timeline__track" onClick={handleTrackClick}>
        <div
          className="video-signboard-timeline__range"
          style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
        />
        <div className="video-signboard-timeline__playhead" style={{ left: `${currentPercent}%` }} />
        <button
          className="video-signboard-timeline__handle"
          type="button"
          style={{ left: `${startPercent}%` }}
          aria-label="调整开始时间"
          onMouseDown={(event) => handleHandleDrag("start", event)}
        />
        <button
          className="video-signboard-timeline__handle"
          type="button"
          style={{ left: `${endPercent}%` }}
          aria-label="调整结束时间"
          onMouseDown={(event) => handleHandleDrag("end", event)}
        />
      </div>
      <div className="video-signboard-timeline__meta">
        <span>开始 {formatTime(startTime)}</span>
        <span>截取 {formatTime(Math.max(0, endTime - startTime))}</span>
        <span>结束 {formatTime(endTime)}</span>
      </div>
    </div>
  );
}
