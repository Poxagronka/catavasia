import { useState } from 'react';

import { catCeo, useCatCeo } from '../../cats/catCeoClient.js';
import type { PromptItem } from '../../cats/catsApi.js';
import { Button } from '../ui/Button.js';
import { FIELD } from './fields.js';

const ITEM_MAX_CHARS = 280;
type Section = 'Rules' | 'Lessons';

/** One item: its text, inline edit (Enter saves), and a delete button. Each change is a commit. */
function ItemRow({
  catId,
  section,
  item,
  editable,
}: {
  catId: string;
  section: Section;
  item: PromptItem;
  editable: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    const save = () => {
      if (draft.trim() && draft.trim() !== item.text)
        catCeo.saveItem(catId, section, draft, item.id);
      setDraft(null);
    };
    return (
      <div className="flex gap-4 items-center">
        <span className="text-text-muted">[{item.id}]</span>
        <input
          className={`${FIELD} text-xs flex-1`}
          value={draft}
          maxLength={ITEM_MAX_CHARS}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setDraft(null);
          }}
        />
        <Button size="sm" onClick={save}>
          Save
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-4 items-start group" data-item-id={item.id}>
      <span className="text-text break-words flex-1 min-w-0">
        [{item.id}] {item.text}
      </span>
      {editable && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDraft(item.text)}
            title="Edit this item"
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => catCeo.removeItem(catId, item.id)}
            title={`Delete ${item.id} (one commit)`}
          >
            ×
          </Button>
        </>
      )}
    </div>
  );
}

function AddItem({ catId, section }: { catId: string; section: Section }) {
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    catCeo.saveItem(catId, section, text);
    setText('');
  };
  return (
    <div className="flex gap-4">
      <input
        className={`${FIELD} text-xs flex-1`}
        value={text}
        maxLength={ITEM_MAX_CHARS}
        placeholder={section === 'Rules' ? 'New rule: how to behave' : 'New lesson: a fact'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <Button size="sm" onClick={add} disabled={!text.trim()}>
        Add
      </Button>
    </div>
  );
}

/**
 * Rules and Lessons of a cat's prompt file. The Cat CEO edits them after each
 * review; the user edits them here (server office only, with the token).
 */
export function PromptItemsEditor({
  catId,
  rules,
  lessons,
  promptError,
}: {
  catId: string;
  rules?: PromptItem[];
  lessons?: PromptItem[];
  promptError?: string;
}) {
  const editable = useCatCeo().settings !== null;
  if (!rules && !lessons && !promptError) return null;
  const sections: Array<[Section, PromptItem[]]> = [
    ['Rules', rules ?? []],
    ['Lessons', lessons ?? []],
  ];
  return (
    <div className="flex flex-col gap-4 text-xs text-text-muted">
      {promptError && <span className="text-status-error">{promptError}</span>}
      {sections.map(([title, items]) => (
        <div key={title} className="flex flex-col gap-2" data-section={title}>
          <span>{title}</span>
          {items.length === 0 && <span className="opacity-60">None yet.</span>}
          {items.map((item) => (
            <ItemRow key={item.id} catId={catId} section={title} item={item} editable={editable} />
          ))}
          {editable && <AddItem catId={catId} section={title} />}
        </div>
      ))}
    </div>
  );
}
