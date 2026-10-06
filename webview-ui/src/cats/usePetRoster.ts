import { useEffect, useState } from 'react';

import type { OfficeState } from '../office/engine/officeState.js';
import { type PetRow, petRows } from './petRoster.js';

/** How often the tab re-reads the office (another window can save the layout). */
const POLL_MS = 500;

interface Roster {
  rows: PetRow[];
}

function readRoster(os: OfficeState): Roster {
  return { rows: petRows(os) };
}

/** Live pet roster of the office while `active`: polled, and re-read right after our own edits. */
export function usePetRoster(getOfficeState: () => OfficeState, active: boolean) {
  const [roster, setRoster] = useState(() => readRoster(getOfficeState()));
  const refresh = () => {
    const next = readRoster(getOfficeState());
    setRoster((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  };
  useEffect(() => {
    if (!active) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  });
  return { ...roster, refresh };
}

export type PetRosterState = ReturnType<typeof usePetRoster>;
