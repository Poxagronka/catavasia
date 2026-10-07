import { useEffect } from 'react';

const ARROW_CLASS =
  'absolute top-1/2 -translate-y-1/2 w-32 h-32 bg-bg-dark border-2 border-border text-text hover:border-accent cursor-pointer';

/**
 * A full-size view of one image over the page. Esc, the backdrop or the x
 * closes it. With `onStep` (several pictures of one tool call) the arrow keys
 * and the on-screen arrows move to the previous or next picture.
 */
export function ImageLightbox({
  src,
  alt,
  onClose,
  onStep,
  counter,
}: {
  src: string;
  alt: string;
  onClose(): void;
  onStep?(step: 1 | -1): void;
  /** "2 / 5" under the picture. */
  counter?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (e.key !== 'Escape' && !(step && onStep)) return;
      // The keys move or close the picture only, not the dock or a modal under it.
      e.stopPropagation();
      e.preventDefault();
      if (step) onStep?.(step);
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onStep]);

  const arrow = (step: 1 | -1) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onStep?.(step);
      }}
      title={step < 0 ? 'Previous (Left arrow)' : 'Next (Right arrow)'}
      aria-label={step < 0 ? 'Previous picture' : 'Next picture'}
      className={`${ARROW_CLASS} ${step < 0 ? 'left-12' : 'right-12'}`}
      data-testid={step < 0 ? 'image-lightbox-prev' : 'image-lightbox-next'}
    >
      {step < 0 ? '<' : '>'}
    </button>
  );

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
        className="max-w-full max-h-full object-contain border-2 border-border rounded-[8px]"
      />
      {counter && (
        <span className="absolute bottom-6 text-sm text-text" data-testid="image-lightbox-counter">
          {counter}
        </span>
      )}
      {onStep && arrow(-1)}
      {onStep && arrow(1)}
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
