import { IconDownload } from "./Icons";

interface Props {
  label: string;
  meta: string;
  disabled: boolean;
  title: string;
  onClick: () => void;
}

export default function BatchDownloadButton({
  label,
  meta,
  disabled,
  title,
  onClick,
}: Props) {
  return (
    <button
      className="batch-download-button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      <span className="batch-download-button__icon">
        <IconDownload style={{ width: 15, height: 15 }} />
      </span>
      <span className="batch-download-button__copy">
        <strong>{label}</strong>
        <span className="batch-download-button__meta">{meta}</span>
      </span>
    </button>
  );
}
