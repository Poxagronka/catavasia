/**
 * The chat and result markdown: links (http(s) only, new tab, noopener),
 * italics, bold, inline code, lists and code blocks. Rendered to static markup.
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
    expect(out).not.toContain('<a ');
    expect(out).toContain('[click](javascript:alert(1))');
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
    expect(out).toContain('<strong class="font-semibold">Done</strong>');
    expect(out).toContain('<code class="bg-bg-dark px-4">npm test</code>');
    expect(out).toMatch(/<ol[^>]*><li[^>]*>first<\/li><li[^>]*>second<\/li><\/ol>/);
    expect(out).toMatch(/<ul[^>]*><li[^>]*>a<\/li><li[^>]*>b<\/li><\/ul>/);
    expect(out).toContain('x &lt; 1</pre>');
    expect(out).toContain('prose-body');
  });
});
