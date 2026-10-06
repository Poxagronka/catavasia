// Tidy org-chart layout over a hierarchy tree. Pure and deterministic: the
// same tree always gives the same positions.
//
// Each subtree gets a width: the sum of its children's widths plus gaps, or
// the node width when that is wider. Children sit side by side in their
// subtree slot, so siblings never overlap. A parent is centred over the
// span of its children's centres. A parent with more than STACK_AFTER
// leaf reports stacks them in one column of compact rows on a spine.

import type { TreeNode } from './hierarchy.js';

export const NODE_W = 220;
export const NODE_H = 164;
export const ROW_W = 220;
export const ROW_H = 72;
/** Horizontal gap between sibling subtrees. */
export const H_GAP = 28;
/** Vertical gap between a parent and its reports (connector + "+" button). */
export const V_GAP = 60;
/** Gap between stacked rows (room for each row's "+" button). */
export const ROW_GAP = 22;
/** Spine indent of a stacked column. */
export const STACK_INDENT = 24;
/** More leaf reports than this stack vertically. */
export const STACK_AFTER = 3;
/** Free space around the chart. */
export const MARGIN = 24;

export interface LaidOutNode {
  id: string;
  /** Top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /** A compact row in a stacked leaf column. */
  compact: boolean;
}

/** An orthogonal polyline from a parent down to one report. */
export interface Connector {
  from: string;
  to: string;
  points: [number, number][];
}

export interface OrgLayout {
  nodes: LaidOutNode[];
  connectors: Connector[];
  width: number;
  height: number;
}

const isStacked = (n: TreeNode) =>
  n.children.length > STACK_AFTER && n.children.every((c) => c.children.length === 0);

const stackWidth = () => STACK_INDENT + ROW_W;

function subtreeWidth(n: TreeNode, memo: Map<TreeNode, number>): number {
  const known = memo.get(n);
  if (known !== undefined) return known;
  let w = NODE_W;
  if (isStacked(n)) w = Math.max(w, stackWidth());
  else if (n.children.length > 0) {
    const kids = n.children.reduce((s, c) => s + subtreeWidth(c, memo), 0);
    w = Math.max(w, kids + H_GAP * (n.children.length - 1));
  }
  memo.set(n, w);
  return w;
}

export function layoutOrgChart(root: TreeNode | null): OrgLayout {
  if (!root) return { nodes: [], connectors: [], width: 0, height: 0 };
  const memo = new Map<TreeNode, number>();
  const nodes: LaidOutNode[] = [];
  const connectors: Connector[] = [];

  /** Place `n` inside the slot [left, left + subtreeWidth). Returns its centre x. */
  const place = (n: TreeNode, left: number, y: number, depth: number): number => {
    const slot = subtreeWidth(n, memo);
    const childY = y + NODE_H + V_GAP;
    const barY = y + NODE_H + Math.round(V_GAP / 2);
    let cx: number;

    if (isStacked(n)) {
      const colLeft = left + Math.round((slot - stackWidth()) / 2);
      cx = colLeft + Math.round(stackWidth() / 2);
      const spineX = colLeft + Math.round(STACK_INDENT / 2);
      n.children.forEach((c, i) => {
        const ry = childY + i * (ROW_H + ROW_GAP);
        const midY = ry + Math.round(ROW_H / 2);
        nodes.push({
          id: c.cat.id,
          x: colLeft + STACK_INDENT,
          y: ry,
          w: ROW_W,
          h: ROW_H,
          depth: depth + 1,
          compact: true,
        });
        connectors.push({
          from: n.cat.id,
          to: c.cat.id,
          points: [
            [cx, y + NODE_H],
            [cx, barY],
            [spineX, barY],
            [spineX, midY],
            [colLeft + STACK_INDENT, midY],
          ],
        });
      });
    } else if (n.children.length > 0) {
      const kidsW =
        n.children.reduce((s, c) => s + subtreeWidth(c, memo), 0) + H_GAP * (n.children.length - 1);
      let cursor = left + Math.round((slot - kidsW) / 2);
      const centres = n.children.map((c) => {
        const ccx = place(c, cursor, childY, depth + 1);
        cursor += subtreeWidth(c, memo) + H_GAP;
        return ccx;
      });
      cx = Math.round((centres[0] + centres[centres.length - 1]) / 2);
      n.children.forEach((c, i) =>
        connectors.push({
          from: n.cat.id,
          to: c.cat.id,
          points: [
            [cx, y + NODE_H],
            [cx, barY],
            [centres[i], barY],
            [centres[i], childY],
          ],
        }),
      );
    } else {
      cx = left + Math.round(slot / 2);
    }

    nodes.push({
      id: n.cat.id,
      x: cx - NODE_W / 2,
      y,
      w: NODE_W,
      h: NODE_H,
      depth,
      compact: false,
    });
    return cx;
  };

  place(root, MARGIN, MARGIN, 0);
  // Parents are pushed after their reports: put them back in tree order.
  nodes.sort((a, b) => a.depth - b.depth || a.x - b.x || a.y - b.y);
  const width = subtreeWidth(root, memo) + 2 * MARGIN;
  const height = Math.max(...nodes.map((n) => n.y + n.h)) + MARGIN;
  return { nodes, connectors, width, height };
}
