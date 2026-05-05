import { useState } from "react";
import { useToast } from "./Toast";
import "../styles/merchant-copy-card.css";

interface Props {
  text: string;
  successMessage?: string;
}

export default function MerchantCopyCard({
  text,
  successMessage = "商家沟通文案已复制到剪贴板",
}: Props) {
  const toast = useToast();
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("success");
      toast.show(successMessage, "success");
    } catch {
      setCopyState("error");
      toast.show("复制失败，请手动选中文案复制", "error");
    }
  }

  return (
    <button
      className="merchant-copy-card"
      data-copy-state={copyState}
      onClick={handleCopy}
      type="button"
    >
      <span className="merchant-copy-card__eyebrow">商家沟通文案</span>
      <strong className="merchant-copy-card__title">点击整段文案可直接复制到剪贴板</strong>
      <span className="merchant-copy-card__body">{text}</span>
      <span className="merchant-copy-card__foot">
        {copyState === "success"
          ? "已复制到剪贴板"
          : copyState === "error"
            ? "复制失败，请重试"
            : "点击文案内容可以直接复制到剪切板"}
      </span>
    </button>
  );
}
