import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { type CSSProperties, useEffect, useRef } from 'react';

import {
  TERMINAL_FONT_FAMILY,
  TERMINAL_FONT_SIZE_PX,
  TERMINAL_RESIZE_DEBOUNCE_MS,
  TERMINAL_SCROLLBACK_LINES,
  TERMINAL_THEME,
} from '../constants.js';
import { catSessionApi } from './catSessionApi.js';

interface WheelTerminalProps {
  catId: string;
  /** The PTY ended or the server refused: the panel goes back to the CTA. */
  onEnded: (message: string | null) => void;
}

/**
 * One xterm.js instance bound to the cat's interactive `claude --resume` PTY.
 * Adapted from upstream PR #347 TerminalPane. Mounting takes the wheel,
 * unmounting releases it (the server ends the process and frees the session).
 */
export function WheelTerminal({ catId, onEnded }: WheelTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_FONT_SIZE_PX,
      theme: { ...TERMINAL_THEME },
      scrollback: TERMINAL_SCROLLBACK_LINES,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      fit.fit();
    } catch {
      // Not laid out yet; the ResizeObserver catches up.
    }
    term.focus();

    let error: string | null = null;
    let disposed = false;
    const wheel = catSessionApi.takeWheel(
      catId,
      { cols: term.cols, rows: term.rows },
      {
        onOutput: (data) => term.write(data),
        onExit: (code) => {
          term.write(`\r\n\x1b[90m[claude exited with code ${String(code)}]\x1b[0m\r\n`);
        },
        onError: (message) => {
          error = message;
        },
        onClose: () => {
          if (!disposed) endedRef.current(error);
        },
      },
    );
    term.onData((data) => wheel.write(data));

    // Debounced: every resize is a PTY syscall plus a full TUI repaint.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (host.clientWidth === 0 || host.clientHeight === 0) return;
        try {
          fit.fit();
          wheel.resize(term.cols, term.rows);
        } catch {
          // Mid-teardown.
        }
      }, TERMINAL_RESIZE_DEBOUNCE_MS);
    });
    observer.observe(host);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      observer.disconnect();
      catSessionApi.releaseWheel(catId);
      term.dispose();
    };
  }, [catId]);

  return (
    <div
      ref={hostRef}
      className="flex-1 min-h-0 bg-bg-dark p-4"
      style={{ '--font-terminal': TERMINAL_FONT_FAMILY } as CSSProperties}
      data-testid="cat-wheel-terminal"
    />
  );
}
