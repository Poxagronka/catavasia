import { useMemo, useRef, useState } from 'react';

import { BREED_IDS } from '../../cats/catArt.js';
import { useCatCeo } from '../../cats/catCeoClient.js';
import type { Appearance, CatProfile } from '../../cats/catsApi.js';
import { catsApi } from '../../cats/catsClient.js';
import { buildTree, draftReport, isInSubtree } from '../../cats/hierarchy.js';
import { layoutOrgChart } from '../../cats/orgLayout.js';
import { useCats } from '../../cats/useCats.js';
import { CAT_CEO_ID, CAT_LIST_ZOOM, CAT_NAMES } from '../../constants.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { CatSprite } from './CatSprite.js';
import { DeleteConfirm, type DropLook, NodeMenu, OrgNode, QuickEdit } from './OrgNode.js';

interface DragState {
  dragId: string | null;
  overId: string | null;
}

type Pop = { kind: 'edit' | 'delete' | 'menu'; id: string } | null;

/** Orthogonal connectors in SVG: 2px lines on whole pixels. */
function Connectors({
  paths,
  width,
  height,
}: {
  paths: { d: string; hot: boolean }[];
  width: number;
  height: number;
}) {
  return (
    <svg width={width} height={height} className="absolute inset-0" shapeRendering="crispEdges">
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={p.hot ? 'var(--color-accent-bright)' : 'var(--color-border)'}
          strokeWidth={2}
          strokeLinecap="square"
        />
      ))}
    </svg>
  );
}

/** Org chart editor: add, delete and re-link cats on the chart itself. */
export function HierarchyModal({
  isOpen,
  onClose,
  onEditCat,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Open the Cats menu on this cat. */
  onEditCat: (id: string) => void;
}) {
  const { cats, rejected } = useCats();
  const ceo = useCatCeo().settings;
  const [drag, setDrag] = useState<DragState>({ dragId: null, overId: null });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const layout = useMemo(() => layoutOrgChart(buildTree(cats)), [cats]);

  const run = (action: () => void) => {
    try {
      action();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Dropping onto the current parent is a no-op, onto itself or a report is a cycle.
  const canDrop = (targetId: string) => {
    const dragged = drag.dragId ? byId.get(drag.dragId) : undefined;
    return !!dragged && dragged.parentId !== targetId && !isInSubtree(cats, dragged.id, targetId);
  };
  const dropLook = (id: string): DropLook => {
    if (!drag.dragId) return 'none';
    if (id === drag.dragId) return 'dragged';
    if (!canDrop(id)) return 'dimmed';
    return drag.overId === id ? 'over' : 'ok';
  };
  const onDrop = (targetId: string) => {
    const id = drag.dragId;
    setDrag({ dragId: null, overId: null });
    if (id) run(() => catsApi.setParent(id, targetId));
  };

  const addReport = (parentId: string) =>
    run(() => {
      const id = `cat-${crypto.randomUUID().slice(0, 8)}`;
      const fresh = draftReport(
        catsApi.getSnapshot().cats,
        parentId,
        id,
        CAT_NAMES,
        BREED_IDS,
        catsApi.engineOptions('claude'),
      );
      catsApi.saveCat(fresh);
      setSelectedId(id);
      setPop({ kind: 'edit', id });
    });

  const editInCats = (id: string) => {
    setPop(null);
    onEditCat(id);
  };

  const fit = () => {
    const el = viewport.current;
    if (!el || !layout.width) return;
    const s = Math.min(
      1,
      (el.clientWidth - 4) / layout.width,
      (el.clientHeight - 4) / layout.height,
    );
    setScale(Math.max(0.3, Math.floor(s * 20) / 20));
  };

  const heirOf = (cat: CatProfile) =>
    cat.parentId === null
      ? cats.find((c) => c.parentId === cat.id)
      : (byId.get(cat.parentId) ?? undefined);

  const popoverFor = (cat: CatProfile) => {
    if (pop?.id !== cat.id) return null;
    if (pop.kind === 'edit')
      return (
        <QuickEdit cat={cat} onEditInCats={() => editInCats(cat.id)} onDone={() => setPop(null)} />
      );
    if (pop.kind === 'delete')
      return <DeleteConfirm cat={cat} heir={heirOf(cat)} onCancel={() => setPop(null)} />;
    return (
      <NodeMenu cat={cat} onEditInCats={() => editInCats(cat.id)} onClose={() => setPop(null)} />
    );
  };

  // Light up the links into and out of the selected cat.
  const paths = layout.connectors.map((c) => ({
    d: c.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(''),
    hot: selectedId !== null && (c.from === selectedId || c.to === selectedId),
  }));
  paths.sort((a, b) => Number(a.hot) - Number(b.hot));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hierarchy" className="w-[min(1180px,96vw)]">
      {/* Keep office shortcuts (R, T, Esc, Ctrl+Z...) out of the inline fields. */}
      <div className="flex flex-col gap-8 px-10 pb-10" onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-8">
          <div className="text-xs text-text-muted flex-1">
            + adds a report, × deletes. Drag a cat onto another to re-link it. Double-click opens it
            in Cats.
          </div>
          <Button size="sm" onClick={fit} title="Zoom out until the whole chart fits">
            Fit
          </Button>
          <Button size="sm" onClick={() => setScale(1)} title="Actual size">
            1:1
          </Button>
        </div>
        {(error ?? rejected?.error) && (
          <div className="text-xs text-status-error">{error ?? rejected?.error}</div>
        )}
        {ceo && (
          // The Cat CEO sits above the boss, pinned: not part of the tree, not draggable.
          <button
            data-testid="org-ceo"
            className="self-center flex gap-8 items-center px-10 py-2 border-2 border-status-permission bg-bg-dark text-text cursor-pointer"
            onDoubleClick={() => onEditCat(CAT_CEO_ID)}
            title="Reviews every finished team task. Double-click opens it in Cats."
          >
            <CatSprite
              appearance={ceo.appearance as Appearance}
              zoom={CAT_LIST_ZOOM}
              mode="walk"
              className="-my-8"
            />
            <span className="flex flex-col text-left">
              <span className="text-sm">{ceo.name}</span>
              <span className="text-2xs text-text-muted">
                Cat CEO · {ceo.enabled ? `reviews every task · ${ceo.model}` : 'reviews off'}
              </span>
            </span>
          </button>
        )}
        <div
          ref={viewport}
          data-testid="org-chart"
          className="h-[min(660px,72vh)] overflow-auto bg-bg-dark border-2 border-border cursor-move"
          onClick={() => {
            setSelectedId(null);
            setPop(null);
          }}
          onPointerDown={(e) => {
            const el = viewport.current;
            // Pan from the empty background only: nodes drag-and-drop.
            if (!el || (e.target as Element).closest('[data-cat-id]')) return;
            pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          }}
          onPointerMove={(e) => {
            const el = viewport.current;
            if (!el || !pan.current) return;
            el.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
            el.scrollTop = pan.current.top - (e.clientY - pan.current.y);
          }}
          onPointerUp={() => (pan.current = null)}
          onPointerLeave={() => (pan.current = null)}
        >
          {layout.nodes.length ? (
            <div
              className="relative mx-auto"
              style={{ width: layout.width * scale, height: layout.height * scale }}
            >
              <div
                className="absolute top-0 left-0 origin-top-left"
                style={{
                  width: layout.width,
                  height: layout.height,
                  transform: `scale(${scale})`,
                }}
              >
                <Connectors paths={paths} width={layout.width} height={layout.height} />
                {layout.nodes.map((box) => {
                  const cat = byId.get(box.id);
                  if (!cat) return null;
                  return (
                    <OrgNode
                      key={box.id}
                      cat={cat}
                      box={box}
                      selected={selectedId === box.id}
                      drop={dropLook(box.id)}
                      popover={popoverFor(cat)}
                      onSelect={() => {
                        setSelectedId(box.id);
                        if (pop?.id !== box.id) setPop(null);
                      }}
                      onOpen={() => editInCats(box.id)}
                      onAdd={() => addReport(box.id)}
                      onDelete={() => {
                        setSelectedId(box.id);
                        setPop({ kind: 'delete', id: box.id });
                      }}
                      onMenu={() => {
                        setSelectedId(box.id);
                        setPop(
                          pop?.id === box.id && pop.kind === 'menu'
                            ? null
                            : { kind: 'menu', id: box.id },
                        );
                      }}
                      onDragStart={() => {
                        setPop(null);
                        setDrag({ dragId: box.id, overId: null });
                      }}
                      onDragEnd={() => setDrag({ dragId: null, overId: null })}
                      onDragOver={(over) =>
                        setDrag((d) => ({ ...d, overId: over ? box.id : null }))
                      }
                      onDrop={() => onDrop(box.id)}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-12 text-sm text-text-muted">No agent cats yet. Add them in Cats.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
