import { useState } from 'react';

import { ENGINE_LABELS } from '../../cats/catsApi.js';
import { buildTree, isInSubtree, type TreeNode } from '../../cats/hierarchy.js';
import { catsApi } from '../../cats/localCatsAdapter.js';
import { useCats } from '../../cats/useCats.js';
import { CAT_LIST_ZOOM } from '../../constants.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { CatSprite } from './CatSprite.js';

function Badge({ children, title }: { children: string; title: string }) {
  return (
    <span title={title} className="text-2xs px-4 border-2 border-border bg-bg-dark text-text-muted">
      {children}
    </span>
  );
}

interface DragState {
  dragId: string | null;
  overId: string | null;
}

function NodeView({
  node,
  depth,
  drag,
  setDrag,
  onDrop,
  canDrop,
}: {
  node: TreeNode;
  depth: number;
  drag: DragState;
  setDrag: (d: DragState) => void;
  onDrop: (targetId: string) => void;
  canDrop: (targetId: string) => boolean;
}) {
  const { cat } = node;
  const isBoss = depth === 0;
  const dropOk = drag.dragId !== null && canDrop(cat.id);
  const dimmed = drag.dragId !== null && !dropOk && drag.dragId !== cat.id;
  return (
    <div className="flex flex-col">
      <div
        draggable
        data-cat-id={cat.id}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', cat.id);
          e.dataTransfer.effectAllowed = 'move';
          setDrag({ dragId: cat.id, overId: null });
        }}
        onDragEnd={() => setDrag({ dragId: null, overId: null })}
        onDragOver={(e) => {
          if (!dropOk) return;
          e.preventDefault();
          if (drag.overId !== cat.id) setDrag({ ...drag, overId: cat.id });
        }}
        onDragLeave={() => drag.overId === cat.id && setDrag({ ...drag, overId: null })}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(cat.id);
        }}
        className={`flex gap-8 items-center p-4 pr-8 border-2 rounded-none cursor-grab self-start w-440 ${
          drag.overId === cat.id
            ? 'bg-active-bg border-accent-bright'
            : isBoss
              ? 'bg-btn-bg border-accent'
              : 'bg-btn-bg border-transparent'
        } ${dimmed ? 'opacity-40' : ''}`}
      >
        <CatSprite appearance={cat.appearance} zoom={CAT_LIST_ZOOM} className="-my-8" />
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <span className="text-sm truncate">
            {isBoss && <span className="text-status-permission">★ </span>}
            {cat.name}
            <span className="text-2xs text-text-muted"> {isBoss ? 'Boss' : cat.role}</span>
          </span>
          <span className="flex gap-4 flex-wrap">
            <Badge title="Engine">{ENGINE_LABELS[cat.engine]}</Badge>
            <Badge title="Model">{cat.model}</Badge>
            <Badge title="Effort">{cat.effort}</Badge>
          </span>
        </div>
        {!isBoss && (
          <Button
            size="sm"
            variant="ghost"
            title="Make this cat the boss; the old boss reports to it"
            onClick={() => catsApi.promoteToBoss(cat.id)}
          >
            Promote to boss
          </Button>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="flex flex-col gap-4 ml-24 pl-16 pt-4 border-l-2 border-border">
          {node.children.map((child) => (
            <NodeView
              key={child.cat.id}
              node={child}
              depth={depth + 1}
              drag={drag}
              setDrag={setDrag}
              onDrop={onDrop}
              canDrop={canDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Org tree editor: drag a cat onto another to make it a report. */
export function HierarchyModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { cats } = useCats();
  const [drag, setDrag] = useState<DragState>({ dragId: null, overId: null });
  const [error, setError] = useState<string | null>(null);
  const tree = buildTree(cats);

  // Dropping onto the current parent is a no-op, onto itself or a report is a cycle.
  const canDrop = (targetId: string) => {
    const dragged = cats.find((c) => c.id === drag.dragId);
    return !!dragged && dragged.parentId !== targetId && !isInSubtree(cats, dragged.id, targetId);
  };
  const onDrop = (targetId: string) => {
    const id = drag.dragId;
    setDrag({ dragId: null, overId: null });
    if (!id) return;
    try {
      catsApi.setParent(id, targetId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hierarchy" className="w-[min(760px,96vw)]">
      <div className="flex flex-col gap-8 px-10 pb-10">
        <div className="text-xs text-text-muted">
          Drag a cat onto another cat to make it a report. The boss gets the task first and
          delegates down the tree.
        </div>
        {error && <div className="text-xs text-status-error">{error}</div>}
        <div className="max-h-[70vh] overflow-auto">
          {tree ? (
            <NodeView
              node={tree}
              depth={0}
              drag={drag}
              setDrag={setDrag}
              onDrop={onDrop}
              canDrop={canDrop}
            />
          ) : (
            <div className="text-sm text-text-muted">No agent cats yet. Add them in Cats.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
