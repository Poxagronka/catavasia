import { CatSprite } from '../components/cats/CatSprite.js';
import { onboarding } from '../i18n/onboarding/en.js';
import { useT } from '../i18n/useT.js';
import { EXPLAIN_STEP_IDS, ONBOARDING_CAT_ZOOM } from './constants.js';
import { EnginesPanel } from './EnginesPanel.js';

export type ExplainId = (typeof EXPLAIN_STEP_IDS)[number];

/** Sample cats under the text: they show who talks to whom. */
const ILLUSTRATIONS: Partial<Record<ExplainId, string[]>> = {
  cat: ['nikolai'],
  ceo: ['marmalade'],
  team: ['marmalade', 'smokey', 'snow', 'tux'],
  tasks: ['marmalade', 'smokey', 'snow'],
};

/** One plain-language step: the text, a few sample cats, and for the engines step the install commands. */
export function ExplainStep({ id }: { id: ExplainId }) {
  const t = useT(onboarding);
  const cats = ILLUSTRATIONS[id];
  return (
    <div className="flex flex-col gap-8">
      <p className="prose-body m-0">{t(`${id}Body`)}</p>
      {cats && (
        <div className="flex gap-8 items-end justify-center" aria-hidden>
          {cats.map((breed) => (
            <CatSprite
              key={breed}
              appearance={{ breed }}
              zoom={ONBOARDING_CAT_ZOOM}
              mode="walk"
              dir="down"
            />
          ))}
        </div>
      )}
      {id === 'engines' && <EnginesPanel />}
    </div>
  );
}
