import { useEffect } from 'react';

/** A full-size view of one image over the page. Esc, the backdrop or the x closes it. */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose(): void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc closes the picture only, not the dock or a modal under it.
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-24 bg-black/80 cursor-zoom-out"
      style={{ zIndex: 100 }}
      onClick={onClose}
      role="dialog"
      aria-label={alt}
      data-testid="image-lightbox"
    >
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain border-2 border-border shadow-pixel"
      />
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        aria-label="Close"
        className="absolute top-12 right-12 w-32 h-32 bg-bg-dark border-2 border-border text-text hover:border-accent cursor-pointer"
        data-testid="image-lightbox-close"
      >
        x
      </button>
    </div>
  );
}
