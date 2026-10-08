import { useState } from 'react';

import type { CeoAttachment } from '../../../core/src/ceoDesk.js';
import { attachmentHref } from '../sessionToken.js';
import { type ActivityEntry, activityLine, activitySummary, stepIndex } from './activityWords.js';
import { ImageLightbox } from './ImageLightbox.js';

/** The pictures of one tool call and the one the lightbox shows. */
interface Gallery {
  images: CeoAttachment[];
  index: number;
}

type OpenPicture = (images: CeoAttachment[], index: number) => void;

/** Small pictures a tool returned; a click opens the lightbox on the call's pictures. */
function Thumbs({ images, onOpen }: { images: CeoAttachment[]; onOpen: OpenPicture }) {
  return (
    <div className="flex flex-wrap gap-6" data-testid="tool-images">
      {images.map((f, n) => (
        <button
          key={n}
          type="button"
          onClick={() => onOpen(images, n)}
          title="Click to enlarge"
          className="p-0 bg-transparent border-0 cursor-zoom-in"
        >
          <img
            src={attachmentHref(f.url)}
            alt={f.name}
            className="min-w-[40px] max-w-[160px] max-h-[120px] object-contain border-2 border-border hover:border-accent rounded-[8px] block"
            data-testid="tool-thumb"
          />
        </button>
      ))}
    </div>
  );
}

/** One call: its plain line; it opens to the command or file and a short result. */
function ActivityItem({ entry, onOpen }: { entry: ActivityEntry; onOpen: OpenPicture }) {
  const { verb, target } = activityLine(entry);
  const line = (
    <>
      {verb}
      {target && <span className="prose-code text-text-soft break-all"> {target}</span>}
      {entry.kind === 'tool' && entry.isError && (
        <span className="text-status-error"> (did not work)</span>
      )}
    </>
  );
  if (
    entry.kind === 'thought' ||
    (!entry.about && !entry.input && !entry.result && !entry.images?.length)
  ) {
    return (
      <div className="break-words" data-testid="activity-item">
        {line}
      </div>
    );
  }
  return (
    <details className="tool-call" data-testid="activity-item">
      <summary className="cursor-pointer hover:text-text list-none break-words">{line}</summary>
      <div className="flex flex-col gap-4 mt-4 mb-6">
        {entry.about && entry.text && (
          <pre className="tool-detail pixel-scrollbar">{entry.text}</pre>
        )}
        {entry.input && <pre className="tool-detail pixel-scrollbar">{entry.input}</pre>}
        {entry.result && (
          <pre
            className={`tool-detail pixel-scrollbar ${entry.isError ? 'text-status-error' : ''}`}
            data-testid="tool-result"
          >
            {entry.result}
          </pre>
        )}
        {entry.images?.length ? <Thumbs images={entry.images} onOpen={onOpen} /> : null}
      </div>
    </details>
  );
}

/**
 * A run of tool calls and thoughts: one grey line in plain words ("Looked at 3
 * files, ran 2 commands >") that opens to one line per call. Pictures the
 * tools returned also show under the closed line.
 */
export function ToolRow({ tools }: { tools: ActivityEntry[] }) {
  const [open, setOpen] = useState(false);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const openPicture = (images: CeoAttachment[], index: number) => setGallery({ images, index });
  // Each call's pictures stay its own gallery: the arrows never cross to another call.
  const calls = tools.flatMap((t) => (t.kind === 'tool' && t.images?.length ? [t.images] : []));
  const onlyThoughts = tools.every((t) => t.kind === 'thought');
  const picture = gallery?.images[gallery.index];
  const many = !!gallery && gallery.images.length > 1;
  return (
    <div className="self-start max-w-full flex flex-col gap-6" data-testid="tool-row">
      {gallery && picture && (
        <ImageLightbox
          src={attachmentHref(picture.url)}
          alt={picture.name}
          onClose={() => setGallery(null)}
          counter={many ? `${gallery.index + 1} / ${gallery.images.length}` : undefined}
          onStep={
            many
              ? (step) =>
                  setGallery({
                    ...gallery,
                    index: stepIndex(gallery.index, gallery.images.length, step),
                  })
              : undefined
          }
        />
      )}
      {onlyThoughts ? (
        <div className="prose-body prose-small text-text-muted" data-testid="tool-summary">
          {activitySummary(tools)}
        </div>
      ) : (
        <details
          className="tool-row max-w-full prose-body prose-small text-text-muted"
          onToggle={(e) => setOpen(e.currentTarget.open)}
        >
          <summary className="cursor-pointer hover:text-text list-none" data-testid="tool-summary">
            {activitySummary(tools)} <span className="tool-row-chevron">&gt;</span>
          </summary>
          <div className="flex flex-col gap-4 mt-4 pl-8 border-l-2 border-border">
            {tools.map((t, n) => (
              <ActivityItem key={n} entry={t} onOpen={openPicture} />
            ))}
          </div>
        </details>
      )}
      {!open && calls.length > 0 && (
        <div className="flex flex-wrap gap-6">
          {calls.map((images, n) => (
            <Thumbs key={n} images={images} onOpen={openPicture} />
          ))}
        </div>
      )}
    </div>
  );
}
