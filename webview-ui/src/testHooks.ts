import type { ColorValue } from './components/ui/types.js';
import { OfficeState } from './office/engine/officeState.js';
import { isGhostHeadlessAgentsEnabled } from './office/engine/renderer.js';
import { mulberry32 } from './office/engine/socialMoves.js';
import type { PetCareEnv } from './office/petCare/petCareNav.js';
import type { PetCareSystem } from './office/petCare/petCareSystem.js';
import { carpetJunctionCase } from './office/sprites/carpetTiles.js';
import type { Pet } from './office/types.js';
import { TILE_SIZE } from './office/types.js';
import type { OrchestratorEvent } from './orchestratorEvents.js';
import { orchestratorEvents } from './orchestratorEvents.js';
import { transport } from './transport/index.js';

declare global {
  interface Window {
    __pixelAgentsTestHooks?: {
      playedSounds?: Array<{ kind: string; at: number }>;
      getCharacters?: () => Array<{
        id: number;
        matrixEffect: 'spawn' | 'despawn' | null;
        agentName?: string;
        bubbleType: 'permission' | 'waiting' | null;
        waitingAwaitingInput?: boolean;
        isHeadless?: boolean;
        isGreeter?: boolean;
        state: string;
        activityId: string | null;
        taskId?: string;
        col: number;
        row: number;
      }>;
      /** Send an idle cat to an idle activity now (see OfficeState.forceIdleActivity). */
      forceIdleActivity?: (id: number, activityId: string, spotKey?: string) => boolean;
      /** Send a cat pet to an idle activity now (see OfficeState.forcePetActivity). */
      forcePetActivity?: (petId: string, activityId: string, spotKey?: string) => boolean;
      /** The live office (scene setup for screenshots: cat life, pets, needs). */
      getOffice?: () => OfficeState | null;
      /** A world point (sprite px) in client coordinates (set by OfficeCanvas). */
      worldToClient?: (worldX: number, worldY: number) => { x: number; y: number } | null;
      /** Emit an orchestrator event (catMessage, flowStateChanged) as the server feed will. */
      emitOrchestratorEvent?: (event: OrchestratorEvent) => void;
      /** Effective "Display headless as ghosts" setting the renderer is using. */
      getGhostHeadlessAgents?: () => boolean;
      // ── Carpet + Areas observability (added for carpet/areas e2e) ──
      /** Sparse list of painted carpet tiles with their grid coords. */
      getCarpetTiles?: () => Array<{
        col: number;
        row: number;
        variant: number;
        color?: ColorValue;
        accentColor?: ColorValue;
        order?: number;
      }>;
      /** 4-bit marching-squares case for a junction (NW=1,NE=2,SE=4,SW=8) via the
       *  real renderer logic — for asserting carpet autotiling. */
      getCarpetJunctionCase?: (jx: number, jy: number, variant: number) => number;
      /** Area definitions in the current layout. */
      getAreas?: () => Array<{ label: string; color: string }>;
      /** Sparse list of area-painted tiles with their grid coords. */
      getAreaTiles?: () => Array<{ col: number; row: number; label: string }>;
      /** Folder→Area mappings received by OfficeState. */
      getAreaMappings?: () => Record<string, string[]>;
      /** Effective show-areas gate (settings toggle OR active area edit). */
      getShowAreas?: () => boolean;
      /** Count of placed furniture instances — lets a spec assert furniture
       *  placed onto a carpet tile (surface placement) without it being blocked. */
      getFurnitureCount?: () => number;
      /** Seated top-level agents with the area their seat falls in (or null). */
      getAgentSeats?: () => Array<{
        id: number;
        seatId: string | null;
        areaLabel: string | null;
        folderName?: string;
      }>;
      /** All seats with grid coords + the area their tile falls in — lets a spec
       *  paint an Area over a known seat without hardcoding layout coordinates. */
      getSeats?: () => Array<{
        uid: string;
        col: number;
        row: number;
        areaLabel: string | null;
        assigned: boolean;
      }>;
      /** Drive the real edit-mode tile paint/erase handlers by (col,row),
       *  bypassing only canvas pixel→tile geometry (mirrors petClick). */
      editorTileAction?: (col: number, row: number) => void;
      editorEraseAction?: (col: number, row: number) => void;
      getPets?: () => Array<{
        id: string;
        name: string;
        petType: number;
        state: 'idle' | 'walk' | 'follow';
        x: number;
        y: number;
        bubbleType: 'heart' | null;
      }>;
      petClick?: (petId: string) => void;
      /** Live pet-care runtime, pets and env (needs, bowls, litter, menu) for e2e and debugging. */
      getPetCare?: () => { care: PetCareSystem; pets: Pet[]; env: PetCareEnv } | null;
      addAgentLog?: Array<{
        id: number;
        skipSpawnEffect: boolean | undefined;
        matrixEffectAtCreation: 'spawn' | 'despawn' | null;
      }>;
      messageLog?: Array<{
        at: number;
        type: string;
        id?: number;
        toolName?: string;
        status?: string;
        toolId?: string;
        parentToolId?: string;
      }>;
      selectAgent?: (id: number) => void;
      /** Send closeAgent for an agent (the cat label has no close button). */
      closeAgent?: (id: number) => void;
      /** Cat social scenes: seed the RNG and start an encounter between two
       *  agents (kind forced when given). Returns the started kind or null. */
      socialEncounter?: (
        aId: number,
        bId: number,
        kind?: 'talk' | 'play' | 'fight',
        seed?: number,
      ) => string | null;
      /** Kind / phase / partner of an agent's social scene, or null. */
      getSocialScene?: (id: number) => { kind: string; phase: string; partnerId: number } | null;
      /** Put an idle agent on a tile (scene setup without pixel-hunting). */
      placeCharacter?: (id: number, col: number, row: number) => void;
    };
  }
}

/**
 * Install e2e test observables on window.__pixelAgentsTestHooks. Mostly
 * read-only / append-only; the actions (selectAgent, closeAgent) drive the
 * same state or message a user action produces. Called once at module-load from
 * App.tsx with the singleton officeStateRef.
 *
 * - getCharacters(): point-in-time snapshot of every character's matrix, team, and bubble state.
 * - addAgentLog: append-only history of every OfficeState.addAgent call. The
 *   log captures matrixEffect AT addAgent time (synchronously inside the
 *   wrapper), eliminating the ~300ms matrix-effect lifetime race that would
 *   let a regression slip past a snapshot-based check.
 * - playedSounds: populated separately by notificationSound.ts (same namespace,
 *   different owner).
 * - selectAgent(id): sets officeState.selectedAgentId directly, the same state
 *   a canvas click produces. Lets e2e select an agent deterministically
 *   instead of pixel-hunting the sprite on the canvas. ToolOverlay reads
 *   selectedAgentId every rAF, so the selected label surfaces on the next frame.
 * - closeAgent(id): sends the closeAgent message (as the Debug View ✕ does).
 *   The cat label has no close button, so e2e closes agents through this
 *   hook (see closeAgent in e2e/helpers/office.ts).
 */
export function installTestHooks(officeStateRef: { current: OfficeState | null }): void {
  if (typeof window === 'undefined') return;
  if (!window.__pixelAgentsTestHooks) window.__pixelAgentsTestHooks = {};
  const hooks = window.__pixelAgentsTestHooks;
  if (!hooks.addAgentLog) hooks.addAgentLog = [];

  hooks.getCharacters = () => {
    const os = officeStateRef.current;
    if (!os) return [];
    // getCharacters(), not `characters`: e2e asserts on the consent greeter,
    // which lives outside the agent map and joins only at the render seam.
    return os.getCharacters().map((ch) => ({
      id: ch.id,
      matrixEffect: ch.matrixEffect,
      agentName: ch.agentName,
      bubbleType: ch.bubbleType,
      waitingAwaitingInput: ch.waitingAwaitingInput,
      isHeadless: ch.isHeadless,
      isGreeter: ch.isGreeter,
      state: ch.state,
      activityId: ch.activity?.id ?? null,
      taskId: ch.taskId,
      col: ch.tileCol,
      row: ch.tileRow,
    }));
  };

  hooks.forceIdleActivity = (id, activityId, spotKey) =>
    officeStateRef.current?.forceIdleActivity(id, activityId, spotKey) ?? false;
  hooks.forcePetActivity = (petId, activityId, spotKey) =>
    officeStateRef.current?.forcePetActivity(petId, activityId, spotKey) ?? false;

  hooks.getOffice = () => officeStateRef.current;
  hooks.emitOrchestratorEvent = (event) => orchestratorEvents.emit(event);

  // The ghost setting lives in the renderer module (read every rAF frame), not
  // in OfficeState, so e2e reads it from there to assert what is actually drawn.
  hooks.getGhostHeadlessAgents = () => isGhostHeadlessAgentsEnabled();

  hooks.selectAgent = (id) => {
    const os = officeStateRef.current;
    if (os) os.selectedAgentId = id;
  };

  hooks.closeAgent = (id) => transport.send({ type: 'closeAgent', id });

  hooks.socialEncounter = (aId, bId, kind, seed) => {
    const os = officeStateRef.current;
    const a = os?.characters.get(aId);
    const b = os?.characters.get(bId);
    if (!os || !a || !b) return null;
    if (seed !== undefined) os.social.rng = mulberry32(seed);
    return os.social.trySocialEncounter(a, b, { kind });
  };

  hooks.getSocialScene = (id) => officeStateRef.current?.social.sceneInfo(id) ?? null;

  hooks.placeCharacter = (id, col, row) => {
    const ch = officeStateRef.current?.characters.get(id);
    if (!ch) return;
    ch.tileCol = col;
    ch.tileRow = row;
    ch.x = col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = row * TILE_SIZE + TILE_SIZE / 2;
    ch.path = [];
    ch.moveProgress = 0;
  };

  // Point-in-time snapshot of every live pet. Pets render only on the canvas
  // (no DOM) and the heart bubble is never persisted, so e2e reads pet state
  // through here — the same rationale as getCharacters() above.
  hooks.getPets = () => {
    const os = officeStateRef.current;
    if (!os) return [];
    return os.pets.map((pet) => ({
      id: pet.id,
      name: pet.name,
      petType: pet.petType,
      state: pet.state,
      x: pet.x,
      y: pet.y,
      bubbleType: pet.bubbleType,
    }));
  };

  // Drive the same state a canvas click on a pet produces (toggle the heart
  // bubble). Mirrors OfficeCanvas's pet-hit branch but takes a known petId
  // instead of a hit-test result, so tests don't pixel-hunt the randomly
  // spawned sprite — the same tradeoff selectAgent makes for characters.
  hooks.petClick = (petId) => {
    const os = officeStateRef.current;
    if (!os) return;
    const pet = os.pets.find((p) => p.id === petId);
    if (!pet) return;
    if (pet.bubbleType) {
      os.dismissPetBubble(petId);
    } else {
      os.showPetBubble(petId);
    }
  };

  hooks.getPetCare = () => {
    const os = officeStateRef.current;
    return os ? { care: os.petCare, pets: os.pets, env: os.petCareEnv() } : null;
  };

  // ── Carpet + Areas read hooks (canvas-only state, read like getPets) ──
  hooks.getCarpetTiles = () => {
    const os = officeStateRef.current;
    if (!os) return [];
    const layout = os.getLayout();
    const tiles = layout.carpetTiles;
    if (!tiles) return [];
    const out: Array<{
      col: number;
      row: number;
      variant: number;
      color?: ColorValue;
      accentColor?: ColorValue;
      order?: number;
    }> = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (!t) continue;
      out.push({
        col: i % layout.cols,
        row: Math.floor(i / layout.cols),
        variant: t.variant,
        color: t.color,
        accentColor: t.accentColor,
        order: t.order,
      });
    }
    return out;
  };

  hooks.getCarpetJunctionCase = (jx, jy, variant) => {
    const os = officeStateRef.current;
    if (!os) return 0;
    const layout = os.getLayout();
    return carpetJunctionCase(jx, jy, variant, layout.carpetTiles ?? [], layout.cols, layout.rows);
  };

  hooks.getAreas = () => {
    const os = officeStateRef.current;
    if (!os) return [];
    return (os.getLayout().areas ?? []).map((a) => ({ label: a.label, color: a.color }));
  };

  hooks.getAreaTiles = () => {
    const os = officeStateRef.current;
    if (!os) return [];
    const layout = os.getLayout();
    const tiles = layout.areaTiles;
    if (!tiles) return [];
    const out: Array<{ col: number; row: number; label: string }> = [];
    for (let i = 0; i < tiles.length; i++) {
      const label = tiles[i];
      if (!label) continue;
      out.push({ col: i % layout.cols, row: Math.floor(i / layout.cols), label });
    }
    return out;
  };

  hooks.getAreaMappings = () => {
    const os = officeStateRef.current;
    if (!os) return {};
    return os.areaMappings;
  };

  hooks.getFurnitureCount = () => {
    const os = officeStateRef.current;
    if (!os) return 0;
    return os.furniture.length;
  };

  hooks.getAgentSeats = () => {
    const os = officeStateRef.current;
    if (!os) return [];
    return Array.from(os.characters.values())
      .filter((ch) => !ch.isSubagent)
      .map((ch) => ({
        id: ch.id,
        seatId: ch.seatId,
        areaLabel: ch.seatId ? os.seatZone(ch.seatId) : null,
        folderName: ch.folderName,
      }));
  };

  hooks.getSeats = () => {
    const os = officeStateRef.current;
    if (!os) return [];
    return Array.from(os.seats.entries()).map(([uid, seat]) => ({
      uid,
      col: seat.seatCol,
      row: seat.seatRow,
      areaLabel: os.seatZone(uid),
      assigned: seat.assigned,
    }));
  };

  const origAddAgent = OfficeState.prototype.addAgent;
  OfficeState.prototype.addAgent = function (
    id,
    preferredPalette,
    preferredHueShift,
    preferredSeatId,
    skipSpawnEffect,
    folderName,
    nearAgentId,
  ) {
    origAddAgent.call(
      this,
      id,
      preferredPalette,
      preferredHueShift,
      preferredSeatId,
      skipSpawnEffect,
      folderName,
      nearAgentId,
    );
    const ch = this.characters.get(id);
    hooks.addAgentLog?.push({
      id,
      skipSpawnEffect,
      matrixEffectAtCreation: ch?.matrixEffect ?? null,
    });
  };
}
