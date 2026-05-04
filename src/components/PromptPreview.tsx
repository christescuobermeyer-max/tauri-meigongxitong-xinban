export default function PromptPreview({ title, text }: { title: string; text: string }) {
  return (
    <div className="prompt-preview">
      <div className="prompt-preview__header">{title}</div>
      <pre className="prompt-preview__body">{text}</pre>
    </div>
  );
}
