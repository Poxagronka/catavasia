import { useEffect, useState } from 'react';

const COPIED_MS = 1500;

/** Two overlapping sheets, drawn on a pixel grid. */
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" shapeRendering="crispEdges" aria-hidden>
      <path d="M1 1h8v2H3v6H1z M5 5h8v8H5z M7 7v4h4V7z" fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/**
 * Copies `text()` to the clipboard and says "Copied" for a moment.
 * `label` shows a word next to the icon (code blocks); without it the button is the icon only.
 */
export function CopyButton({
  text,
  title,
  label,
  className = '',
  testId,
}: {
  text: () => string;
  title: string;
  label?: string;
  className?: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  // No clipboard outside a secure context (a LAN address over http): the click does nothing.
  const copy = () =>
    void navigator.clipboard?.writeText(text()).then(
      () => setCopied(true),
      () => {},
    );
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : title}
      aria-label={title}
      className={`flex items-center gap-4 bg-transparent border-0 p-2 cursor-pointer text-text-muted hover:text-text text-2xs ${className}`}
      data-testid={testId}
    >
      <CopyIcon />
      {copied ? <span>Copied</span> : label && <span>{label}</span>}
    </button>
  );
}
