import { type ReactNode, useState } from 'react';

import type { Appearance, CatProfile } from '../cats/catsApi.js';
import { catsApi } from '../cats/catsClient.js';
import { findBoss } from '../cats/hierarchy.js';
import { useCats } from '../cats/useCats.js';
import { AppearanceEditor } from '../components/cats/AppearanceEditor.js';
import { CatSprite } from '../components/cats/CatSprite.js';
import { FIELD } from '../components/cats/fields.js';
import { Button } from '../components/ui/Button.js';
import { onboarding } from '../i18n/onboarding/en.js';
import { useT } from '../i18n/useT.js';
import {
  BOSS_NAME_PLACEHOLDER,
  BOSS_PROMPT_SUGGESTION,
  BOSS_ROLE_SUGGESTION,
  NEW_CAT_BREED,
  ONBOARDING_CAT_ID_PREFIX,
  ONBOARDING_CAT_ZOOM,
  WORKER_NAME_PLACEHOLDER,
  WORKER_PROMPT_SUGGESTION,
  WORKER_ROLE_SUGGESTION,
} from './constants.js';
import { onboardingEngineDefaults } from './engineDefaults.js';

type Kind = 'boss' | 'worker';
type Sub = 'intro' | 'name' | 'look' | 'role' | 'prompt' | 'saved';
/** The steps of one cat, in order. 'saved' follows the last one. */
const ORDER: readonly Sub[] = ['intro', 'name', 'look', 'role', 'prompt'];

/** The cat being made. It is saved once, at the end of the prompt step. */
interface Draft {
  id: string;
  kind: Kind;
  name: string;
  appearance: Appearance;
  role: string;
  prompt: string;
}

function newDraft(kind: Kind): Draft {
  return {
    id: `${ONBOARDING_CAT_ID_PREFIX}-${crypto.randomUUID().slice(0, 8)}`,
    kind,
    name: '',
    appearance: { breed: NEW_CAT_BREED },
    role: kind === 'boss' ? BOSS_ROLE_SUGGESTION : WORKER_ROLE_SUGGESTION,
    prompt: kind === 'boss' ? BOSS_PROMPT_SUGGESTION : WORKER_PROMPT_SUGGESTION,
  };
}

/** Boss on Opus, workers on Sonnet, effort medium: the same defaults the Cats menu offers. */
function toProfile(draft: Draft, parentId: string | null): CatProfile {
  return {
    id: draft.id,
    name: draft.name.trim(),
    appearance: draft.appearance,
    role: draft.role.trim(),
    systemPrompt: draft.prompt.trim(),
    ...onboardingEngineDefaults(draft.kind === 'boss' ? 'opus' : 'sonnet', 'medium'),
    parentId,
  };
}

/** One field step: what the field is for, what to write in it, then the control. */
function FieldStep({
  title,
  forText,
  writeText,
  children,
}: {
  title: string;
  forText: string;
  writeText: string;
  children: ReactNode;
}) {
  const t = useT(onboarding);
  return (
    <div className="flex flex-col gap-8">
      <div className="text-lg text-accent-bright">{title}</div>
      <p className="prose-body m-0">
        <strong>{t('forLabel')}</strong> {forText}
      </p>
      <p className="prose-body m-0">
        <strong>{t('writeLabel')}</strong> {writeText}
      </p>
      {children}
    </div>
  );
}

/**
 * Create cats together: the boss first, then any number of workers. Each cat takes four steps (name, look, role,
 * prompt) and every step says what the field is for and what to write. The role and prompt start from a
 * suggestion the user can change. Cats go through the same CatsApi as the Cats menu.
 */
export function CatBuilder({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const t = useT(onboarding);
  const { cats, rejected } = useCats();
  const [draft, setDraft] = useState(() => newDraft(findBoss(cats) ? 'worker' : 'boss'));
  const [sub, setSub] = useState<Sub>('intro');
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const worker = draft.kind === 'worker';

  const go = (next: Sub) => {
    setError(null);
    setSub(next);
  };
  const next = () => {
    if (sub === 'name' && !draft.name.trim()) return setError(t('nameMissing'));
    if (sub !== 'prompt') return go(ORDER[ORDER.indexOf(sub) + 1]);
    try {
      catsApi.saveCat(
        toProfile(draft, draft.kind === 'boss' ? null : (findBoss(cats)?.id ?? null)),
      );
      go('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const back = () => {
    if (sub === 'intro') return onBack();
    go(ORDER[ORDER.indexOf(sub) - 1]);
  };
  const addWorker = () => {
    setDraft(newDraft('worker'));
    go('name');
  };

  const serverError =
    rejected && (!rejected.id || rejected.id === draft.id) ? rejected.error : null;
  const shownError = error ?? serverError;

  if (sub === 'saved') {
    return (
      <div className="flex flex-col gap-8 items-center text-center">
        <CatSprite appearance={draft.appearance} zoom={ONBOARDING_CAT_ZOOM} mode="walk" />
        <div className="text-lg text-accent-bright">
          {t('savedTitle', { name: draft.name.trim() })}
        </div>
        <p className="prose-body m-0">{t('savedBody')}</p>
        {serverError && <div className="text-xs text-status-error">{serverError}</div>}
        <div className="flex gap-6 flex-wrap justify-center">
          <Button size="sm" onClick={addWorker}>
            {t('addWorker')}
          </Button>
          <Button size="sm" variant="accent" onClick={onContinue}>
            {t('continue')}
          </Button>
        </div>
      </div>
    );
  }

  let body: ReactNode;
  if (sub === 'intro') {
    body = (
      <div className="flex flex-col gap-8">
        <div className="text-lg text-accent-bright">{t('buildIntroTitle')}</div>
        <p className="prose-body m-0">{t('buildIntroBody')}</p>
      </div>
    );
  } else if (sub === 'name') {
    body = (
      <FieldStep
        title={t(worker ? 'nameTitleWorker' : 'nameTitleBoss')}
        forText={t('nameFor')}
        writeText={t('nameWrite')}
      >
        <input
          className={`${FIELD} text-lg`}
          autoFocus
          value={draft.name}
          placeholder={worker ? WORKER_NAME_PLACEHOLDER : BOSS_NAME_PLACEHOLDER}
          spellCheck={false}
          onChange={(e) => update({ name: e.target.value })}
        />
      </FieldStep>
    );
  } else if (sub === 'look') {
    body = (
      <FieldStep title={t('lookTitle')} forText={t('lookFor')} writeText={t('lookWrite')}>
        <AppearanceEditor
          value={draft.appearance}
          onChange={(appearance) => update({ appearance })}
        />
      </FieldStep>
    );
  } else if (sub === 'role') {
    body = (
      <FieldStep title={t('roleTitle')} forText={t('roleFor')} writeText={t('roleWrite')}>
        <input
          className={`${FIELD} text-xs`}
          value={draft.role}
          onChange={(e) => update({ role: e.target.value })}
        />
      </FieldStep>
    );
  } else {
    body = (
      <FieldStep
        title={t('promptTitle')}
        forText={t('promptFor')}
        writeText={t(worker ? 'promptWriteWorker' : 'promptWriteBoss')}
      >
        <textarea
          className={`${FIELD} text-xs h-120 resize-y`}
          value={draft.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
        />
        <p className="prose-body prose-small m-0 text-text-muted">{t('promptHelp')}</p>
      </FieldStep>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {sub !== 'intro' && (
        <div className="text-xs text-text-muted">{t(worker ? 'workerLabel' : 'bossLabel')}</div>
      )}
      {body}
      {shownError && <div className="text-xs text-status-error">{shownError}</div>}
      <div className="flex items-center justify-between gap-6 flex-wrap mt-4">
        <Button variant="ghost" size="sm" onClick={back}>
          {t('back')}
        </Button>
        <Button variant="accent" size="sm" onClick={next}>
          {t('next')}
        </Button>
      </div>
    </div>
  );
}
