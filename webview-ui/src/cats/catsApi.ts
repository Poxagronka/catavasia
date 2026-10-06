// Client-side contract of the Cats menu. The UI talks only to `CatsApi`.
// Today `localCatsAdapter.ts` implements it in the webview. Phase 1 (server
// orchestrator) plugs in a transport-backed adapter with a thin mapping, see
// docs/catavasia/ROADMAP.md "Cats menu UI (phase 2a)".

export type Engine = 'claude' | 'codex';

/** '#rrggbb' */
export type Hex = string;

/** Coat colour layers. A missing layer keeps the colour of the base breed. */
export interface ColorLayers {
  fur?: Hex;
  belly?: Hex;
  /** Tabby stripes, bengal rosettes. */
  stripe?: Hex;
  /** Calico / tortoiseshell patches. */
  patchA?: Hex;
  patchB?: Hex;
  /** Siamese points (ears, face mask, paws, tail). */
  point?: Hex;
}

export const PATTERN_IDS = [
  'solid',
  'tabby',
  'tuxedo',
  'calico',
  'tortie',
  'siamese',
  'bengal',
  'sweater',
] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export interface Appearance {
  /** Breed preset id (see catArt.ts BREED_PRESETS). Sets the silhouette and base palette. */
  breed?: string;
  colors?: ColorLayers;
  pattern?: PatternId;
  eyes?: Hex;
  /** A colour, or 'none' for no collar. */
  collar?: Hex | 'none';
}

export interface CatProfile {
  id: string;
  name: string;
  appearance: Appearance;
  role: string;
  systemPrompt: string;
  engine: Engine;
  model: string;
  effort: string;
  /** null = the boss (exactly one cat). */
  parentId: string | null;
  /** Seeded by the app, not by the user. */
  isDefault?: boolean;
}

export interface PetProfile {
  id: string;
  name: string;
  /** Only cats have generated art today. */
  species: 'cat';
  appearance: Appearance;
}

export interface CatsSnapshot {
  cats: CatProfile[];
  pets: PetProfile[];
}

export interface EngineOptions {
  models: string[];
  efforts: string[];
}

/**
 * Mutations are fire-and-forget: the new state arrives through `subscribe`,
 * so a server-backed adapter can apply them after a round trip. Invalid input
 * throws (validation runs on the client too).
 */
export interface CatsApi {
  getSnapshot(): CatsSnapshot;
  subscribe(listener: () => void): () => void;
  /** Create (unknown id) or update. The hierarchy fields are fixed up: the first cat is the boss. */
  saveCat(cat: CatProfile): void;
  /** Reports of the deleted cat move up to its parent. */
  deleteCat(id: string): void;
  /** Throws on a cycle or an unknown cat. */
  setParent(id: string, parentId: string): void;
  promoteToBoss(id: string): void;
  savePet(pet: PetProfile): void;
  deletePet(id: string): void;
  engineOptions(engine: Engine): EngineOptions;
}

export const ENGINE_LABELS: Record<Engine, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

const HEX_RE = /^#[0-9a-f]{6}$/i;
export const MAX_NAME_LENGTH = 40;

function appearanceErrors(a: Appearance, knownBreeds: readonly string[]): string[] {
  const errors: string[] = [];
  if (a.breed !== undefined && !knownBreeds.includes(a.breed))
    errors.push(`unknown breed "${a.breed}"`);
  if (a.pattern !== undefined && !PATTERN_IDS.includes(a.pattern))
    errors.push(`unknown pattern "${a.pattern}"`);
  for (const [layer, value] of Object.entries(a.colors ?? {}))
    if (value !== undefined && !HEX_RE.test(value)) errors.push(`${layer} is not #rrggbb`);
  if (a.eyes !== undefined && !HEX_RE.test(a.eyes)) errors.push('eyes is not #rrggbb');
  if (a.collar !== undefined && a.collar !== 'none' && !HEX_RE.test(a.collar))
    errors.push('collar is not #rrggbb or none');
  return errors;
}

function nameErrors(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return ['name is empty'];
  if (trimmed.length > MAX_NAME_LENGTH) return [`name is longer than ${MAX_NAME_LENGTH}`];
  return [];
}

export function validateCatProfile(
  cat: CatProfile,
  options: EngineOptions,
  knownBreeds: readonly string[],
): string[] {
  const errors = [...nameErrors(cat.name), ...appearanceErrors(cat.appearance, knownBreeds)];
  if (!(cat.engine in ENGINE_LABELS)) errors.push(`unknown engine "${cat.engine}"`);
  if (!options.models.includes(cat.model)) errors.push(`model "${cat.model}" is not offered`);
  if (!options.efforts.includes(cat.effort)) errors.push(`effort "${cat.effort}" is not offered`);
  if (cat.parentId === cat.id) errors.push('a cat cannot report to itself');
  return errors;
}

export function validatePetProfile(pet: PetProfile, knownBreeds: readonly string[]): string[] {
  const errors = [...nameErrors(pet.name), ...appearanceErrors(pet.appearance, knownBreeds)];
  if (pet.species !== 'cat') errors.push(`unknown species "${String(pet.species)}"`);
  return errors;
}
