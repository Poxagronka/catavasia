import { useState } from 'react';

import { BREED_PRESETS, COAT_PRESETS } from '../../cats/catArt.js';
import { nameErrors } from '../../cats/catsApi.js';
import { addPet, deletePet, type PetRow, type Species } from '../../cats/petRoster.js';
import type { PetRosterState } from '../../cats/usePetRoster.js';
import { PET_EDITOR_ZOOM, PET_LIST_ZOOM, PET_PRESET_ZOOM } from '../../constants.js';
import { cats } from '../../i18n/cats/en.js';
import { pets } from '../../i18n/pets/en.js';
import { useT } from '../../i18n/useT.js';
import type { OfficeState } from '../../office/engine/officeState.js';
import { isCatPet } from '../../office/sprites/petSpriteData.js';
import { Button } from '../ui/Button.js';
import { AppearanceEditor, type PreviewFn } from './AppearanceEditor.js';
import { FIELD } from './fields.js';
import { PersonalityField } from './PersonalityField.js';
import { PetSprite } from './PetSprite.js';

function lookName(pet: PetRow, t: ReturnType<typeof useT<typeof cats>>): string {
  const a = pet.appearance;
  if (!isCatPet(pet.petType)) return pet.kind;
  if (!a) return t('lookOriginal');
  const preset = [...BREED_PRESETS, ...COAT_PRESETS].find(
    (p) => JSON.stringify(p.appearance) === JSON.stringify(a),
  );
  return preset ? preset.name : t('lookCustom');
}

type Profile = Pick<PetRow, 'name' | 'appearance' | 'personality' | 'ownerCatId'>;

/** The owner of a pet: one of the agent cats, or none (the default). */
function OwnerField({
  value,
  owners,
  onChange,
}: {
  value: string | undefined;
  owners: PetRosterState['owners'];
  onChange: (catId: string | undefined) => void;
}) {
  const t = useT(pets);
  return (
    <label className="flex flex-col gap-2 text-xs text-text-muted" title={t('ownerHint')}>
      {t('owner')}
      <select
        className={`${FIELD} text-xs`}
        value={owners.some((o) => o.catId === value) ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">{t('ownerNone')}</option>
        {owners.map((o) => (
          <option key={o.catId} value={o.catId}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PetEditor({
  pet,
  owners,
  onChange,
  onDelete,
}: {
  pet: PetRow;
  owners: PetRosterState['owners'];
  onChange: (profile: Profile) => void;
  onDelete: () => void;
}) {
  const t = useT(cats);
  const [name, setName] = useState(pet.name);
  const [confirming, setConfirming] = useState(false);
  // Every change carries the whole profile: updatePetProfile replaces it.
  const saved: Profile = {
    name: pet.name,
    appearance: pet.appearance,
    personality: pet.personality,
    ownerCatId: pet.ownerCatId,
  };
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
            placeholder={t('name')}
            spellCheck={false}
            onChange={(e) => {
              setName(e.target.value);
              if (nameErrors(e.target.value).length === 0)
                onChange({ ...saved, name: e.target.value.trim() });
            }}
          />
          {confirming ? (
            <>
              <Button size="md" className="bg-danger! border-danger" onClick={onDelete}>
                {t('removePetConfirm', { name: pet.name })}
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
      <OwnerField
        value={pet.ownerCatId}
        owners={owners}
        onChange={(ownerCatId) => onChange({ ...saved, ownerCatId })}
      />
      <PersonalityField
        value={pet.personality}
        onChange={(personality) => onChange({ ...saved, personality })}
      />
      {/* Coats repaint the cat sheet only: a dog keeps its own look. */}
      {isCatPet(pet.petType) ? (
        <AppearanceEditor
          value={pet.appearance}
          onChange={(appearance) => onChange({ ...saved, appearance })}
          onOriginal={() => onChange({ ...saved, appearance: undefined })}
          preview={preview}
        />
      ) : (
        preview(undefined, 'big')
      )}
    </div>
  );
}

/** The Cats menu "Pets" tab: the pets (cats and dogs) that live in the office layout. */
export function PetsTab({
  roster: { rows, owners, refresh },
  getOfficeState,
  onCommit,
}: {
  roster: PetRosterState;
  getOfficeState: () => OfficeState;
  /** Saves the layout after a change (useEditorActions.commitPets). */
  onCommit: () => void;
}) {
  const t = useT(cats);
  const [petId, setPetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pet = rows.find((p) => p.id === petId) ?? rows[0];

  const commit = () => {
    onCommit();
    refresh();
  };
  const add = (species: Species) => {
    const id = addPet(getOfficeState(), species);
    setNotice(id ? null : t(species === 'cat' ? 'noSpriteCat' : 'noSpriteDog'));
    if (!id) return;
    setPetId(id);
    commit();
  };

  return (
    <>
      <div className="flex flex-col gap-4 w-200 shrink-0">
        <div className="flex gap-4">
          <Button size="md" variant="accent" className="flex-1" onClick={() => add('cat')}>
            {t('addPetCat')}
          </Button>
          <Button size="md" variant="accent" className="flex-1" onClick={() => add('dog')}>
            {t('addPetDog')}
          </Button>
        </div>
        {notice && <div className="text-2xs text-status-error">{notice}</div>}
        <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] pe-2">
          {rows.map((p) => (
            <button
              key={p.id}
              onClick={() => setPetId(p.id)}
              className={`flex gap-6 items-center text-start p-4 border-2 rounded-none cursor-pointer text-text ${
                p.id === pet?.id
                  ? 'bg-active-bg border-accent'
                  : 'bg-btn-bg border-transparent hover:bg-btn-hover'
              }`}
            >
              <PetSprite petType={p.petType} appearance={p.appearance} zoom={PET_LIST_ZOOM} />
              <span className="flex flex-col min-w-0">
                <span className="text-sm truncate">{p.name}</span>
                <span className="text-2xs text-text-muted truncate">{lookName(p, t)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {pet ? (
        <PetEditor
          key={pet.id}
          pet={pet}
          owners={owners}
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
        <div className="text-sm text-text-muted">{t('noPets')}</div>
      )}
    </>
  );
}
