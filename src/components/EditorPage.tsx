import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Keyboard,
  Image as ImageIcon,
  Globe,
  Terminal,
  CheckCircle2,
  RotateCw,
  Sun,
  Moon,
  FolderOutput,
  Volume2,
  Webhook,
  Layers,
  Type,
  Headphones,
  Smartphone,
  Download,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import {
  getEmojiIcon,
  listLocalApps,
  resolveIconUrl,
} from "../api";
import { createSlotId } from "../constants/editor";
import type {
  DeckSlot,
  LayoutConfig,
  LocalAppInfo,
  ScreenRatioPreset,
  ServerInfo,
  SlotAction,
  SystemStats,
} from "../types";
import { computeGridLayout } from "../utils/grid";
import { withRefreshTick } from "../utils/imageUrl";
import type { ThemeMode } from "../utils/theme";
import { isWindowsHost } from "./ActionConfigFields";
import { ConfigTransferModal } from "./ConfigTransferModal";
import { CustomSelect, type CustomSelectOption } from "./CustomSelect";
import { EditorInspector } from "./EditorInspector";
import { EditorPalette, type TemplateKind } from "./EditorPalette";
import { MonitorTile } from "./MonitorTile";

interface EditorPageProps {
  layout: LayoutConfig;
  allLayouts: LayoutConfig[];
  screenRatios: ScreenRatioPreset[];
  serverInfo: ServerInfo | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onBack: () => void;
  onSaveLayout: (layout: LayoutConfig) => Promise<void>;
  onSelectLayout: (layoutId: string) => void;
}

export function EditorPage({
  layout,
  allLayouts,
  screenRatios,
  serverInfo,
  theme,
  onToggleTheme,
  onBack,
  onSaveLayout,
  onSelectLayout,
}: EditorPageProps) {
  const [draft, setDraft] = useState<LayoutConfig>(layout);
  const [apps, setApps] = useState<LocalAppInfo[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [appQuery, setAppQuery] = useState("");
  const [paletteTab, setPaletteTab] = useState<"apps" | "actions">("apps");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [syncState, setSyncState] = useState<"saved" | "saving">("saved");
  const [draggedSlotIndex, setDraggedSlotIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [pendingInsert, setPendingInsert] = useState<{
    title: string;
    createSlot: (idx: number) => DeckSlot;
  } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    const unlisten = listen<SystemStats>("system-stats", (ev) => {
      setStats(ev.payload);
    });
    const timer = window.setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => {
      unlisten.then((fn) => fn());
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setDraft((prev) => (prev.id === layout.id ? prev : layout));
  }, [layout]);

  const refreshApps = () => {
    setLoadingApps(true);
    listLocalApps()
      .then((list) => setApps(list))
      .finally(() => setLoadingApps(false));
  };

  useEffect(() => {
    refreshApps();
  }, []);

  const commitDraft = (next: LayoutConfig) => {
    setDraft(next);
    setSyncState("saving");
    onSaveLayout(next).finally(() => {
      setSyncState("saved");
    });
  };

  const filteredApps = useMemo(() => {
    const q = appQuery.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) => a.name.toLowerCase().includes(q));
  }, [apps, appQuery]);

  const slotMap = useMemo(() => {
    const map = new Map<number, DeckSlot>();
    for (const s of draft.slots) {
      map.set(s.index, s);
    }
    return map;
  }, [draft.slots]);

  const selectedSlot = slotMap.get(selectedIndex) ?? null;

  const upsertSlot = (index: number, slot: DeckSlot) => {
    const remaining = draft.slots.filter((s) => s.index !== index);
    commitDraft({
      ...draft,
      slots: [...remaining, { ...slot, index }],
    });
  };

  const clearSlot = (index: number) => {
    commitDraft({
      ...draft,
      slots: draft.slots.filter((s) => s.index !== index),
    });
  };

  const findNextEmptyIndex = (fromIndex: number): number | null => {
    const total = draft.cols * draft.rows;
    const { occupied } = computeGridLayout(draft.cols, draft.rows, draft.slots);
    for (let offset = 1; offset < total; offset++) {
      const candidate = (fromIndex + offset) % total;
      if (!occupied.has(candidate)) return candidate;
    }
    return null;
  };

  const requestInsertSlot = (
    title: string,
    createSlot: (idx: number) => DeckSlot,
    targetIndex?: number
  ) => {
    if (targetIndex !== undefined) {
      setSelectedIndex(targetIndex);
      upsertSlot(targetIndex, createSlot(targetIndex));
      return;
    }

    const { occupied } = computeGridLayout(draft.cols, draft.rows, draft.slots);
    if (occupied.has(selectedIndex) || slotMap.has(selectedIndex)) {
      setPendingInsert({ title, createSlot });
      return;
    }

    upsertSlot(selectedIndex, createSlot(selectedIndex));
  };

  const placeAppInSlot = (app: LocalAppInfo, targetIndex?: number) => {
    requestInsertSlot(
      app.name,
      (idx) => ({
        id: createSlotId(),
        index: idx,
        label: app.name,
        icon: app.icon ?? null,
        color: "#1e293b",
        action: {
          type: "app",
          name: app.name,
          path: app.path,
        },
      }),
      targetIndex
    );
  };

  const createTemplateSlot = (type: TemplateKind, targetIndex?: number) => {
    const idx = targetIndex ?? selectedIndex;
    setSelectedIndex(idx);
    const otherLayout =
      allLayouts.find((l) => l.id !== draft.id) ?? allLayouts[0];
    const defaultMod = isWindowsHost() ? "ctrl" : "cmd";
    const defaults: Record<
      typeof type,
      { label: string; color: string; fontSize?: number; action: SlotAction }
    > = {
      audioOutput: {
        label: "切换音源",
        color: "#0891b2",
        action: {
          type: "audioOutput",
          mode: "hybrid",
          whitelistDeviceIds: [],
        },
      },
      hotkey: {
        label: "快捷键",
        color: "#1d4ed8",
        action: { type: "hotkey", modifiers: [defaultMod], key: "c", repeatCount: 1 },
      },
      text: {
        label: "输入文本",
        color: "#0284c7",
        fontSize: 18,
        action: { type: "text", text: "", autoEnter: false },
      },
      image: {
        label: "",
        color: "#1e293b",
        action: { type: "image", note: "", refreshInterval: 0 },
      },
      url: {
        label: "网页",
        color: "#0f766e",
        action: { type: "url", url: "https://google.com" },
      },
      command: {
        label: "命令",
        color: "#7c3aed",
        action: { type: "command", command: "echo hello" },
      },
      monitor: {
        label: "CPU",
        color: "#1e293b",
        action: { type: "monitor", metric: "cpu" },
      },
      switchLayout: {
        label: otherLayout ? otherLayout.name : "切换布局",
        color: "#0369a1",
        action: {
          type: "switchLayout",
          layoutId: otherLayout ? otherLayout.id : "",
        },
      },
      media: {
        label: "播放/暂停",
        color: "#be123c",
        action: { type: "media", control: "play_pause" },
      },
      webhook: {
        label: "Webhook",
        color: "#0f766e",
        action: { type: "webhook", url: "https://", method: "POST", body: "{}" },
      },
      macro: {
        label: "多步宏",
        color: "#b45309",
        action: {
          type: "macro",
          steps: [
            {
              action: { type: "hotkey", modifiers: [defaultMod], key: "c", repeatCount: 1 },
              delayMs: 200,
            },
          ],
        },
      },
    };
    const cfg = defaults[type];
    requestInsertSlot(
      cfg.label || type,
      (idx) => ({
        id: createSlotId(),
        index: idx,
        label: cfg.label,
        icon: null,
        color: cfg.color,
        fontSize: cfg.fontSize,
        action: cfg.action,
      }),
      targetIndex
    );
  };

  const swapSlots = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const fromSlot = slotMap.get(fromIndex);
    const toSlot = slotMap.get(toIndex);
    const others = draft.slots.filter(
      (s) => s.index !== fromIndex && s.index !== toIndex
    );
    const clampSpan = (
      slot: NonNullable<typeof fromSlot>,
      targetIdx: number
    ) => {
      const col = targetIdx % draft.cols;
      const row = Math.floor(targetIdx / draft.cols);
      const maxColSpan = Math.max(1, draft.cols - col);
      const maxRowSpan = Math.max(1, draft.rows - row);
      return {
        ...slot,
        index: targetIdx,
        colSpan: Math.min(slot.colSpan ?? 1, maxColSpan),
        rowSpan: Math.min(slot.rowSpan ?? 1, maxRowSpan),
      };
    };
    const nextSlots = [...others];
    if (fromSlot) nextSlots.push(clampSpan(fromSlot, toIndex));
    if (toSlot) nextSlots.push(clampSpan(toSlot, fromIndex));
    setSelectedIndex(toIndex);
    commitDraft({ ...draft, slots: nextSlots });
  };

  const aspectRatio =
    draft.width > 0 && draft.height > 0 ? draft.width / draft.height : 9 / 16;
  const isLandscape = aspectRatio > 1;

  const handleRotateScreen = () => {
    const oldCols = draft.cols;
    const oldRows = draft.rows;
    const newCols = oldRows;
    const newRows = oldCols;

    const rotateIndex = (idx: number) => {
      const oldCol = idx % oldCols;
      const oldRow = Math.floor(idx / oldCols);
      const newCol = oldRows - 1 - oldRow;
      const newRow = oldCol;
      return newRow * newCols + newCol;
    };

    const rotatedSlots = draft.slots.map((s) => ({
      ...s,
      index: rotateIndex(s.index),
    }));

    setSelectedIndex(rotateIndex(selectedIndex));
    commitDraft({
      ...draft,
      width: draft.height,
      height: draft.width,
      cols: newCols,
      rows: newRows,
      slots: rotatedSlots,
    });
  };

  const ratioOptions = useMemo<CustomSelectOption[]>(() => {
    const opts: CustomSelectOption[] = [];
    const seenValues = new Set<string>();
    const addOption = (
      w: number,
      h: number,
      badge?: string,
      name?: string
    ) => {
      const val = `${w}x${h}`;
      if (seenValues.has(val)) return;
      seenValues.add(val);
      opts.push({
        value: val,
        label: name?.trim() ? `${name.trim()} (${w} × ${h})` : `${w} × ${h}`,
        badge,
        icon: <Smartphone size={13} />,
      });
    };

    for (const preset of screenRatios) {
      addOption(
        preset.width,
        preset.height,
        preset.ratioKey,
        preset.deviceName
      );
    }
    addOption(390, 844, "默认");
    addOption(draft.width, draft.height, "当前");
    return opts;
  }, [screenRatios, draft.width, draft.height]);

  return (
    <div className="editor-page">
      <header className="editor-header">
        <div className="editor-header-left">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>
            <ArrowLeft size={15} />
            <span>返回主页</span>
          </button>
          <input
            className="device-name-input"
            value={draft.name}
            onChange={(e) => commitDraft({ ...draft, name: e.target.value })}
            placeholder="配置名称"
          />
          <div className="editor-ratio-select">
            <CustomSelect
              value={`${draft.width}x${draft.height}`}
              options={ratioOptions}
              searchable={false}
              onChange={(val) => {
                const [wStr, hStr] = val.split("x");
                const w = Number(wStr);
                const h = Number(hStr);
                if (w > 0 && h > 0) {
                  commitDraft({ ...draft, width: w, height: h });
                }
              }}
            />
          </div>
        </div>

        <div className="editor-header-right">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRotateScreen}
            title="旋转屏幕方向并同步调整行列"
          >
            <RotateCw size={14} />
            <span>{isLandscape ? "横屏 · 旋转" : "竖屏 · 旋转"}</span>
          </button>

          <div className="grid-size-control">
            <div className="grid-stepper">
              <span className="grid-stepper-label">列</span>
              <button
                type="button"
                className="btn btn-secondary btn-xs grid-stepper-btn"
                disabled={draft.cols <= 1}
                onClick={() =>
                  commitDraft({ ...draft, cols: Math.max(1, draft.cols - 1) })
                }
                title="减少列数"
              >
                -
              </button>
              <span className="grid-stepper-val">{draft.cols}</span>
              <button
                type="button"
                className="btn btn-secondary btn-xs grid-stepper-btn"
                disabled={draft.cols >= 8}
                onClick={() =>
                  commitDraft({ ...draft, cols: Math.min(8, draft.cols + 1) })
                }
                title="增加列数"
              >
                +
              </button>
            </div>
            <span className="grid-stepper-sep">×</span>
            <div className="grid-stepper">
              <span className="grid-stepper-label">行</span>
              <button
                type="button"
                className="btn btn-secondary btn-xs grid-stepper-btn"
                disabled={draft.rows <= 1}
                onClick={() =>
                  commitDraft({ ...draft, rows: Math.max(1, draft.rows - 1) })
                }
                title="减少行数"
              >
                -
              </button>
              <span className="grid-stepper-val">{draft.rows}</span>
              <button
                type="button"
                className="btn btn-secondary btn-xs grid-stepper-btn"
                disabled={draft.rows >= 8}
                onClick={() =>
                  commitDraft({ ...draft, rows: Math.min(8, draft.rows + 1) })
                }
                title="增加行数"
              >
                +
              </button>
            </div>
          </div>

          <div className="sync-indicator">
            <CheckCircle2 size={14} />
            <span>{syncState === "saving" ? "同步中..." : "已实时同步"}</span>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowExportModal(true)}
            title="导出当前配置"
          >
            <Download size={14} />
            <span>导出</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={onToggleTheme}
            title={theme === "dark" ? "切换到明亮模式" : "切换到暗黑模式"}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      <div className="editor-body">
        {/* Left Palette */}
        <EditorPalette
          paletteTab={paletteTab}
          onTabChange={setPaletteTab}
          appQuery={appQuery}
          onAppQueryChange={setAppQuery}
          loadingApps={loadingApps}
          filteredApps={filteredApps}
          serverPort={serverInfo?.port}
          onRefreshApps={refreshApps}
          onPlaceApp={placeAppInSlot}
          onCreateTemplate={(kind) => createTemplateSlot(kind)}
        />

        {/* Center Canvas */}
        <main className="editor-canvas-wrap">
          <div
            className={`device-frame ${isLandscape ? "landscape" : "portrait"}`}
            style={{
              aspectRatio: `${aspectRatio}`,
            }}
          >
            <div
              className={`editor-grid ${draggedSlotIndex !== null ? "is-dragging" : ""}`}
              style={{
                gridTemplateColumns: `repeat(${draft.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${draft.rows}, minmax(0, 1fr))`,
              }}
            >
              {(() => {
                const { occupied, originMap } = computeGridLayout(
                  draft.cols,
                  draft.rows,
                  draft.slots
                );
                return Array.from({ length: draft.cols * draft.rows }).map((_, idx) => {
                  const placed = originMap.get(idx);
                  if (!placed && occupied.has(idx)) {
                    return null;
                  }
                  const slot = placed?.slot ?? null;
                  const col = idx % draft.cols;
                  const row = Math.floor(idx / draft.cols);
                  const colSpan = placed?.colSpan ?? 1;
                  const rowSpan = placed?.rowSpan ?? 1;
                  const isSelected = selectedIndex === idx;
                  const isDragOver = dragOverIndex === idx;
                  const isImageTile = slot?.action.type === "image";
                  const isMonitorTile = slot?.action.type === "monitor";
                  const refreshInterval =
                    slot?.action.type === "image"
                      ? slot.action.refreshInterval
                      : 0;
                  const iconSrc = withRefreshTick(
                    resolveIconUrl(slot?.icon, serverInfo?.port),
                    refreshInterval,
                    nowSec
                  );
                  return (
                    <div
                      key={idx}
                      className={`editor-slot ${slot ? "filled" : "empty"} ${
                        isImageTile ? "is-image" : ""
                      } ${isMonitorTile ? "is-monitor" : ""} ${
                        isSelected ? "selected" : ""
                      } ${isDragOver ? "drag-over" : ""} ${
                        draggedSlotIndex === idx ? "dragging" : ""
                      }`}
                      style={{
                        backgroundColor: slot?.color || undefined,
                        gridColumn: `${col + 1} / span ${colSpan}`,
                        gridRow: `${row + 1} / span ${rowSpan}`,
                      }}
                      draggable={Boolean(slot)}
                      onDragStart={(e) => {
                        if (!slot) return;
                        e.dataTransfer.effectAllowed = "copyMove";
                        e.dataTransfer.setData("text/plain", String(idx));
                        e.dataTransfer.setData("application/smartdeck-slot", String(idx));
                        setDraggedSlotIndex(idx);
                      }}
                      onDragEnd={() => {
                        setDraggedSlotIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect =
                          draggedSlotIndex !== null ? "move" : "copy";
                        setDragOverIndex(idx);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect =
                          draggedSlotIndex !== null ? "move" : "copy";
                        if (dragOverIndex !== idx) setDragOverIndex(idx);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          if (dragOverIndex === idx) setDragOverIndex(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverIndex(null);
                        const appJson = e.dataTransfer.getData("application/smartdeck-app");
                        if (appJson) {
                          const app = JSON.parse(appJson) as LocalAppInfo;
                          placeAppInSlot(app, idx);
                          return;
                        }
                        const slotIdxStr =
                          e.dataTransfer.getData("application/smartdeck-slot") ||
                          e.dataTransfer.getData("text/plain");
                        const fromIdx =
                          slotIdxStr !== "" ? Number(slotIdxStr) : draggedSlotIndex;
                        if (fromIdx !== null && !Number.isNaN(fromIdx)) {
                          swapSlots(fromIdx, idx);
                          setDraggedSlotIndex(null);
                        }
                      }}
                      onClick={() => setSelectedIndex(idx)}
                    >
                      {slot ? (
                        isMonitorTile && slot.action.type === "monitor" ? (
                          <MonitorTile
                            metric={slot.action.metric}
                            stats={stats}
                            label={slot.label}
                          />
                        ) : isImageTile && iconSrc ? (
                          <>
                            <img
                              src={iconSrc}
                              alt={slot.label}
                              className="slot-full-img"
                              draggable={false}
                            />
                            {slot.label && (
                              <span
                                className="slot-overlay-label"
                                style={
                                  slot.fontSize
                                    ? { fontSize: `${slot.fontSize}px` }
                                    : undefined
                                }
                              >
                                {slot.label}
                              </span>
                            )}
                          </>
                        ) : slot.action.type === "text" &&
                          !getEmojiIcon(slot.icon) &&
                          !iconSrc &&
                          slot.label ? (
                          <span
                            className="slot-text-icon"
                            style={{ fontSize: `${slot.fontSize ?? 18}px` }}
                          >
                            {slot.label}
                          </span>
                        ) : (
                          <>
                            {getEmojiIcon(slot.icon) ? (
                              <span
                                className="editor-slot-emoji"
                                aria-label={slot.label}
                              >
                                {getEmojiIcon(slot.icon)}
                              </span>
                            ) : iconSrc ? (
                              <img
                                src={iconSrc}
                                alt={slot.label}
                                className="editor-slot-img"
                                draggable={false}
                              />
                            ) : (
                              <div className="editor-slot-fallback">
                                {slot.action.type === "hotkey" && <Keyboard size={20} />}
                                {slot.action.type === "text" && <Type size={20} />}
                                {slot.action.type === "image" && <ImageIcon size={20} />}
                                {slot.action.type === "switchLayout" && <FolderOutput size={20} />}
                                {slot.action.type === "media" && <Volume2 size={20} />}
                                {slot.action.type === "webhook" && <Webhook size={20} />}
                                {slot.action.type === "macro" && <Layers size={20} />}
                                {slot.action.type === "url" && <Globe size={20} />}
                                {slot.action.type === "command" && <Terminal size={20} />}
                                {slot.action.type === "audioOutput" && <Headphones size={20} />}
                              </div>
                            )}
                            {slot.label && (
                              <span
                                className="editor-slot-label"
                                style={
                                  slot.fontSize
                                    ? { fontSize: `${slot.fontSize}px` }
                                    : undefined
                                }
                              >
                                {slot.label}
                              </span>
                            )}
                          </>
                        )
                      ) : (
                        <span className="slot-plus">+</span>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </main>

        {/* Right Inspector */}
        <EditorInspector
          selectedIndex={selectedIndex}
          selectedSlot={selectedSlot}
          draft={draft}
          allLayouts={allLayouts}
          apps={apps}
          onCreateTemplate={createTemplateSlot}
          onUpsertSlot={upsertSlot}
          onClearSlot={clearSlot}
          onSelectLayout={onSelectLayout}
        />
      </div>

      {pendingInsert && (
        <div
          className="modal-backdrop"
          onClick={() => setPendingInsert(null)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">当前槽位已存在按钮</h3>
            <p className="modal-desc">
              槽位 #{selectedIndex + 1} 已配置内容，请选择如何添加「
              {pendingInsert.title}」：
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  upsertSlot(
                    selectedIndex,
                    pendingInsert.createSlot(selectedIndex)
                  );
                  setPendingInsert(null);
                }}
              >
                覆盖当前格
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={findNextEmptyIndex(selectedIndex) === null}
                onClick={() => {
                  const nextIdx = findNextEmptyIndex(selectedIndex);
                  if (nextIdx !== null) {
                    setSelectedIndex(nextIdx);
                    upsertSlot(nextIdx, pendingInsert.createSlot(nextIdx));
                  }
                  setPendingInsert(null);
                }}
              >
                添加到下一空位
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPendingInsert(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {showExportModal && (
        <ConfigTransferModal
          mode="export"
          layoutsToExport={[draft]}
          generateId={createSlotId}
          onImportLayouts={async () => {}}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
