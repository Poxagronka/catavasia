import type { PromptTidyInfo, TidyRow } from '../../../../core/src/messages.js';
import { useMoneyShown } from '../../engines/money.js';

const items = (list: TidyRow['before']) =>
  list.map((i) => (
    <div key={i.id} className="break-words">
      <span className="text-text-muted">{i.id}</span> {i.text}
    </div>
  ));

/** The per-item before / after of a Cat CEO tidy; rows it only marked for the user are labelled. */
export function TidyTable({ rows }: { rows: TidyRow[] }) {
  if (!rows.length) return <div className="text-text-muted">No item changes.</div>;
  return (
    <table className="w-full border-collapse text-xs" data-testid="tidy-table">
      <thead>
        <tr className="text-text-muted text-left">
          <th className="p-2 font-normal">Change</th>
          <th className="p-2 font-normal">Before</th>
          <th className="p-2 font-normal">After</th>
          <th className="p-2 font-normal">Reason</th>
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
              {!r.applied && <div className="text-status-permission">marked for you</div>}
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
  const marked = tidy.rows.filter((r) => !r.applied);
  const showMoney = useMoneyShown();
  return (
    <div className="flex flex-col gap-4 border-2 border-border p-4" data-testid="last-tidy">
      <div className="text-text-muted">
        Last tidy {new Date(tidy.at).toLocaleString()} ({tidy.trigger}
        {showMoney && tidy.costUsd !== undefined ? `, $${tidy.costUsd.toFixed(3)}` : ''}):{' '}
        {tidy.summary}
      </div>
      {marked.length > 0 && (
        <>
          <span className="text-text-muted">
            Marked for you (your items: the Cat CEO does not change them on its own)
          </span>
          <TidyTable rows={marked} />
        </>
      )}
    </div>
  );
}
