import type { DeckSlot } from "../types";

export interface PlacedSlot {
  slot: DeckSlot;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface GridLayoutInfo {
  placed: PlacedSlot[];
  occupied: Set<number>;
  originMap: Map<number, PlacedSlot>;
}

export function computeGridLayout(
  cols: number,
  rows: number,
  slots: DeckSlot[]
): GridLayoutInfo {
  const occupied = new Set<number>();
  const originMap = new Map<number, PlacedSlot>();
  const placed: PlacedSlot[] = [];

  const sorted = [...slots].sort((a, b) => a.index - b.index);
  for (const slot of sorted) {
    if (slot.index < 0 || slot.index >= cols * rows) continue;
    const col = slot.index % cols;
    const row = Math.floor(slot.index / cols);
    const colSpan = Math.max(1, Math.min(slot.colSpan ?? 1, cols - col));
    const rowSpan = Math.max(1, Math.min(slot.rowSpan ?? 1, rows - row));

    // Skip if origin itself is already covered by an earlier merged slot
    if (occupied.has(slot.index)) continue;

    // Clamp span if it would collide with an already-occupied cell
    let safeColSpan = 1;
    for (let cs = 1; cs <= colSpan; cs++) {
      let ok = true;
      for (let r = row; r < row + rowSpan; r++) {
        if (occupied.has(r * cols + (col + cs - 1))) {
          ok = false;
          break;
        }
      }
      if (ok) safeColSpan = cs;
      else break;
    }

    let safeRowSpan = 1;
    for (let rs = 1; rs <= rowSpan; rs++) {
      let ok = true;
      for (let c = col; c < col + safeColSpan; c++) {
        if (occupied.has((row + rs - 1) * cols + c)) {
          ok = false;
          break;
        }
      }
      if (ok) safeRowSpan = rs;
      else break;
    }

    for (let r = row; r < row + safeRowSpan; r++) {
      for (let c = col; c < col + safeColSpan; c++) {
        occupied.add(r * cols + c);
      }
    }

    const entry: PlacedSlot = {
      slot,
      col,
      row,
      colSpan: safeColSpan,
      rowSpan: safeRowSpan,
    };
    placed.push(entry);
    originMap.set(slot.index, entry);
  }

  return { placed, occupied, originMap };
}

export function canPlaceSpan(
  cols: number,
  rows: number,
  slots: DeckSlot[],
  originIndex: number,
  targetColSpan: number,
  targetRowSpan: number,
  ignoreSlotId?: string
): boolean {
  const col = originIndex % cols;
  const row = Math.floor(originIndex / cols);
  if (col + targetColSpan > cols || row + targetRowSpan > rows) {
    return false;
  }

  const otherOccupied = new Set<number>();
  for (const s of slots) {
    if (ignoreSlotId && s.id === ignoreSlotId) continue;
    const sc = s.index % cols;
    const sr = Math.floor(s.index / cols);
    const scs = Math.max(1, Math.min(s.colSpan ?? 1, cols - sc));
    const srs = Math.max(1, Math.min(s.rowSpan ?? 1, rows - sr));
    for (let r = sr; r < sr + srs; r++) {
      for (let c = sc; c < sc + scs; c++) {
        otherOccupied.add(r * cols + c);
      }
    }
  }

  for (let r = row; r < row + targetRowSpan; r++) {
    for (let c = col; c < col + targetColSpan; c++) {
      if (otherOccupied.has(r * cols + c)) return false;
    }
  }
  return true;
}
