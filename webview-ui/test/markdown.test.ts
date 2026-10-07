/**
 * The chat and result markdown (GitHub-flavored, react-markdown + remark-gfm):
 * links (http(s)/mailto only, new tab, noopener), emphasis, code, lists,
 * tables, headings, blockquotes, strikethrough and task lists. Rendered to
 * static markup.
 *
 * Run with: npm test
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Markdown } from '../src/components/taskBoard/Markdown.js';

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe('Markdown', () => {
  it('renders markdown links and bare URLs as new-tab links', () => {
    const out = html('See [the docs](https://example.com/a?b=1) or https://x.dev/path.');
    expect(out).toContain(
      '<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer"',
    );
    expect(out).toContain('>the docs</a>');
    // The trailing full stop is not part of the URL.
    expect(out).toContain('href="https://x.dev/path"');
    expect(out).toContain('>https://x.dev/path</a>.');
  });

  it('never links other schemes', () => {
    const out = html('[click](javascript:alert(1)) and ftp://host/file');
    // GFM parses the javascript: link, so only its text survives (no <a>).
    expect(out).not.toContain('<a ');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('click');
    expect(out).toContain('ftp://host/file');
  });

  it('never loads an image, it links to it instead', () => {
    const out = html('![chart](https://evil.test/p.png?d=secret) ![x](javascript:1)');
    expect(out).not.toContain('<img');
    expect(out).toContain('<a href="https://evil.test/p.png?d=secret" target="_blank"');
    expect(out).toContain('>chart</a>');
    expect(out).not.toContain('javascript:');
  });

  it('renders italics with * and _, but not inside snake_case words', () => {
    const out = html('This is *very* important and _really_ so: keep snake_case_name.');
    expect(out).toContain('<em>very</em>');
    expect(out).toContain('<em>really</em>');
    expect(out).toContain('snake_case_name');
    expect(out.match(/<em>/g)).toHaveLength(2);
  });

  it('leaves glob paths alone', () => {
    const out = html('Match src/**/*.ts, then *.ts and *.js files.');
    expect(out).not.toContain('<em>');
    expect(out).toContain('src/**/*.ts, then *.ts and *.js files.');
  });

  it('keeps bold, inline code, lists and code blocks', () => {
    const out = html(
      [
        '**Done**: `npm test` passes.',
        '',
        '1. first',
        '2. second',
        '',
        '- a',
        '- b',
        '',
        '```',
        'x < 1',
        '```',
      ].join('\n'),
    );
    // Element styles moved to `.markdown` in index.css, so tags carry no classes.
    expect(out).toContain('<strong>Done</strong>');
    expect(out).toContain('<code>npm test</code>');
    expect(out).toMatch(/<ol>\s*<li>first<\/li>\s*<li>second<\/li>\s*<\/ol>/);
    expect(out).toMatch(/<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
    expect(out).toContain('<pre><code>x &lt; 1\n</code></pre>');
    expect(out).toContain('prose-body');
  });

  it('renders a table with column alignment inside its own scroll box', () => {
    const out = html('| Item | Qty |\n|:---|---:|\n| apples | 12 |\n| pears | 3 |');
    expect(out).toContain('<div class="markdown-table-scroll"><table>');
    expect(out).toContain('<th style="text-align:left" class="whitespace-nowrap">Item</th>');
    expect(out).toContain('<th style="text-align:right" class="whitespace-nowrap">Qty</th>');
    expect(out).toContain('<td style="text-align:right" class="whitespace-nowrap">12</td>');
    expect(out).not.toContain('|');
  });

  it('renders headings, blockquotes, strikethrough and a rule', () => {
    const out = html('# Title\n\n### Sub\n\n> quoted **text**\n\n~~old~~ new\n\n---');
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<h3>Sub</h3>');
    expect(out).toMatch(/<blockquote>\s*<p>quoted <strong>text<\/strong><\/p>\s*<\/blockquote>/);
    expect(out).toContain('<del>old</del> new');
    expect(out).toContain('<hr/>');
  });

  it('renders task lists and nested lists', () => {
    const out = html('- [x] done\n- [ ] todo\n\n1. top\n   - inner\n2. next');
    expect(out).toContain('class="contains-task-list"');
    expect(out).toMatch(/<input type="checkbox" disabled="" checked=""\/> done/);
    expect(out).toMatch(/<input type="checkbox" disabled=""\/> todo/);
    expect(out).toMatch(/<ol>\s*<li>top\s*<ul>\s*<li>inner<\/li>\s*<\/ul>\s*<\/li>/);
  });

  it('renders a fenced code block with its language and keeps raw HTML as text', () => {
    const out = html('```ts\nconst a = 1;\n```\n\n<b>bold?</b> <script>x()</script>');
    expect(out).toContain(
      '<pre><code class="hljs language-ts"><span class="hljs-keyword">const</span>',
    );
    expect(out).not.toContain('<b>');
    expect(out).not.toContain('<script>');
  });

  it('renders the CEO weather reply with a real table', () => {
    const out = html(
      '**Родос, данные Open-Meteo на 7 октября 2026**\n\nСейчас 10:00, +23 °C.\n\n| День | Погода | Мин / Макс | Дождь | Ветер |\n|---|---|---|---|---|\n| Ср 7.10 | облачно | 21 / 24 °C | 0% | 20 км/ч |\n| Вт 13.10 | возможна гроза | 21 / 23 °C | 31% | 14 км/ч |\n\nДо воскресенья будет сухо и тепло.',
    );
    expect(out).toContain('<p><strong>Родос, данные Open-Meteo на 7 октября 2026</strong></p>');
    expect(out).toContain('<p>Сейчас 10:00, +23 °C.</p>');
    expect(out.match(/<th[ >]/g)).toHaveLength(5);
    expect(out.match(/<tr>/g)).toHaveLength(3);
    // Short cells stay on one line; the long one may wrap.
    expect(out).toContain('<td class="whitespace-nowrap">20 км/ч</td>');
    expect(out).toContain('<td>возможна гроза</td>');
    expect(out).toContain('<p>До воскресенья будет сухо и тепло.</p>');
    expect(out).not.toContain('|');
  });

  it('gives a code block a Copy button, and inline code none', () => {
    const out = html('Run `npm ci` first:\n\n```\nnpm ci\n```');
    expect(out).toContain('<code>npm ci</code>');
    expect(out.match(/data-testid="code-copy"/g)).toHaveLength(1);
    expect(out).toMatch(/<div class="markdown-code"><pre><code>npm ci\n<\/code><\/pre><button/);
  });

  it('colors the code of a named language (ts, py, bash, json); a block without one stays plain', () => {
    const block = (lang: string, code: string) => html(`\`\`\`${lang}\n${code}\n\`\`\``);
    expect(block('ts', 'const n: number = 1;')).toContain(
      '<span class="hljs-keyword">const</span>',
    );
    expect(block('py', 'def f():\n    return "x"')).toContain(
      '<span class="hljs-string">&quot;x&quot;</span>',
    );
    expect(block('bash', 'echo $HOME')).toContain('<span class="hljs-built_in">echo</span>');
    expect(block('json', '{"a": true}')).toContain('<span class="hljs-attr">&quot;a&quot;</span>');
    expect(block('', 'const x = 1')).not.toContain('hljs');
    // An unknown language renders as plain code, never an error.
    expect(block('nosuchlang', 'x')).toContain('<code class="hljs language-nosuchlang">x\n</code>');
  });

  it('half-written text (a live reply) still renders: an open code fence, a table without rows', () => {
    expect(html('Here:\n\n```ts\nconst a = ')).toContain('<span class="hljs-keyword">const</span>');
    const table = html('| Day | Rain |\n|---|');
    expect(table).toContain('Day');
  });
});
