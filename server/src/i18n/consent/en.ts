import { defineNamespace } from '../core.js';

export const messages = {
  headline: 'One more thing: hooks!',
  what: 'To bring your agents to life in real time, catavasia adds hooks for {count} Claude Code events to {file}. Note that your existing settings are kept, and a one-time backup is saved as {backup}.',
  data: 'Claude Code will send those events - including tool names and tool inputs - to a catavasia server on this machine. Everything stays local - the server listens only on 127.0.0.1 - unless you explicitly start it with --host to expose it on your network.',
  reversible: 'You can remove the hooks at any time from Settings → Instant Detection (Hooks).',
} as const;

export const consent = defineNamespace('consent', messages);
