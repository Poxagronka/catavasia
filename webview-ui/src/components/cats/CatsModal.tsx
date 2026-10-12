import { type ReactNode, useState } from 'react';

import { useCatCeo } from '../../cats/catCeoClient.js';
import type { Appearance, CatProfile } from '../../cats/catsApi.js';
import { catsApi } from '../../cats/catsClient.js';
import { findBoss } from '../../cats/hierarchy.js';
import { useCats } from '../../cats/useCats.js';
import { usePetRoster } from '../../cats/usePetRoster.js';
import { CAT_CEO_ID, CAT_LIST_ZOOM } from '../../constants.js';
import { cats as catsText } from '../../i18n/cats/en.js';
import { useT } from '../../i18n/useT.js';
import type { OfficeState } from '../../office/engine/officeState.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { AgentOtherFields, AgentPromptFields } from './AgentFields.js';
import { AppearanceEditor } from './AppearanceEditor.js';
import { CatSprite } from './CatSprite.js';
import { CeoEditor } from './CeoEditor.js';
import { EditorTabs } from './EditorTabs.js';
import { FIELD } from './fields.js';
import { PersonalityField } from './PersonalityField.js';
import { PetsTab } from './PetsTab.js';
import { PromptHistory } from './PromptHistory.js';

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
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] pe-2">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onSelect(it.id)}
            className={`flex gap-8 items-center text-start p-4 border-2 rounded-none cursor-pointer text-text ${
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
  const t = useT(catsText);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-8 items-center">
        <input
          className={`${FIELD} text-lg flex-1`}
          value={name}
          placeholder={t('name')}
          onChange={(e) => onRename(e.target.value)}
          spellCheck={false}
        />
        <Button size="md" onClick={onDuplicate} title={t('duplicateTitle')}>
          {t('duplicate')}
        </Button>
        {confirming ? (
          <>
            <Button size="md" className="bg-danger! border-danger" onClick={onDelete}>
              {name.trim() ? t('deleteNamed', { name: name.trim() }) : t('deleteIt')}
            </Button>
            <Button size="md" variant="ghost" onClick={() => setConfirming(false)}>
              {t('keep')}
            </Button>
          </>
        ) : (
          <Button size="md" variant="ghost" onClick={() => setConfirming(true)}>
            {t('delete')}
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

function AgentEditor({
  cat,
  onSelect,
  historyOpen = false,
}: {
  cat: CatProfile;
  onSelect: (id: string) => void;
  historyOpen?: boolean;
}) {
  const t = useT(catsText);
  const { cats, rejected } = useCats();
  const online = useCatCeo().settings !== null;
  const [showHistory, setShowHistory] = useState(historyOpen);
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
        // The server refused a change of this cat (or a change with no cat id).
        error={
          error ?? (rejected && (!rejected.id || rejected.id === cat.id) ? rejected.error : null)
        }
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
      <EditorTabs
        initial={historyOpen ? 'prompt' : undefined}
        tabs={[
          {
            id: 'appearance',
            content: (
              <AppearanceEditor
                value={draft.appearance}
                onChange={(appearance) => update({ ...draft, appearance })}
              />
            ),
          },
          {
            id: 'behaviour',
            content: (
              <PersonalityField
                value={draft.personality}
                onChange={(personality) => update({ ...draft, personality })}
              />
            ),
          },
          {
            id: 'prompt',
            error: !!cat.promptError,
            content: (
              <>
                <AgentPromptFields cat={draft} onChange={update} />
                {online && (
                  <div className="flex flex-col gap-4">
                    <Button
                      size="md"
                      className="self-start"
                      variant={showHistory ? 'active' : 'default'}
                      onClick={() => setShowHistory(!showHistory)}
                    >
                      {t('promptHistory')}
                    </Button>
                    {showHistory && <PromptHistory catId={cat.id} />}
                  </div>
                )}
              </>
            ),
          },
          {
            id: 'other',
            content: <AgentOtherFields cat={draft} onChange={update} />,
          },
        ]}
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

/** Cats menu: agent cat profiles (look, role, prompt, engine) and the office's pet cats. */
export function CatsModal({
  isOpen,
  onClose,
  focusCatId = null,
  focusHistory = false,
  getOfficeState,
  onCommitPets,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Show this agent cat (set by the Hierarchy chart). */
  focusCatId?: string | null;
  /** Open the focused cat's Prompt history too. */
  focusHistory?: boolean;
  getOfficeState: () => OfficeState;
  onCommitPets: () => void;
}) {
  const t = useT(catsText);
  const { cats } = useCats();
  const ceo = useCatCeo().settings;
  const [tab, setTab] = useState<Tab>('agents');
  const [catId, setCatId] = useState<string | null>(focusCatId);
  const [seenFocus, setSeenFocus] = useState(focusCatId);
  if (focusCatId !== seenFocus) {
    setSeenFocus(focusCatId);
    if (focusCatId) {
      setTab('agents');
      setCatId(focusCatId);
    }
  }
  const cat = cats.find((c) => c.id === catId) ?? cats[0];
  const ceoOpen = catId === CAT_CEO_ID && ceo !== null;
  // The Cat CEO heads the list: it sits above the boss, outside the tree.
  const ceoItem: ListItem[] = ceo
    ? [
        {
          id: CAT_CEO_ID,
          name: ceo.name,
          detail: ceo.enabled ? t('ceoListOn', { model: ceo.model }) : t('ceoListOff'),
          appearance: ceo.appearance as Appearance,
        },
      ]
    : [];
  const roster = usePetRoster(getOfficeState, isOpen);

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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('catsTitle')}
      className="w-[min(1180px,96vw)]"
      pinTop
    >
      {/* Keep office shortcuts (R, T, Esc, Ctrl+Z...) out of the form fields. */}
      <div className="flex flex-col gap-8 px-10 pb-10" onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex gap-4">
          <TabButton active={tab === 'agents'} onClick={() => setTab('agents')}>
            {t('tabAgents', { count: cats.length })}
          </TabButton>
          <TabButton active={tab === 'pets'} onClick={() => setTab('pets')}>
            {t('tabPets', { count: roster.rows.length })}
          </TabButton>
        </div>
        <div className="flex gap-12">
          {tab === 'agents' ? (
            <>
              <ProfileList
                items={[
                  ...ceoItem,
                  ...cats.map((c) => ({
                    id: c.id,
                    name: c.name,
                    detail: t('catListDetail', {
                      role: c.parentId === null ? t('boss') : c.role || t('cat'),
                      model: c.model,
                    }),
                    appearance: c.appearance,
                  })),
                ]}
                selectedId={ceoOpen ? CAT_CEO_ID : (cat?.id ?? null)}
                onSelect={setCatId}
                onCreate={createCat}
                createLabel={t('addAgentCat')}
              />
              {ceoOpen ? (
                <CeoEditor settings={ceo} />
              ) : cat ? (
                <AgentEditor
                  key={cat.id}
                  cat={cat}
                  onSelect={setCatId}
                  historyOpen={focusHistory && cat.id === focusCatId}
                />
              ) : (
                <div className="text-sm text-text-muted">{t('noAgentCats')}</div>
              )}
            </>
          ) : (
            <PetsTab roster={roster} getOfficeState={getOfficeState} onCommit={onCommitPets} />
          )}
        </div>
      </div>
    </Modal>
  );
}
