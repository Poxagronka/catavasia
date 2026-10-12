import { useState } from 'react';

import { CAT_TEMPLATES, type CatTemplate } from '../../../core/src/catTemplates.js';
import { useCats } from '../cats/useCats.js';
import { CatSprite } from '../components/cats/CatSprite.js';
import { Button } from '../components/ui/Button.js';
import { onboarding } from '../i18n/onboarding/en.js';
import { useT } from '../i18n/useT.js';
import { applyTemplate } from './applyTemplate.js';
import { ONBOARDING_TEMPLATE_CAT_ZOOM } from './constants.js';

/**
 * The Skip path: six role templates (one boss and three workers each), or no cats at all. Applying a
 * template saves its cats and moves on.
 */
export function TemplatePicker({
  onPicked,
  onBack,
}: {
  /** A team was saved, or the user chose to start without cats. */
  onPicked: () => void;
  onBack: () => void;
}) {
  const t = useT(onboarding);
  // Back from consent lands here with the first team already saved: a second pick would add duplicates.
  const teamSaved = useCats().cats.length > 0;
  const [error, setError] = useState<string | null>(null);
  const use = (template: CatTemplate) => {
    const failed = applyTemplate(template);
    if (failed) setError(t('templateFailed', { error: failed }));
    else onPicked();
  };
  return (
    <div className="flex flex-col gap-8">
      <p className="prose-body m-0">{t('templateBody')}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-6">
        {CAT_TEMPLATES.map((template) => {
          const key = `template${template.id[0].toUpperCase()}${template.id.slice(1)}` as const;
          return (
            <div
              key={template.id}
              className="flex flex-col gap-4 p-6 bg-btn-bg border-2 border-border"
              data-testid={`template-${template.id}`}
            >
              <div className="text-sm text-accent-bright">{t(key as 'templateEngineer')}</div>
              <div className="prose-body prose-small">
                {t(`${key}Desc` as 'templateEngineerDesc')}
              </div>
              <div className="flex gap-2 items-end" aria-hidden>
                {template.cats.map((c) => (
                  <CatSprite
                    key={c.id}
                    appearance={c.appearance}
                    zoom={ONBOARDING_TEMPLATE_CAT_ZOOM}
                  />
                ))}
              </div>
              <div className="prose-body prose-small text-text-muted">
                {template.cats.map((c) => c.name).join(', ')}
              </div>
              <Button
                size="sm"
                variant={teamSaved ? 'disabled' : 'accent'}
                className="mt-auto"
                disabled={teamSaved}
                onClick={() => use(template)}
              >
                {t('useTeam')}
              </Button>
            </div>
          );
        })}
      </div>
      {error && <div className="text-xs text-status-error">{error}</div>}
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t('back')}
        </Button>
        <div className="flex flex-col items-end gap-2">
          <Button size="sm" onClick={onPicked}>
            {t('startEmpty')}
          </Button>
          <span className="prose-body prose-small text-text-muted">{t('startEmptyHint')}</span>
        </div>
      </div>
    </div>
  );
}
