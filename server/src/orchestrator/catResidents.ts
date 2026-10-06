/**
 * Resident cats: every cat profile in cats.json is one office character, all
 * the time. It spawns when the server starts or the profile is created, and
 * leaves when the profile is deleted. Between turns it idles (the webview's
 * idle activities); a turn points it at that turn's session and it works at
 * its desk. One character per cat across all its tasks and turns.
 *
 * `catCharacters` tells the webview which character is which cat (name,
 * look, working), so it can draw the custom coat and the name label.
 */

import type { CatCharacters, CatProfile, ServerMessage } from '../../../core/src/messages.js';
import { CAT_BREED_IDS } from './catProfiles.js';

/** The part of AgentRuntime the resident cats need. */
export interface ResidentHost {
  spawnResidentAgent(look?: { palette?: number; hueShift?: number }): number;
  beginResidentTurn(id: number, sessionId: string, cwd: string): void;
  endResidentTurn(id: number): void;
  /** Clicking the cat opens this task. */
  linkAgentTask(id: number, taskId: string): void;
  removeResidentAgent(id: number): void;
}

/** The office character palette of a cat: its breed preset. */
export function breedPalette(cat: CatProfile): number | undefined {
  const index = CAT_BREED_IDS.indexOf(cat.appearance.breed as never);
  return index >= 0 ? index : undefined;
}

export class CatResidents {
  private readonly ids = new Map<string, number>();
  /** The profile each character was spawned for: a cat deleted mid-task keeps its look. */
  private readonly spawnedFor = new Map<string, CatProfile>();
  private readonly working = new Set<string>();

  constructor(
    private readonly host: ResidentHost,
    private readonly cats: () => CatProfile[],
    private readonly emit: (message: ServerMessage) => void,
  ) {}

  /** Spawn a character for every new profile, remove the ones of deleted profiles. */
  sync(): void {
    const cats = this.cats();
    for (const [catId, id] of [...this.ids]) {
      if (cats.some((c) => c.id === catId)) continue;
      this.ids.delete(catId);
      this.working.delete(catId);
      this.spawnedFor.delete(catId);
      this.host.removeResidentAgent(id);
    }
    for (const cat of cats) this.ensure(cat);
    this.emit(this.message());
  }

  /** The character of a cat; spawned now when it has none (a cat deleted mid-task). */
  ensure(cat: CatProfile): number {
    let id = this.ids.get(cat.id);
    if (id === undefined) {
      const palette = breedPalette(cat);
      id = this.host.spawnResidentAgent(
        palette === undefined ? undefined : { palette, hueShift: 0 },
      );
      this.ids.set(cat.id, id);
    }
    this.spawnedFor.set(cat.id, cat);
    return id;
  }

  agentFor(catId: string): number | undefined {
    return this.ids.get(catId);
  }

  catOf(agentId: number): string | undefined {
    for (const [catId, id] of this.ids) if (id === agentId) return catId;
    return undefined;
  }

  turnStarted(cat: CatProfile, sessionId: string, cwd: string): number {
    const id = this.ensure(cat);
    this.working.add(cat.id);
    this.host.beginResidentTurn(id, sessionId, cwd);
    this.emit(this.message());
    return id;
  }

  turnEnded(catId: string): void {
    const id = this.ids.get(catId);
    this.working.delete(catId);
    if (id !== undefined) this.host.endResidentTurn(id);
    this.emit(this.message());
  }

  linkTask(catId: string, taskId: string): void {
    const id = this.ids.get(catId);
    if (id !== undefined) this.host.linkAgentTask(id, taskId);
  }

  message(): CatCharacters {
    const byId = new Map(this.cats().map((c) => [c.id, c]));
    const characters = [...this.ids].flatMap(([catId, id]) => {
      const cat = byId.get(catId) ?? this.spawnedFor.get(catId);
      if (!cat) return [];
      const { name, appearance } = cat;
      return [{ catId, id, name, appearance, working: this.working.has(catId) }];
    });
    return { type: 'catCharacters', characters };
  }
}
