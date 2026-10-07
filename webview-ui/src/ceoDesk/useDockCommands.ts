import { useEffect, useState } from 'react';

import type { DeskCommand } from '../../../core/src/ceoDesk.js';
import { catCeo } from '../cats/catCeoClient.js';
import { catsApi } from '../cats/catsClient.js';
import { ceoDeskApi } from './ceoDeskApi.js';
import { catchCommand, withDockCommands } from './slashCommands.js';

/** A full model name the CLI takes ("claude-opus-5-5"). */
const FULL_MODEL = /^claude-[a-z0-9][a-z0-9.-]*$/;

type Opens = 'mode' | 'model' | 'effort' | 'usage';
export type DockCard = 'help' | 'connectors';

/**
 * Slash commands of the CEO dock: the list for the "/" menu (read again when
 * the project changes) and `run`, which answers the commands that open the
 * dock's own pickers and cards. `run` is false for a message that goes to Claude.
 */
export function useDockCommands(enabled: boolean, folder: string | null | undefined) {
  const [commands, setCommands] = useState<DeskCommand[]>(withDockCommands([]));
  const [card, setCard] = useState<DockCard | null>(null);
  const [opens, setOpens] = useState<Partial<Record<Opens, number>>>({});

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    ceoDeskApi.commands().then(
      (r) => live && setCommands(withDockCommands(r.commands)),
      () => {}, // no list: the menu offers the dock's own commands only
    );
    return () => {
      live = false;
    };
  }, [enabled, folder]);

  const open = (what: Opens) => setOpens((o) => ({ ...o, [what]: (o[what] ?? 0) + 1 }));

  const run = (text: string): boolean => {
    const action = catchCommand(text);
    if (!action) return false;
    const options = catsApi.engineOptions('claude');
    switch (action.kind) {
      case 'model':
        if (
          action.value &&
          (options.models.includes(action.value) || FULL_MODEL.test(action.value))
        )
          catCeo.setSettings({ model: action.value });
        else open('model');
        break;
      case 'effort':
        if (action.value && options.efforts.includes(action.value))
          catCeo.setSettings({ effort: action.value });
        else open('effort');
        break;
      case 'permissions':
        open('mode');
        break;
      case 'usage':
        open('usage');
        break;
      case 'clear':
        setCard(null);
        void ceoDeskApi.newChat().catch(() => {});
        break;
      default:
        setCard(action.kind);
    }
    return true;
  };

  return { commands, card, setCard, opens, run };
}
