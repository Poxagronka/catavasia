import type { ReactNode } from 'react';

/**
 * Small markdown renderer for task results and chats: headings, fenced code,
 * lists, paragraphs, `inline code`, **bold**, *italics* / _italics_, and links
 * ([text](https://...) or a bare https:// URL). It builds React elements only
 * (no innerHTML), so agent output can never inject markup. Links open in a new
 * tab and only for http(s) URLs.
 */

const INLINE =
  /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]|\*[^*\s][^*]*\*|\b_[^_\s][^_]*_\b)/g;
const MD_LINK = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/;

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-bright underline break-all"
    >
      {children}
    </a>
  );
}

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const token = match[0];
    const link = MD_LINK.exec(token);
    if (token.startsWith('`')) {
      out.push(
        <code key={index} className="bg-bg-dark px-4">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      out.push(
        <strong key={index} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (link) {
      out.push(
        <Link key={index} href={link[2]}>
          {link[1]}
        </Link>,
      );
    } else if (token.startsWith('http')) {
      out.push(
        <Link key={index} href={token}>
          {token}
        </Link>,
      );
    } else {
      out.push(<em key={index}>{token.slice(1, -1)}</em>);
    }
    last = index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LIST_ITEM = /^\s*([-*]|\d+\.)\s+/;
const ORDERED_ITEM = /^\s*\d+\.\s+/;

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
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
        <pre key={key} className="bg-bg-dark border-2 border-border p-8 overflow-x-auto">
          {code.join('\n')}
        </pre>,
      );
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(
        <div key={key} className="font-pixel text-accent-bright text-lg mt-4 leading-tight">
          {renderInline(line.replace(/^#+\s*/, ''))}
        </div>,
      );
      i++;
    } else if (LIST_ITEM.test(line)) {
      const ordered = ORDERED_ITEM.test(line);
      const items: string[] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) items.push(lines[i++]);
      const children = items.map((item, n) => (
        <li key={n} className="my-2">
          {renderInline(item.replace(LIST_ITEM, ''))}
        </li>
      ));
      blocks.push(
        ordered ? (
          <ol key={key} className="pl-24 list-decimal">
            {children}
          </ol>
        ) : (
          <ul key={key} className="pl-20 list-disc">
            {children}
          </ul>
        ),
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
      blocks.push(<p key={key}>{renderInline(para.join(' '))}</p>);
    }
  }
  return (
    <div className={`prose-body flex flex-col gap-8 break-words min-w-0 ${className}`}>
      {blocks}
    </div>
  );
}
