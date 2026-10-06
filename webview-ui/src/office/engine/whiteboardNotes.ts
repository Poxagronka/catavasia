/**
 * The Tasks whiteboard: any WHITEBOARD on the wall opens the Tasks panel on
 * click, and its hover tooltip shows the live task counts (running, waiting,
 * done).
 *
 * DOM-free: OfficeCanvas does the click, ToolOverlay draws the tooltip.
 */

import type { TaskSummary } from '../../../../core/src/tasks.js';
import { furnitureKind, getCatalogEntry } from '../layout/furnitureCatalog.js';
import type { PlacedFurniture } from '../types.js';
import { TILE_SIZE } from '../types.js';

export const WHITEBOARD_TYPE = 'WHITEBOARD';

/**
 * Tasks per board status. `waiting` = a team task the server stopped
 * (`interrupted`): it waits for the user to resume or cancel it.
 */
export interface TaskCounts {
  running: number;
  waiting: number;
  done: number;
}

export function countTasks(tasks: ReadonlyArray<Pick<TaskSummary, 'status' | 'flow'>>): TaskCounts {
  const counts: TaskCounts = { running: 0, waiting: 0, done: 0 };
  for (const t of tasks) {
    if (t.status === 'running') counts.running++;
    else if (t.status === 'done') counts.done++;
    else if (t.flow?.state === 'interrupted') counts.waiting++;
  }
  return counts;
}

/** Hover text of the board: the title, then the counts. */
export function whiteboardTooltip(counts: TaskCounts | null): string[] {
  if (!counts) return ['Tasks'];
  return ['Tasks', `${counts.running} running · ${counts.waiting} waiting · ${counts.done} done`];
}

/** The whiteboard under a world point, or undefined. */
export function whiteboardAt(
  worldX: number,
  worldY: number,
  furniture: readonly PlacedFurniture[],
): PlacedFurniture | undefined {
  return furniture.find((f) => {
    if (furnitureKind(f.type) !== WHITEBOARD_TYPE) return false;
    const entry = getCatalogEntry(f.type);
    const w = (entry?.footprintW ?? 2) * TILE_SIZE;
    const h = (entry?.footprintH ?? 2) * TILE_SIZE;
    const x = f.col * TILE_SIZE;
    const y = f.row * TILE_SIZE;
    return worldX >= x && worldX < x + w && worldY >= y && worldY < y + h;
  });
}
