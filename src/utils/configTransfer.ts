import type { DeckSlot, LayoutConfig } from "../types";

export interface ExportBundle {
  version: number;
  app: "landeck";
  exportedAt: string;
  layouts: LayoutConfig[];
}

export function serializeLayoutsForExport(layouts: LayoutConfig[]): string {
  if (layouts.length === 1) {
    return JSON.stringify(layouts[0], null, 2);
  }
  const bundle: ExportBundle = {
    version: 1,
    app: "landeck",
    exportedAt: new Date().toISOString(),
    layouts,
  };
  return JSON.stringify(bundle, null, 2);
}

export function downloadJsonFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "-");
  return cleaned || "landeck-config";
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, Math.round(val)));
}

function normalizeSlot(raw: unknown, generateId: () => string): DeckSlot | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.index !== "number" || !Number.isFinite(raw.index)) return null;
  if (!isRecord(raw.action) || typeof raw.action.type !== "string") return null;

  return {
    id: generateId(),
    index: Math.max(0, Math.round(raw.index)),
    label: typeof raw.label === "string" ? raw.label : "",
    icon: typeof raw.icon === "string" ? raw.icon : null,
    color: typeof raw.color === "string" ? raw.color : null,
    colSpan: typeof raw.colSpan === "number" ? raw.colSpan : undefined,
    rowSpan: typeof raw.rowSpan === "number" ? raw.rowSpan : undefined,
    fontSize: typeof raw.fontSize === "number" ? raw.fontSize : undefined,
    action: raw.action as DeckSlot["action"],
  };
}

function normalizeLayout(raw: unknown, generateId: () => string): LayoutConfig {
  if (!isRecord(raw)) {
    throw new Error("布局配置必须是 JSON 对象");
  }

  const hasShape =
    Array.isArray(raw.slots) ||
    (typeof raw.cols === "number" && typeof raw.rows === "number");
  if (!hasShape) {
    throw new Error("配置缺少有效的 cols / rows 或 slots 字段");
  }

  const rawSlots = Array.isArray(raw.slots) ? raw.slots : [];
  const slots: DeckSlot[] = [];
  for (const item of rawSlots) {
    const normalized = normalizeSlot(item, generateId);
    if (normalized) {
      slots.push(normalized);
    }
  }

  const rawName = typeof raw.name === "string" ? raw.name.trim() : "";

  return {
    id: generateId(),
    name: rawName || "导入配置",
    width: clampInt(raw.width, 200, 3840, 390),
    height: clampInt(raw.height, 200, 3840, 844),
    cols: clampInt(raw.cols, 1, 24, 3),
    rows: clampInt(raw.rows, 1, 24, 5),
    slots,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

export function parseImportedLayouts(
  rawText: string,
  generateId: () => string
): LayoutConfig[] {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("配置内容不能为空");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("JSON 格式无效，请检查语法是否正确");
  }

  let candidates: unknown[];
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (isRecord(parsed) && Array.isArray(parsed.layouts)) {
    candidates = parsed.layouts;
  } else if (isRecord(parsed)) {
    candidates = [parsed];
  } else {
    throw new Error("不支持的配置格式，请提供布局 JSON 对象或数组");
  }

  if (candidates.length === 0) {
    throw new Error("配置中未包含任何布局");
  }

  return candidates.map((item) => normalizeLayout(item, generateId));
}
