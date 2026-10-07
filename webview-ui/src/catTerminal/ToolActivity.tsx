import { useState } from 'react';

import type { CeoAttachment } from '../../../core/src/ceoDesk.js';
import { attachmentHref } from '../sessionToken.js';
import { type ActivityEntry, activityLine, activitySummary } from './activityWords.js';
import { ImageLightbox } from './ImageLightbox.js';

/** Small pictures a tool returned; a click opens the lightbox. */
function Thumbs({ images, onOpen }: { images: CeoAttachment[]; onOpen(f: CeoAttachment): void }) {
  return (
    <div className="flex flex-wrap gap-6" data-testid="tool-images">
      {images.map((f, n) => (
        <button
          key={n}
          type="button"
          onClick={() => onOpen(f)}
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
function ActivityItem({ entry, onOpen }: { entry: ActivityEntry; onOpen(f: CeoAttachment): void }) {
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
  const [picture, setPicture] = useState<CeoAttachment | null>(null);
  const images = tools.flatMap((t) => (t.kind === 'tool' ? (t.images ?? []) : []));
  const onlyThoughts = tools.every((t) => t.kind === 'thought');
  return (
    <div className="self-start max-w-full flex flex-col gap-6" data-testid="tool-row">
      {picture && (
        <ImageLightbox
          src={attachmentHref(picture.url)}
          alt={picture.name}
          onClose={() => setPicture(null)}
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
              <ActivityItem key={n} entry={t} onOpen={setPicture} />
            ))}
          </div>
        </details>
      )}
      {!open && images.length > 0 && <Thumbs images={images} onOpen={setPicture} />}
    </div>
  );
}
