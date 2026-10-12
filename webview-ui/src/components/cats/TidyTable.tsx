import type { PromptTidyInfo, TidyRow } from '../../../../core/src/messages.js';
import { useMoneyShown } from '../../engines/money.js';
import { cats } from '../../i18n/cats/en.js';
import { useT } from '../../i18n/useT.js';

const items = (list: TidyRow['before']) =>
  list.map((i) => (
    <div key={i.id} className="break-words">
      <span className="text-text-muted">{i.id}</span> {i.text}
    </div>
  ));

/** The per-item before / after of a Cat CEO tidy; rows it only marked for the user are labelled. */
export function TidyTable({ rows }: { rows: TidyRow[] }) {
  const t = useT(cats);
  if (!rows.length) return <div className="text-text-muted">{t('noItemChanges')}</div>;
  return (
    <table className="w-full border-collapse text-xs" data-testid="tidy-table">
      <thead>
        <tr className="text-text-muted text-left">
          <th className="p-2 font-normal">{t('tidyChange')}</th>
          <th className="p-2 font-normal">{t('tidyBefore')}</th>
          <th className="p-2 font-normal">{t('tidyAfter')}</th>
          <th className="p-2 font-normal">{t('tidyReason')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, n) => (
          <tr
            key={n}
            className={`border-t-2 border-border align-top ${r.applied ? '' : 'opacity-70'}`}
          >
            <td className="p-2 whitespace-nowrap">
              {r.op}
              {!r.applied && <div className="text-status-permission">{t('markedForYou')}</div>}
            </td>
            <td className="p-2 text-status-error">{items(r.before)}</td>
            <td className="p-2 text-status-success">{r.after ? items([r.after]) : '–'}</td>
            <td className="p-2 text-text-muted break-words">{r.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The newest tidy of a cat: its summary and the changes it marked but did not apply. */
export function LastTidy({ tidy }: { tidy: PromptTidyInfo }) {
  const t = useT(cats);
  const marked = tidy.rows.filter((r) => !r.applied);
  const showMoney = useMoneyShown();
  return (
    <div className="flex flex-col gap-4 border-2 border-border p-4" data-testid="last-tidy">
      <div className="text-text-muted">
        {t('lastTidy', {
          at: new Date(tidy.at).toLocaleString(),
          detail:
            tidy.trigger +
            (showMoney && tidy.costUsd !== undefined ? `, $${tidy.costUsd.toFixed(3)}` : ''),
          summary: tidy.summary,
        })}
      </div>
      {marked.length > 0 && (
        <>
          <span className="text-text-muted">{t('markedForYouLong')}</span>
          <TidyTable rows={marked} />
        </>
      )}
    </div>
  );
}
