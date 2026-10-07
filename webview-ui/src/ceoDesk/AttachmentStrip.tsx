import { formatSize } from '../../../core/src/ceoDesk.js';
import type { DraftAttachment } from './attachState.js';

/** The composer's attachments: image thumbnails and file chips, each with a remove x. */
export function AttachmentStrip({
  files,
  onRemove,
}: {
  files: DraftAttachment[];
  onRemove(id: number): void;
}) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap items-end gap-6" data-testid="dock-attachments">
      {files.map((f) =>
        f.image ? (
          <div key={f.id} className="relative" title={`${f.name} (${formatSize(f.size)})`}>
            <img
              src={f.preview}
              alt={f.name}
              className="w-56 h-56 object-cover border-2 border-border rounded-[8px] block"
              data-testid="dock-thumb"
            />
            <RemoveButton name={f.name} onClick={() => onRemove(f.id)} />
          </div>
        ) : (
          <div
            key={f.id}
            className="relative flex items-center gap-4 max-w-[220px] h-28 pl-6 pr-24 border-2 border-border bg-bg-dark text-xs"
            data-testid="dock-chip"
          >
            <span className="truncate">{f.name}</span>
            <span className="shrink-0 text-text-muted">{formatSize(f.size)}</span>
            <RemoveButton name={f.name} onClick={() => onRemove(f.id)} />
          </div>
        ),
      )}
    </div>
  );
}

function RemoveButton({ name, onClick }: { name: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Remove ${name}`}
      aria-label={`Remove ${name}`}
      className="absolute -top-6 -right-6 w-18 h-18 leading-none text-2xs bg-bg-dark border-2 border-border text-text-muted hover:text-text hover:border-accent cursor-pointer"
      data-testid="dock-attachment-remove"
    >
      x
    </button>
  );
}
