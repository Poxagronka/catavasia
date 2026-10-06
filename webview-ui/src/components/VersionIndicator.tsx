import { useState } from 'react';

interface VersionIndicatorProps {
  currentVersion: string;
  onOpenChangelog: () => void;
}

export function VersionIndicator({ currentVersion, onOpenChangelog }: VersionIndicatorProps) {
  const [labelHovered, setLabelHovered] = useState(false);

  if (!currentVersion) return null;

  return (
    <>
      {/* Hover tooltip — "See what's new" appears on label hover */}
      {labelHovered && (
        <div
          onClick={onOpenChangelog}
          className="absolute bottom-42 right-28 z-20 pixel-panel py-6 px-12 cursor-pointer text-sm whitespace-nowrap"
        >
          See what's new!
        </div>
      )}
      {/* Version label — always visible */}
      <div
        onMouseEnter={() => setLabelHovered(true)}
        onMouseLeave={() => setLabelHovered(false)}
        onClick={onOpenChangelog}
        className="absolute bottom-8 right-28 z-20 text-lg cursor-pointer select-none pr-2 transition-opacity duration-200"
        style={{ opacity: labelHovered ? 0.8 : 0.4 }}
      >
        v{currentVersion}
      </div>
    </>
  );
}
