import { useEffect, useState } from 'react';

import type { OfficeState } from '../office/engine/officeState.js';
import { otherPetNames, type PetRow, petRows } from './petRoster.js';

/** How often the tab re-reads the office (pets also change in Layout > Pets). */
const POLL_MS = 500;

interface Roster {
  rows: PetRow[];
  others: string[];
}

function readRoster(os: OfficeState): Roster {
  return { rows: petRows(os), others: otherPetNames(os) };
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
