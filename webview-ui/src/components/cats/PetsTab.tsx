import { useState } from 'react';

import { BREED_PRESETS, COAT_PRESETS } from '../../cats/catArt.js';
import { type Appearance, nameErrors } from '../../cats/catsApi.js';
import { addPetCat, deletePet, type PetRow } from '../../cats/petRoster.js';
import type { PetRosterState } from '../../cats/usePetRoster.js';
import { PET_EDITOR_ZOOM, PET_LIST_ZOOM, PET_PRESET_ZOOM } from '../../constants.js';
import type { OfficeState } from '../../office/engine/officeState.js';
import { Button } from '../ui/Button.js';
import { AppearanceEditor, type PreviewFn } from './AppearanceEditor.js';
import { FIELD } from './fields.js';
import { PetSprite } from './PetSprite.js';

function lookName(a: Appearance | undefined): string {
  if (!a) return 'original';
  const preset = [...BREED_PRESETS, ...COAT_PRESETS].find(
    (p) => JSON.stringify(p.appearance) === JSON.stringify(a),
  );
  return preset ? preset.name : 'custom coat';
}

function PetEditor({
  pet,
  onChange,
  onDelete,
}: {
  pet: PetRow;
  onChange: (profile: { name: string; appearance?: Appearance }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(pet.name);
  const [confirming, setConfirming] = useState(false);
  const error = nameErrors(name)[0] ?? null;
  const preview: PreviewFn = (a, size, dir) => (
    <PetSprite
      petType={pet.petType}
      appearance={a}
      zoom={size === 'big' ? PET_EDITOR_ZOOM : PET_PRESET_ZOOM}
      dir={dir}
    />
  );
  return (
    <div className="flex flex-col gap-10 flex-1 min-w-0">
      <div className="flex flex-col gap-4">
        <div className="flex gap-8 items-center">
          <input
            className={`${FIELD} text-lg flex-1`}
            value={name}
            placeholder="Name"
            spellCheck={false}
            onChange={(e) => {
              setName(e.target.value);
              if (nameErrors(e.target.value).length === 0)
                onChange({ name: e.target.value.trim(), appearance: pet.appearance });
            }}
          />
          {confirming ? (
            <>
              <Button size="md" className="bg-danger! border-danger" onClick={onDelete}>
                Remove {pet.name} from the office?
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
      <AppearanceEditor
        value={pet.appearance}
        onChange={(appearance) => onChange({ name: pet.name, appearance })}
        onOriginal={() => onChange({ name: pet.name, appearance: undefined })}
        preview={preview}
      />
    </div>
  );
}

/** The Cats menu "Pets" tab: the pet cats that live in the office layout. */
export function PetsTab({
  roster: { rows, others, refresh },
  getOfficeState,
  onCommit,
}: {
  roster: PetRosterState;
  getOfficeState: () => OfficeState;
  /** Saves the layout after a change (useEditorActions.commitPets). */
  onCommit: () => void;
}) {
  const [petId, setPetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pet = rows.find((p) => p.id === petId) ?? rows[0];

  const commit = () => {
    onCommit();
    refresh();
  };
  const add = () => {
    const id = addPetCat(getOfficeState());
    setNotice(id ? null : 'No cat pet sprite is loaded, or the office has no free floor.');
    if (!id) return;
    setPetId(id);
    commit();
  };

  return (
    <>
      <div className="flex flex-col gap-4 w-200 shrink-0">
        <Button size="md" variant="accent" onClick={add}>
          + Pet cat
        </Button>
        {notice && <div className="text-2xs text-status-error">{notice}</div>}
        <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] pr-2">
          {rows.map((p) => (
            <button
              key={p.id}
              onClick={() => setPetId(p.id)}
              className={`flex gap-6 items-center text-left p-4 border-2 rounded-none cursor-pointer text-text ${
                p.id === pet?.id
                  ? 'bg-active-bg border-accent'
                  : 'bg-btn-bg border-transparent hover:bg-btn-hover'
              }`}
            >
              <PetSprite petType={p.petType} appearance={p.appearance} zoom={PET_LIST_ZOOM} />
              <span className="flex flex-col min-w-0">
                <span className="text-sm truncate">{p.name}</span>
                <span className="text-2xs text-text-muted truncate">{lookName(p.appearance)}</span>
              </span>
            </button>
          ))}
        </div>
        {others.length > 0 && (
          <div className="text-2xs text-text-muted">
            {others.join(', ')}: not a cat. Edit in Layout › Pets.
          </div>
        )}
      </div>
      {pet ? (
        <PetEditor
          key={pet.id}
          pet={pet}
          onChange={(profile) => {
            getOfficeState().updatePetProfile(pet.id, profile);
            commit();
          }}
          onDelete={() => {
            deletePet(getOfficeState(), pet.id);
            setPetId(null);
            commit();
          }}
        />
      ) : (
        <div className="text-sm text-text-muted">
          No pet cats in the office. Add one here or in Layout › Pets.
        </div>
      )}
    </>
  );
}
