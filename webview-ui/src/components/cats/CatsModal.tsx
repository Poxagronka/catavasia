import { type ReactNode, useState } from 'react';

import type { Appearance, CatProfile, PetProfile } from '../../cats/catsApi.js';
import { findBoss } from '../../cats/hierarchy.js';
import { catsApi } from '../../cats/localCatsAdapter.js';
import { useCats } from '../../cats/useCats.js';
import { CAT_LIST_ZOOM } from '../../constants.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { AgentFields } from './AgentFields.js';
import { AppearanceEditor } from './AppearanceEditor.js';
import { CatSprite } from './CatSprite.js';
import { FIELD } from './fields.js';

type Tab = 'agents' | 'pets';

interface ListItem {
  id: string;
  name: string;
  detail: string;
  appearance: Appearance;
}

function ProfileList({
  items,
  selectedId,
  onSelect,
  onCreate,
  createLabel,
}: {
  items: ListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  createLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4 w-200 shrink-0">
      <Button size="md" variant="accent" onClick={onCreate}>
        {createLabel}
      </Button>
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] pr-2">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onSelect(it.id)}
            className={`flex gap-8 items-center text-left p-4 border-2 rounded-none cursor-pointer text-text ${
              it.id === selectedId
                ? 'bg-active-bg border-accent'
                : 'bg-btn-bg border-transparent hover:bg-btn-hover'
            }`}
          >
            <CatSprite
              appearance={it.appearance}
              zoom={CAT_LIST_ZOOM}
              mode="walk"
              className="-my-8"
            />
            <span className="flex flex-col min-w-0">
              <span className="text-sm truncate">{it.name}</span>
              <span className="text-2xs text-text-muted truncate">{it.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Name field + duplicate / delete (with an inline confirm) + the error line. */
function EditorHeader({
  name,
  onRename,
  onDuplicate,
  onDelete,
  error,
}: {
  name: string;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  error: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-8 items-center">
        <input
          className={`${FIELD} text-lg flex-1`}
          value={name}
          placeholder="Name"
          onChange={(e) => onRename(e.target.value)}
          spellCheck={false}
        />
        <Button size="md" onClick={onDuplicate} title="Copy this profile">
          Duplicate
        </Button>
        {confirming ? (
          <>
            <Button size="md" className="bg-danger! border-danger" onClick={onDelete}>
              Delete {name.trim() || 'it'}?
            </Button>
            <Button size="md" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="md" variant="ghost" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>
      {error && <div className="text-xs text-status-error">{error}</div>}
    </div>
  );
}

/**
 * Local draft over a saved profile: every edit saves through the adapter;
 * an invalid draft (empty name...) stays local and shows the error.
 */
function useDraft<T>(saved: T, save: (v: T) => void) {
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const update = (next: T) => {
    setDraft(next);
    try {
      save(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return { draft, error, update };
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function copyName(name: string, taken: string[]): string {
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

function AgentEditor({ cat, onSelect }: { cat: CatProfile; onSelect: (id: string) => void }) {
  const { cats } = useCats();
  // The Hierarchy modal owns parentId: never write back a stale one from the draft.
  const { draft, error, update } = useDraft(cat, (v) => {
    const live = catsApi.getSnapshot().cats.find((c) => c.id === v.id);
    catsApi.saveCat({ ...v, parentId: live ? live.parentId : v.parentId });
  });
  return (
    <div className="flex flex-col gap-10 flex-1 min-w-0">
      <EditorHeader
        name={draft.name}
        onRename={(name) => update({ ...draft, name })}
        error={error}
        onDuplicate={() => {
          // Copy the saved profile: the draft may be invalid or hold a stale parentId.
          const copy = {
            ...cat,
            id: newId('cat'),
            name: copyName(
              cat.name,
              cats.map((c) => c.name),
            ),
            parentId: cat.parentId ?? cat.id,
            isDefault: false,
          };
          catsApi.saveCat(copy);
          onSelect(copy.id);
        }}
        onDelete={() => catsApi.deleteCat(cat.id)}
      />
      <AgentFields cat={draft} onChange={update} />
      <AppearanceEditor
        value={draft.appearance}
        onChange={(appearance) => update({ ...draft, appearance })}
      />
    </div>
  );
}

function PetEditor({ pet, onSelect }: { pet: PetProfile; onSelect: (id: string) => void }) {
  const { pets } = useCats();
  const { draft, error, update } = useDraft(pet, catsApi.savePet);
  return (
    <div className="flex flex-col gap-10 flex-1 min-w-0">
      <EditorHeader
        name={draft.name}
        onRename={(name) => update({ ...draft, name })}
        error={error}
        onDuplicate={() => {
          const copy = {
            ...pet,
            id: newId('pet'),
            name: copyName(
              pet.name,
              pets.map((p) => p.name),
            ),
          };
          catsApi.savePet(copy);
          onSelect(copy.id);
        }}
        onDelete={() => catsApi.deletePet(pet.id)}
      />
      <AppearanceEditor
        value={draft.appearance}
        onChange={(appearance) => update({ ...draft, appearance })}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button size="md" variant={active ? 'active' : 'default'} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Cats menu: agent and pet profiles (look, role, prompt, engine). */
export function CatsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { cats, pets } = useCats();
  const [tab, setTab] = useState<Tab>('agents');
  const [catId, setCatId] = useState<string | null>(null);
  const [petId, setPetId] = useState<string | null>(null);
  const cat = cats.find((c) => c.id === catId) ?? cats[0];
  const pet = pets.find((p) => p.id === petId) ?? pets[0];

  const createCat = () => {
    const boss = findBoss(cats);
    const opts = catsApi.engineOptions('claude');
    const fresh: CatProfile = {
      id: newId('cat'),
      name: copyName(
        'Cat',
        cats.map((c) => c.name),
      ),
      appearance: { breed: 'nikolai' },
      role: '',
      systemPrompt: '',
      engine: 'claude',
      model: opts.models.includes('sonnet') ? 'sonnet' : opts.models[0],
      effort: opts.efforts.includes('medium') ? 'medium' : opts.efforts[0],
      parentId: boss?.id ?? null,
    };
    catsApi.saveCat(fresh);
    setCatId(fresh.id);
  };
  const createPet = () => {
    const fresh: PetProfile = {
      id: newId('pet'),
      name: copyName(
        'Pet',
        pets.map((p) => p.name),
      ),
      species: 'cat',
      appearance: { breed: 'butterscotch' },
    };
    catsApi.savePet(fresh);
    setPetId(fresh.id);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cats" className="w-[min(1180px,96vw)]">
      {/* Keep office shortcuts (R, T, Esc, Ctrl+Z...) out of the form fields. */}
      <div className="flex flex-col gap-8 px-10 pb-10" onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex gap-4">
          <TabButton active={tab === 'agents'} onClick={() => setTab('agents')}>
            Agents ({cats.length})
          </TabButton>
          <TabButton active={tab === 'pets'} onClick={() => setTab('pets')}>
            Pets ({pets.length})
          </TabButton>
        </div>
        <div className="flex gap-12 max-h-[78vh] overflow-y-auto">
          {tab === 'agents' ? (
            <>
              <ProfileList
                items={cats.map((c) => ({
                  id: c.id,
                  name: c.name,
                  detail: `${c.parentId === null ? 'Boss' : c.role || 'Cat'} · ${c.model}`,
                  appearance: c.appearance,
                }))}
                selectedId={cat?.id ?? null}
                onSelect={setCatId}
                onCreate={createCat}
                createLabel="+ Agent cat"
              />
              {cat ? (
                <AgentEditor key={cat.id} cat={cat} onSelect={setCatId} />
              ) : (
                <div className="text-sm text-text-muted">No agent cats yet.</div>
              )}
            </>
          ) : (
            <>
              <ProfileList
                items={pets.map((p) => ({
                  id: p.id,
                  name: p.name,
                  detail: 'pet',
                  appearance: p.appearance,
                }))}
                selectedId={pet?.id ?? null}
                onSelect={setPetId}
                onCreate={createPet}
                createLabel="+ Pet"
              />
              {pet ? (
                <PetEditor key={pet.id} pet={pet} onSelect={setPetId} />
              ) : (
                <div className="text-sm text-text-muted">No pets yet.</div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
