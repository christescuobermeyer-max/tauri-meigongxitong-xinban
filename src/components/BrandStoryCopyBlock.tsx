import { useState } from "react";
import { useToast } from "./Toast";
import type { BrandCopy } from "../types";

interface Props {
  copy: BrandCopy;
}

export default function BrandStoryCopyBlock({ copy }: Props) {
  return (
    <div className="brand-story-copy">
      <CopyLine label="主文案" content={copy.mainSlogan} />
      <CopyLine label="副文案" content={copy.subSlogan} />
      <CopyLine label="品牌特色标题" content={copy.featureTitle} />
      <CopyLine label="品牌亮点文案" content={copy.featureContent} multiline />
      <div className="brand-story-copy__group">
        <div className="brand-story-copy__group-title">
          <span>·</span>
          <strong>细节展示板块</strong>
        </div>
        <CopySubLine label="总标题" content={copy.detailsTitle || "详细卖点"} />
        {copy.details.map((detail, index) => (
          <div key={index} className="brand-story-copy__detail">
            <div className="brand-story-copy__detail-head">- 细节 {index + 1}：</div>
            <CopySubLine label="标题" content={detail.title} />
            <CopySubLine label="文案" content={detail.content} multiline />
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyLine({
  label,
  content,
  multiline,
}: {
  label: string;
  content: string;
  multiline?: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.show(`${label} 已复制`, "success");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.show("复制失败，请手动选中复制", "error");
    }
  }

  return (
    <button
      type="button"
      className="brand-story-copy__line"
      data-copied={copied}
      data-multiline={multiline ? "true" : "false"}
      onClick={handleCopy}
    >
      <span className="brand-story-copy__dot">·</span>
      <strong className="brand-story-copy__label">{label}：</strong>
      <span className="brand-story-copy__content">{content || "—"}</span>
      <span className="brand-story-copy__hint">{copied ? "已复制" : "点击复制"}</span>
    </button>
  );
}

function CopySubLine({
  label,
  content,
  multiline,
}: {
  label: string;
  content: string;
  multiline?: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.show(`${label} 已复制`, "success");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.show("复制失败，请手动选中复制", "error");
    }
  }

  return (
    <button
      type="button"
      className="brand-story-copy__subline"
      data-copied={copied}
      data-multiline={multiline ? "true" : "false"}
      onClick={handleCopy}
    >
      <span className="brand-story-copy__sublabel">- {label}：</span>
      <span className="brand-story-copy__content">{content || "—"}</span>
      <span className="brand-story-copy__hint">{copied ? "已复制" : "复制"}</span>
    </button>
  );
}
