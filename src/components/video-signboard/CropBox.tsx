import { useEffect, useState, type RefObject } from "react";
import type { CropArea } from "./VideoEditor";

interface Props {
  containerRef: RefObject<HTMLDivElement>;
  videoDimensions: { width: number; height: number };
  onCropChange: (crop: CropArea) => void;
}

const TARGET_RATIO = 16 / 9;

export default function CropBox({ containerRef, videoDimensions, onCropChange }: Props) {
  const [box, setBox] = useState({ x: 20, y: 20, width: 260, height: 146 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  function getVideoBounds() {
    if (!containerRef.current) return null;
    const container = containerRef.current.getBoundingClientRect();
    const video = containerRef.current.querySelector("video");
    if (!video) return null;

    const videoRect = video.getBoundingClientRect();
    return {
      x: videoRect.left - container.left,
      y: videoRect.top - container.top,
      width: videoRect.width,
      height: videoRect.height,
    };
  }

  function calculateVideoCrop(currentBox: typeof box) {
    const videoRect = getVideoBounds();
    if (!videoRect || videoRect.width <= 0 || videoRect.height <= 0) return;

    const scaleX = videoDimensions.width / videoRect.width;
    const scaleY = videoDimensions.height / videoRect.height;

    onCropChange({
      x: Math.max(0, Math.round((currentBox.x - videoRect.x) * scaleX)),
      y: Math.max(0, Math.round((currentBox.y - videoRect.y) * scaleY)),
      width: Math.round(currentBox.width * scaleX),
      height: Math.round(currentBox.height * scaleY),
    });
  }

  useEffect(() => {
    const videoRect = getVideoBounds();
    if (!videoRect || videoRect.width <= 0 || videoRect.height <= 0) return;
    const maxWidth = Math.min(videoRect.width, videoRect.height * TARGET_RATIO);
    const initialWidth = Math.min(360, maxWidth * 0.86);
    const initialHeight = initialWidth / TARGET_RATIO;
    const initialBox = {
      x: videoRect.x + (videoRect.width - initialWidth) / 2,
      y: videoRect.y + (videoRect.height - initialHeight) / 2,
      width: initialWidth,
      height: initialHeight,
    };
    setBox(initialBox);
    calculateVideoCrop(initialBox);
  }, [containerRef, videoDimensions.width, videoDimensions.height]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const videoRect = getVideoBounds();
      if (!videoRect) return;

      if (isDragging) {
        let newX = event.clientX - dragStart.x;
        let newY = event.clientY - dragStart.y;
        newX = Math.max(videoRect.x, Math.min(newX, videoRect.x + videoRect.width - box.width));
        newY = Math.max(videoRect.y, Math.min(newY, videoRect.y + videoRect.height - box.height));
        const nextBox = { ...box, x: newX, y: newY };
        setBox(nextBox);
        calculateVideoCrop(nextBox);
      }

      if (isResizing) {
        const deltaX = event.clientX - dragStart.x;
        const maxWidth = Math.min(
          videoRect.x + videoRect.width - box.x,
          (videoRect.y + videoRect.height - box.y) * TARGET_RATIO
        );
        const minWidth = Math.min(110, maxWidth);
        const width = Math.max(minWidth, Math.min(maxWidth, box.width + deltaX));
        const height = width / TARGET_RATIO;
        const nextBox = { ...box, width, height };
        setBox(nextBox);
        setDragStart({ x: event.clientX, y: event.clientY });
        calculateVideoCrop(nextBox);
      }
    }

    function handleMouseUp() {
      setIsDragging(false);
      setIsResizing(false);
    }

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [box, containerRef, dragStart, isDragging, isResizing]);

  return (
    <div
      className="video-signboard-crop"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
        setDragStart({ x: event.clientX - box.x, y: event.clientY - box.y });
      }}
    >
      <span className="video-signboard-crop__label">16:9 店招区域</span>
      <button
        className="video-signboard-crop__handle"
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsResizing(true);
          setDragStart({ x: event.clientX, y: event.clientY });
        }}
        title="调整裁剪区域"
      />
      <div className="video-signboard-crop__grid" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}
