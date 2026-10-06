/**
 * Meeting room: where a briefing meeting happens, found at runtime.
 *
 * 1. An Area whose label contains "meeting" (any case) wins: its seats, and
 *    the biggest table inside it for the boss's head spot.
 * 2. Otherwise the biggest table (desk furniture, by footprint, then by
 *    chairs around it) with at least two chairs next to it. In the default
 *    office that is the main room's work table.
 *
 * The plan lists the chairs (nearest to the table centre first), the tile
 * where the boss stands (the head), and spare standing tiles for cats that
 * get no chair. Pure: no OfficeState, unit-tested directly.
 */
import { isWalkable } from '../layout/tileMap.js';
import type { Direction as DirectionT, PlacedFurniture, Seat, TileType } from '../types.js';
import { Direction } from '../types.js';
import type { Tile } from './socialMoves.js';

export interface MeetingRoomWorld {
  cols: number;
  areaTiles?: Array<string | null>;
  furniture: PlacedFurniture[];
  /** Footprint of a desk / table type, or undefined for anything else. */
  tableSize(type: string): { w: number; h: number } | undefined;
  seats: Map<string, Seat>;
  tileMap: TileType[][];
  blockedTiles: Set<string>;
}

export interface MeetingPlan {
  /** Chairs of the room, nearest to the table centre first. */
  seats: Seat[];
  /** Where the boss stands, facing the table. */
  head: (Tile & { dir: DirectionT }) | null;
  /** Free standing tiles next to the table for cats without a chair. */
  stand: Tile[];
}

/** Area labels that name a meeting room. */
export const MEETING_AREA_PATTERN = /meeting/i;

interface Table {
  col: number;
  row: number;
  w: number;
  h: number;
}

const key = (c: number, r: number) => `${c},${r}`;

/** Tiles next to the table (4-neighbours of its footprint), with the side they are on. */
function ring(t: Table): Array<Tile & { side: DirectionT }> {
  const out: Array<Tile & { side: DirectionT }> = [];
  for (let c = t.col; c < t.col + t.w; c++) {
    out.push({ col: c, row: t.row - 1, side: Direction.UP });
    out.push({ col: c, row: t.row + t.h, side: Direction.DOWN });
  }
  for (let r = t.row; r < t.row + t.h; r++) {
    out.push({ col: t.col - 1, row: r, side: Direction.LEFT });
    out.push({ col: t.col + t.w, row: r, side: Direction.RIGHT });
  }
  return out;
}

function seatsAround(t: Table, seats: Seat[]): Seat[] {
  const near = new Set(ring(t).map((p) => key(p.col, p.row)));
  return seats.filter((s) => near.has(key(s.seatCol, s.seatRow)));
}

/** The side a boss faces from a ring tile: toward the table. */
const FACING: Record<DirectionT, DirectionT> = {
  [Direction.UP]: Direction.DOWN,
  [Direction.DOWN]: Direction.UP,
  [Direction.LEFT]: Direction.RIGHT,
  [Direction.RIGHT]: Direction.LEFT,
};

export function planMeetingRoom(w: MeetingRoomWorld): MeetingPlan | null {
  const allSeats = [...w.seats.values()];
  const area = meetingArea(w);
  const tables: Table[] = [];
  for (const f of w.furniture) {
    const size = w.tableSize(f.type);
    if (size) tables.push({ col: f.col, row: f.row, w: size.w, h: size.h });
  }
  const inArea = (c: number, r: number) => !area || area.has(key(c, r));
  const candidates = tables.filter((t) => !area || ring(t).some((p) => inArea(p.col, p.row)));
  let best: { table: Table; seats: Seat[] } | null = null;
  for (const table of candidates) {
    const seats = seatsAround(table, allSeats);
    const size = table.w * table.h;
    const bestSize = best ? best.table.w * best.table.h : -1;
    if (seats.length < 2 && !area) continue;
    if (!best || size > bestSize || (size === bestSize && seats.length > best.seats.length)) {
      best = { table, seats };
    }
  }
  const roomSeats = area
    ? allSeats.filter((s) => area.has(key(s.seatCol, s.seatRow)))
    : (best?.seats ?? []);
  if (roomSeats.length === 0) return null;
  const centre = best
    ? { col: best.table.col + (best.table.w - 1) / 2, row: best.table.row + (best.table.h - 1) / 2 }
    : centroid(roomSeats);
  const dist = (c: number, r: number) => Math.abs(c - centre.col) + Math.abs(r - centre.row);
  roomSeats.sort((a, b) => dist(a.seatCol, a.seatRow) - dist(b.seatCol, b.seatRow));

  const seatKeys = new Set(allSeats.map((s) => key(s.seatCol, s.seatRow)));
  const free = (c: number, r: number) =>
    isWalkable(c, r, w.tileMap, w.blockedTiles) && !seatKeys.has(key(c, r)) && inArea(c, r);
  const spots = best ? ring(best.table).filter((p) => free(p.col, p.row)) : [];
  let head: MeetingPlan['head'] = null;
  if (best) {
    const t = best.table;
    // Short sides first (the head of the table), then the top side (the boss
    // faces the viewer), then the middle of that side.
    const tall = t.h > t.w;
    const score = (p: Tile & { side: DirectionT }) => {
      const vertical = p.side === Direction.UP || p.side === Direction.DOWN;
      const short = vertical === tall ? 0 : 100;
      const top = p.side === Direction.UP ? 0 : 10;
      return short + top + dist(p.col, p.row);
    };
    const pick = [...spots].sort((a, b) => score(a) - score(b))[0];
    if (pick) head = { col: pick.col, row: pick.row, dir: FACING[pick.side] };
  } else if (area) {
    const tiles = [...area].map((k) => k.split(',').map(Number)).filter(([c, r]) => free(c, r));
    tiles.sort((a, b) => dist(a[0], a[1]) - dist(b[0], b[1]));
    if (tiles[0]) head = { col: tiles[0][0], row: tiles[0][1], dir: Direction.DOWN };
  }
  const stand = spots
    .filter((p) => !head || p.col !== head.col || p.row !== head.row)
    .sort((a, b) => dist(a.col, a.row) - dist(b.col, b.row))
    .map(({ col, row }) => ({ col, row }));
  return { seats: roomSeats, head, stand };
}

function meetingArea(w: MeetingRoomWorld): Set<string> | null {
  const tiles = w.areaTiles;
  if (!tiles) return null;
  const out = new Set<string>();
  tiles.forEach((label, i) => {
    if (label && MEETING_AREA_PATTERN.test(label)) out.add(key(i % w.cols, Math.floor(i / w.cols)));
  });
  return out.size > 0 ? out : null;
}

function centroid(seats: Seat[]): Tile {
  const col = seats.reduce((s, x) => s + x.seatCol, 0) / seats.length;
  const row = seats.reduce((s, x) => s + x.seatRow, 0) / seats.length;
  return { col, row };
}

/** Where one meeting cat goes: a chair (`seat`), or a tile to stand on. */
export interface MeetingPlace {
  goal: Tile | null;
  seat: Seat | null;
  face: DirectionT | null;
  /** A chair that is not the cat's own desk seat (reserved for the meeting). */
  borrowed: boolean;
}

/**
 * The boss stands at the head. Every other cat takes its own seat when it is
 * in the room, else a chair no agent owns, else a spare standing tile, else
 * it stays where it is.
 */
export function assignPlaces(
  plan: MeetingPlan | null,
  cats: number[],
  bossId: number,
  seatIdOf: (id: number) => string | null,
): Map<number, MeetingPlace> {
  const out = new Map<number, MeetingPlace>();
  const taken = new Set<string>();
  const stand = [...(plan?.stand ?? [])];
  const face = plan?.head?.dir ?? null;
  for (const id of cats) {
    if (id === bossId && plan?.head) {
      out.set(id, { goal: plan.head, seat: null, face: plan.head.dir, borrowed: false });
      continue;
    }
    const own = plan?.seats.find((s) => s.uid === seatIdOf(id));
    const chair = own ?? plan?.seats.find((s) => !s.assigned && !taken.has(s.uid));
    if (chair) {
      taken.add(chair.uid);
      out.set(id, { goal: null, seat: chair, face: null, borrowed: !own });
    } else {
      out.set(id, { goal: stand.shift() ?? null, seat: null, face, borrowed: false });
    }
  }
  return out;
}
