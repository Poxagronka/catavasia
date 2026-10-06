/**
 * Dock attachments: the limits a message checks on add, the downscale size,
 * the composer strip (thumbnails, file chips), and the sent row and the auth
 * error row of the chat.
 */

import assert from 'node:assert/strict';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vitest';

import { CEO_IMAGE_MAX_BYTES } from '../../core/src/ceoDesk.js';
import { MessageRow } from '../src/catTerminal/ChatConsole.js';
import { AttachmentStrip } from '../src/ceoDesk/AttachmentStrip.js';
import {
  attachError,
  type DraftAttachment,
  fitEdge,
  needsDownscale,
} from '../src/ceoDesk/attachState.js';

const MB = 1024 * 1024;
const file = (name: string, size: number, image = false) => ({ name, size, image });

test('attachError: count, image size and message total', () => {
  assert.equal(attachError([], [file('a.png', 10, true)]), null);
  const eight = Array.from({ length: 8 }, (_, n) => file(`f${n}`, 1));
  assert.equal(attachError(eight, [file('x', 1)]), 'At most 8 files per message');
  assert.equal(
    attachError([], [file('big.png', CEO_IMAGE_MAX_BYTES + 1, true)]),
    'big.png is 5.0 MB: an image can be at most 5.0 MB',
  );
  // A file that is not an image may pass 5 MB, within the total.
  assert.equal(attachError([], [file('log.txt', 6 * MB)]), null);
  assert.equal(
    attachError([file('a', 20 * MB)], [file('b', 6 * MB)]),
    'The files are 26.0 MB: at most 25.0 MB per message',
  );
});

test('needsDownscale and fitEdge: only big images shrink, to a 2000 px edge', () => {
  assert.equal(needsDownscale({ type: 'image/png', size: 6 * MB }), true);
  assert.equal(needsDownscale({ type: 'image/png', size: MB }), false);
  assert.equal(needsDownscale({ type: 'application/pdf', size: 9 * MB }), false);
  assert.deepEqual(fitEdge(4000, 3000), { width: 2000, height: 1500 });
  assert.deepEqual(fitEdge(1000, 3000), { width: 667, height: 2000 });
  assert.deepEqual(fitEdge(800, 600), { width: 800, height: 600 });
});

test('the strip shows image thumbnails and file chips, each with a remove x', () => {
  const draft = (id: number, name: string, image: boolean): DraftAttachment => ({
    id,
    name,
    type: image ? 'image/png' : 'text/plain',
    size: 2048,
    image,
    blob: new Blob([]),
    ...(image ? { preview: `blob:${id}` } : {}),
  });
  const html = renderToStaticMarkup(
    createElement(AttachmentStrip, {
      files: [draft(1, 'a.png', true), draft(2, 'notes.md', false)],
      onRemove: () => {},
    }),
  );
  assert.match(html, /<img src="blob:1" alt="a.png"/);
  assert.match(html, /data-testid="dock-chip"[^>]*><span[^>]*>notes\.md<\/span><span[^>]*>2 KB</);
  assert.equal(html.match(/dock-attachment-remove/g)?.length, 2);
  assert.equal(
    renderToStaticMarkup(createElement(AttachmentStrip, { files: [], onRemove: () => {} })),
    '',
  );
});

test('a sent row shows thumbnails and chips; an auth error row offers Log in', () => {
  const sent = renderToStaticMarkup(
    createElement(MessageRow, {
      entry: {
        kind: 'user',
        text: 'look',
        attachments: [
          { name: 'red.png', size: 10, image: true, url: '/api/ceo/attachments/c-1/ab-red.png' },
          { name: 'a.txt', size: 3000, image: false, url: '/api/ceo/attachments/c-1/cd-a.txt' },
        ],
      },
    }),
  );
  assert.match(sent, /<img src="\/api\/ceo\/attachments\/c-1\/ab-red\.png" alt="red\.png"/);
  assert.match(sent, /download="a\.txt"/);
  assert.match(sent, />3 KB</);
  assert.match(sent, />look</);
  const login = renderToStaticMarkup(
    createElement(MessageRow, {
      entry: { kind: 'error', text: 'Not logged in', login: true },
      onLogin: () => {},
    }),
  );
  assert.match(login, /data-testid="error-login"[^>]*>Log in</);
  const plain = renderToStaticMarkup(
    createElement(MessageRow, { entry: { kind: 'error', text: 'Exit code 1' } }),
  );
  assert.doesNotMatch(plain, /Log in/);
});
