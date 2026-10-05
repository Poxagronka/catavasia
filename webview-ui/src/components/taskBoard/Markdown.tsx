import type { ReactNode } from 'react';

/**
 * Small markdown renderer for task results: headings, fenced code, lists,
 * paragraphs, `inline code` and **bold**. It builds React elements only (no
 * innerHTML), so agent output can never inject markup.
 */

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const token = match[0];
    out.push(
      token.startsWith('`') ? (
        <code key={index} className="font-pixel bg-bg-dark px-4">
          {token.slice(1, -1)}
        </code>
      ) : (
        <strong key={index} className="text-text">
          {token.slice(2, -2)}
        </strong>
      ),
    );
    last = index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LIST_ITEM = /^\s*([-*]|\d+\.)\s+/;

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = blocks.length;
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre key={key} className="bg-bg-dark border-2 border-border p-6 overflow-x-auto text-sm">
          {code.join('\n')}
        </pre>,
      );
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(
        <div key={key} className="text-accent-bright text-lg mt-6">
          {renderInline(line.replace(/^#+\s*/, ''))}
        </div>,
      );
      i++;
    } else if (LIST_ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) items.push(lines[i++]);
      blocks.push(
        <ul key={key} className="pl-16 list-disc">
          {items.map((item, n) => (
            <li key={n}>{renderInline(item.replace(LIST_ITEM, ''))}</li>
          ))}
        </ul>,
      );
    } else if (line.trim() === '') {
      i++;
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].startsWith('```') &&
        !/^#{1,6}\s/.test(lines[i]) &&
        !LIST_ITEM.test(lines[i])
      ) {
        para.push(lines[i++]);
      }
      blocks.push(
        <p key={key} className="my-4">
          {renderInline(para.join(' '))}
        </p>,
      );
    }
  }
  return <div className="flex flex-col gap-4 break-words">{blocks}</div>;
}
