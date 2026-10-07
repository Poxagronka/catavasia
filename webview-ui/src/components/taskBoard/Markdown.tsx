import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * GitHub-flavored markdown for task results and chats: tables, headings,
 * lists (nested, task lists), blockquotes, code, strikethrough, links and
 * autolinks. Raw HTML in the source stays text (no rehype-raw), so agent
 * output can never inject markup. Links open in a new tab and only for
 * http(s) and mailto URLs. Any other scheme renders as plain text.
 * Element styles live in `.markdown` in index.css.
 */

const SAFE_HREF = /^(https?:|mailto:)/i;

// A short cell (a date, a number with its unit) stays on one line, so a narrow
// bubble wraps the long text cells instead of splitting "20 км/ч" in two.
const SHORT_CELL = 12;
const cellClass = (children: unknown) =>
  typeof children === 'string' && children.length <= SHORT_CELL ? 'whitespace-nowrap' : undefined;

function SafeLink({ href, children }: { href?: string; children: ReactNode }) {
  return href && SAFE_HREF.test(href) ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-bright underline break-all"
    >
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}

const components: Components = {
  a: ({ href, children }) => <SafeLink href={href}>{children}</SafeLink>,
  // An image never loads: a remote URL in agent output could leak data.
  // It renders as a link to the image instead.
  img: ({ src, alt }) => <SafeLink href={src}>{alt || src}</SafeLink>,
  // A wide table scrolls inside its own box, never the whole bubble or dock.
  table: ({ children }) => (
    <div className="markdown-table-scroll">
      <table>{children}</table>
    </div>
  ),
  // `style` carries the column alignment (`|---:|`).
  th: ({ children, style }) => (
    <th style={style} className={cellClass(children)}>
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className={cellClass(children)}>
      {children}
    </td>
  ),
};

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`markdown prose-body flex flex-col gap-8 break-words min-w-0 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
