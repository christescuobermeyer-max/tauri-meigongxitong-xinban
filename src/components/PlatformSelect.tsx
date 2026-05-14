import { useEffect, useRef, useState } from "react";
import { PLATFORMS } from "../lib/platforms";
import type { Platform } from "../types";

interface Props {
  value: Platform | null;
  onChange: (v: Platform) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function PlatformSelect({
  value,
  onChange,
  placeholder = "请选择投放平台",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = PLATFORMS.find((p) => p.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id: Platform) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div
      className="platform-select"
      ref={wrapRef}
      data-open={open}
      data-empty={!selected}
    >
      <button
        type="button"
        className="platform-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="platform-select__lead">
          {selected ? (
            <>
              <span
                className="platform-select__swatch"
                style={{ background: selected.swatch }}
                aria-hidden="true"
              />
              <span className="platform-select__label">{selected.label}</span>
            </>
          ) : (
            <>
              <span className="platform-select__swatch platform-select__swatch--empty" aria-hidden="true" />
              <span className="platform-select__placeholder">{placeholder}</span>
            </>
          )}
        </span>
        <svg
          className="platform-select__chevron"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && !disabled && (
        <ul className="platform-select__menu" role="listbox" aria-label="投放平台">
          {PLATFORMS.map((p) => {
            const isActive = value === p.id;
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={isActive}
                className="platform-select__option"
                data-active={isActive}
                onClick={() => pick(p.id)}
              >
                <span
                  className="platform-select__swatch"
                  style={{ background: p.swatch }}
                  aria-hidden="true"
                />
                <span className="platform-select__option-label">{p.label}</span>
                {isActive && (
                  <svg
                    className="platform-select__check"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <path
                      d="M3.6 8.4l2.8 2.8 6-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
