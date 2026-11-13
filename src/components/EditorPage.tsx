import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Search,
  Keyboard,
  Image as ImageIcon,
  Globe,
  Terminal,
  AppWindow,
  Play,
  Trash2,
  Upload,
  CheckCircle2,
  Plus,
  RotateCw,
  Sun,
  Moon,
  Cpu,
  HardDrive,
  ArrowDownUp,
  FolderOutput,
  Volume2,
  Webhook,
  Layers,
  RefreshCw,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import {
  listLocalApps,
  resolveIconUrl,
  saveCustomImage,
  triggerSlotAction,
} from "../api";
import type {
  DeckSlot,
  LayoutConfig,
  LocalAppInfo,
  ServerInfo,
  SlotAction,
  SystemStats,
} from "../types";
import { canPlaceSpan, computeGridLayout } from "../utils/grid";
import { withRefreshTick } from "../utils/imageUrl";
import type { ThemeMode } from "../utils/theme";
import { MonitorTile } from "./MonitorTile";

interface EditorPageProps {
  layout: LayoutConfig;
  allLayouts: LayoutConfig[];
  serverInfo: ServerInfo | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onBack: () => void;
  onSaveLayout: (layout: LayoutConfig) => Promise<void>;
}

const COLOR_SWATCHES = [
  "#1e293b",
  "#1d4ed8",
  "#0f766e",
  "#7c3aed",
  "#be123c",
  "#b45309",
  "#374151",
  "#0369a1",
];

function createSlotId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function EditorPage({
  layout,
  allLayouts,
  serverInfo,
  theme,
  onToggleTheme,
  onBack,
  onSaveLayout,
}: EditorPageProps) {
  const [draft, setDraft] = useState<LayoutConfig>(layout);
  const [apps, setApps] = useState<LocalAppInfo[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [appQuery, setAppQuery] = useState("");
  const [paletteTab, setPaletteTab] = useState<"apps" | "actions">("apps");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [recordingKey, setRecordingKey] = useState(false);
  const [syncState, setSyncState] = useState<"saved" | "saving">("saved");
  const [draggedSlotIndex, setDraggedSlotIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [pendingInsert, setPendingInsert] = useState<{
    title: string;
    createSlot: (idx: number) => DeckSlot;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const createTemplateSlot = (
    type:
      | "hotkey"
      | "image"
      | "url"
      | "command"
      | "cpu"
      | "memory"
      | "network"
      | "switchLayout"
      | "media"
      | "webhook"
      | "macro",
    targetIndex?: number
  ) => {
    const idx = targetIndex ?? selectedIndex;
    setSelectedIndex(idx);
    const otherLayout =
      allLayouts.find((l) => l.id !== draft.id) ?? allLayouts[0];
    const defaults: Record<typeof type, { label: string; color: string; action: SlotAction }> = {
      hotkey: {
        label: "快捷键",
        color: "#1d4ed8",
        action: { type: "hotkey", modifiers: ["cmd"], key: "c", repeatCount: 1 },
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
      cpu: {
        label: "CPU",
        color: "#1e293b",
        action: { type: "monitor", metric: "cpu" },
      },
      memory: {
        label: "内存",
        color: "#1e293b",
        action: { type: "monitor", metric: "memory" },
      },
      network: {
        label: "网络",
        color: "#1e293b",
        action: { type: "monitor", metric: "network" },
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
              action: { type: "hotkey", modifiers: ["cmd"], key: "c", repeatCount: 1 },
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

  useEffect(() => {
    if (!recordingKey || !selectedSlot) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rawKey = e.key;
      if (["Meta", "Control", "Alt", "Shift"].includes(rawKey)) {
        return;
      }
      const modifiers: string[] = [];
      if (e.metaKey) modifiers.push("cmd");
      if (e.ctrlKey) modifiers.push("ctrl");
      if (e.altKey) modifiers.push("alt");
      if (e.shiftKey) modifiers.push("shift");

      const normalizedKey = rawKey === " " ? "space" : rawKey.toLowerCase();
      upsertSlot(selectedIndex, {
        ...selectedSlot,
        action: {
          type: "hotkey",
          modifiers,
          key: normalizedKey,
        },
      });
      setRecordingKey(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [recordingKey, selectedSlot, selectedIndex]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const ext = file.name.split(".").pop() || "png";
    const iconUrl = await saveCustomImage(Array.from(new Uint8Array(buf)), ext);
    if (selectedSlot) {
      upsertSlot(selectedIndex, {
        ...selectedSlot,
        icon: iconUrl,
      });
    } else {
      upsertSlot(selectedIndex, {
        id: createSlotId(),
        index: selectedIndex,
        label: file.name.replace(/\.[^.]+$/, ""),
        icon: iconUrl,
        color: "#1e293b",
        action: { type: "image", note: "" },
      });
    }
    e.target.value = "";
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
          <span className="res-badge">
            {draft.width} × {draft.height}
          </span>
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
            <label>列</label>
            <input
              type="number"
              min={2}
              max={8}
              value={draft.cols}
              onChange={(e) =>
                commitDraft({
                  ...draft,
                  cols: Math.min(8, Math.max(2, Number(e.target.value) || 3)),
                })
              }
            />
            <span>×</span>
            <label>行</label>
            <input
              type="number"
              min={2}
              max={8}
              value={draft.rows}
              onChange={(e) =>
                commitDraft({
                  ...draft,
                  rows: Math.min(8, Math.max(2, Number(e.target.value) || 5)),
                })
              }
            />
          </div>

          <div className="sync-indicator">
            <CheckCircle2 size={14} />
            <span>{syncState === "saving" ? "同步中..." : "已实时同步"}</span>
          </div>

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
        <aside className="editor-sidebar">
          <div className="palette-tabs">
            <button
              className={`palette-tab ${paletteTab === "apps" ? "active" : ""}`}
              onClick={() => setPaletteTab("apps")}
            >
              <AppWindow size={15} />
              <span>本地应用</span>
            </button>
            <button
              className={`palette-tab ${paletteTab === "actions" ? "active" : ""}`}
              onClick={() => setPaletteTab("actions")}
            >
              <Keyboard size={15} />
              <span>快捷组件</span>
            </button>
          </div>

          {paletteTab === "apps" ? (
            <div className="apps-panel">
              <div className="search-row">
                <div className="search-box">
                  <Search size={14} />
                  <input
                    value={appQuery}
                    onChange={(e) => setAppQuery(e.target.value)}
                    placeholder="搜索本地应用..."
                  />
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={refreshApps}
                  title="刷新本地应用列表"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="apps-list">
                {loadingApps ? (
                  <div className="apps-loading">正在扫描 /Applications...</div>
                ) : filteredApps.length === 0 ? (
                  <div className="apps-loading">未找到匹配应用</div>
                ) : (
                  filteredApps.map((app) => {
                    const iconSrc = resolveIconUrl(app.icon, serverInfo?.port);
                    return (
                      <div
                        key={app.path}
                        className="app-item"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "copy";
                          e.dataTransfer.setData("text/plain", app.name);
                          e.dataTransfer.setData(
                            "application/smartdeck-app",
                            JSON.stringify(app)
                          );
                        }}
                        onClick={() => placeAppInSlot(app)}
                        title={`点击或拖拽添加到网格: ${app.path}`}
                      >
                        {iconSrc ? (
                          <img
                            src={iconSrc}
                            alt={app.name}
                            className="app-item-icon"
                            draggable={false}
                          />
                        ) : (
                          <div className="app-item-icon fallback">
                            <AppWindow size={16} />
                          </div>
                        )}
                        <span className="app-item-name">{app.name}</span>
                        <Plus size={14} className="app-item-add" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="actions-panel">
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("hotkey")}
              >
                <Keyboard size={18} />
                <div>
                  <div className="tpl-title">快捷键</div>
                  <div className="tpl-desc">模拟组合键，如 Cmd+Shift+4</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("image")}
              >
                <ImageIcon size={18} />
                <div>
                  <div className="tpl-title">图片 / 贴纸</div>
                  <div className="tpl-desc">上传自定义图片或标签</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("url")}
              >
                <Globe size={18} />
                <div>
                  <div className="tpl-title">打开网页</div>
                  <div className="tpl-desc">在默认浏览器打开指定网址</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("command")}
              >
                <Terminal size={18} />
                <div>
                  <div className="tpl-title">Shell 命令</div>
                  <div className="tpl-desc">在桌面端执行自定义终端命令</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("cpu")}
              >
                <Cpu size={18} />
                <div>
                  <div className="tpl-title">CPU 占用率</div>
                  <div className="tpl-desc">实时显示电脑 CPU 使用率</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("memory")}
              >
                <HardDrive size={18} />
                <div>
                  <div className="tpl-title">内存占用率</div>
                  <div className="tpl-desc">实时显示内存使用比例与容量</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("network")}
              >
                <ArrowDownUp size={18} />
                <div>
                  <div className="tpl-title">网络占用率</div>
                  <div className="tpl-desc">实时显示上下行网络速率</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("switchLayout")}
              >
                <FolderOutput size={18} />
                <div>
                  <div className="tpl-title">跳转布局</div>
                  <div className="tpl-desc">点击跳转到已配置的另一个布局</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("media")}
              >
                <Volume2 size={18} />
                <div>
                  <div className="tpl-title">媒体 / 音量</div>
                  <div className="tpl-desc">播放暂停、切歌、系统音量控制</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("webhook")}
              >
                <Webhook size={18} />
                <div>
                  <div className="tpl-title">HTTP Webhook</div>
                  <div className="tpl-desc">静默发送 GET / POST 请求</div>
                </div>
              </button>
              <button
                className="action-template-btn"
                onClick={() => createTemplateSlot("macro")}
              >
                <Layers size={18} />
                <div>
                  <div className="tpl-title">多步宏动作</div>
                  <div className="tpl-desc">按顺序执行多个动作与延迟</div>
                </div>
              </button>
            </div>
          )}
        </aside>

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
                        ) : (
                          <>
                            {iconSrc ? (
                              <img
                                src={iconSrc}
                                alt={slot.label}
                                className="editor-slot-img"
                                draggable={false}
                              />
                            ) : (
                              <div className="editor-slot-fallback">
                                {slot.action.type === "hotkey" && <Keyboard size={20} />}
                                {slot.action.type === "image" && <ImageIcon size={20} />}
                                {slot.action.type === "switchLayout" && <FolderOutput size={20} />}
                                {slot.action.type === "media" && <Volume2 size={20} />}
                                {slot.action.type === "webhook" && <Webhook size={20} />}
                                {slot.action.type === "macro" && <Layers size={20} />}
                                {slot.action.type === "url" && <Globe size={20} />}
                                {slot.action.type === "command" && <Terminal size={20} />}
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
        <aside className="editor-inspector">
          <h3 className="inspector-title">槽位属性 #{selectedIndex + 1}</h3>

          {!selectedSlot ? (
            <div className="inspector-empty">
              <p>当前槽位为空</p>
              <span>从左侧点击或拖拽应用，或快速创建一个功能按钮：</span>
              <div className="quick-create-grid">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => createTemplateSlot("hotkey", selectedIndex)}
                >
                  <Keyboard size={14} /> 快捷键
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => createTemplateSlot("image", selectedIndex)}
                >
                  <ImageIcon size={14} /> 图片
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => createTemplateSlot("url", selectedIndex)}
                >
                  <Globe size={14} /> 网页
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => createTemplateSlot("command", selectedIndex)}
                >
                  <Terminal size={14} /> 命令
                </button>
              </div>
            </div>
          ) : (
            <div className="inspector-form">
              <div className="form-group">
                <label>按钮标题</label>
                <input
                  value={selectedSlot.label}
                  onChange={(e) =>
                    upsertSlot(selectedIndex, {
                      ...selectedSlot,
                      label: e.target.value,
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label>字体大小 ({selectedSlot.fontSize ?? 12}px)</label>
                <input
                  type="range"
                  min={10}
                  max={28}
                  value={selectedSlot.fontSize ?? 12}
                  onChange={(e) =>
                    upsertSlot(selectedIndex, {
                      ...selectedSlot,
                      fontSize: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label>背景颜色</label>
                <div className="color-row">
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={c}
                      className={`color-swatch ${
                        selectedSlot.color === c ? "active" : ""
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() =>
                        upsertSlot(selectedIndex, { ...selectedSlot, color: c })
                      }
                    />
                  ))}
                  <input
                    type="color"
                    value={selectedSlot.color || "#1e293b"}
                    onChange={(e) =>
                      upsertSlot(selectedIndex, {
                        ...selectedSlot,
                        color: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label>跨区合并（列 × 行）</label>
                <div className="span-controls">
                  <div className="span-stepper">
                    <span>跨列</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={(selectedSlot.colSpan ?? 1) <= 1}
                      onClick={() =>
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          colSpan: Math.max(1, (selectedSlot.colSpan ?? 1) - 1),
                        })
                      }
                    >
                      -
                    </button>
                    <span>{selectedSlot.colSpan ?? 1}</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={
                        !canPlaceSpan(
                          draft.cols,
                          draft.rows,
                          draft.slots,
                          selectedIndex,
                          (selectedSlot.colSpan ?? 1) + 1,
                          selectedSlot.rowSpan ?? 1,
                          selectedSlot.id
                        )
                      }
                      onClick={() =>
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          colSpan: (selectedSlot.colSpan ?? 1) + 1,
                        })
                      }
                    >
                      +
                    </button>
                  </div>

                  <div className="span-stepper">
                    <span>跨行</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={(selectedSlot.rowSpan ?? 1) <= 1}
                      onClick={() =>
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          rowSpan: Math.max(1, (selectedSlot.rowSpan ?? 1) - 1),
                        })
                      }
                    >
                      -
                    </button>
                    <span>{selectedSlot.rowSpan ?? 1}</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={
                        !canPlaceSpan(
                          draft.cols,
                          draft.rows,
                          draft.slots,
                          selectedIndex,
                          selectedSlot.colSpan ?? 1,
                          (selectedSlot.rowSpan ?? 1) + 1,
                          selectedSlot.id
                        )
                      }
                      onClick={() =>
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          rowSpan: (selectedSlot.rowSpan ?? 1) + 1,
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>图标 / 自定义图片</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleImageUpload}
                />
                <div className="icon-upload-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={14} />
                    <span>上传图片</span>
                  </button>
                  {selectedSlot.icon && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          icon: null,
                        })
                      }
                    >
                      移除图标
                    </button>
                  )}
                </div>
              </div>

              {selectedSlot.action.type === "app" && (
                <div className="form-group">
                  <label>启动应用</label>
                  <div className="readonly-box">{selectedSlot.action.path}</div>
                </div>
              )}

              {selectedSlot.action.type === "hotkey" && (
                <div className="form-group">
                  <label>快捷键组合</label>
                  <button
                    className={`record-key-btn ${recordingKey ? "recording" : ""}`}
                    onClick={() => setRecordingKey((v) => !v)}
                  >
                    {recordingKey
                      ? "请按下组合键（或下方手动选择）..."
                      : [...selectedSlot.action.modifiers, selectedSlot.action.key]
                          .filter(Boolean)
                          .join(" + ")
                          .toUpperCase()}
                  </button>

                  <div className="modifier-pills">
                    {[
                      { id: "cmd", label: "⌘ Cmd" },
                      { id: "ctrl", label: "⌃ Ctrl" },
                      { id: "alt", label: "⌥ Alt" },
                      { id: "shift", label: "⇧ Shift" },
                    ].map((mod) => {
                      const hotkey = selectedSlot.action as {
                        type: "hotkey";
                        modifiers: string[];
                        key: string;
                      };
                      const active = hotkey.modifiers.includes(mod.id);
                      return (
                        <button
                          key={mod.id}
                          type="button"
                          className={`mod-pill ${active ? "active" : ""}`}
                          onClick={() => {
                            const nextMods = active
                              ? hotkey.modifiers.filter((m) => m !== mod.id)
                              : [...hotkey.modifiers, mod.id];
                            upsertSlot(selectedIndex, {
                              ...selectedSlot,
                              action: {
                                type: "hotkey",
                                modifiers: nextMods,
                                key: hotkey.key,
                              },
                            });
                          }}
                        >
                          {mod.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="hotkey-manual-row">
                    <label>主键</label>
                    <select
                      value={selectedSlot.action.key || "none"}
                      onChange={(e) =>
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          action: {
                            type: "hotkey",
                            modifiers:
                              selectedSlot.action.type === "hotkey"
                                ? selectedSlot.action.modifiers
                                : [],
                            key: e.target.value === "none" ? "" : e.target.value,
                            repeatCount:
                              selectedSlot.action.type === "hotkey"
                                ? selectedSlot.action.repeatCount ?? 1
                                : 1,
                          },
                        })
                      }
                    >
                      <option value="none">无主键（仅修饰键）</option>
                      {[
                        "`",
                        "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
                        "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
                        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
                        "space", "enter", "tab", "escape", "backspace", "delete",
                        "up", "down", "left", "right",
                        "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
                      ].map((k) => (
                        <option key={k} value={k}>
                          {k.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="hotkey-manual-row">
                    <label>连续触发</label>
                    <select
                      value={selectedSlot.action.repeatCount ?? 1}
                      onChange={(e) =>
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          action: {
                            type: "hotkey",
                            modifiers:
                              selectedSlot.action.type === "hotkey"
                                ? selectedSlot.action.modifiers
                                : [],
                            key:
                              selectedSlot.action.type === "hotkey"
                                ? selectedSlot.action.key
                                : "",
                            repeatCount: Number(e.target.value) || 1,
                          },
                        })
                      }
                    >
                      <option value={1}>1 次（单次）</option>
                      <option value={2}>2 次（双击，如连按两次 Ctrl）</option>
                      <option value={3}>3 次（三连击）</option>
                    </select>
                  </div>

                  <span className="hint-text">
                    系统保留快捷键（如 Cmd+W / Cmd+Space / Cmd+Tab）请直接使用上方修饰键与主键选择器配置
                  </span>
                </div>
              )}

              {selectedSlot.action.type === "image" && (
                <>
                  <div className="form-group">
                    <label>网络图片 URL（可选，支持动态图）</label>
                    <input
                      placeholder="https://example.com/image.png"
                      value={selectedSlot.icon ?? ""}
                      onChange={(e) =>
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          icon: e.target.value || null,
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>网络图片刷新频率</label>
                    <select
                      className="select-input"
                      value={selectedSlot.action.refreshInterval ?? 0}
                      onChange={(e) =>
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          action: {
                            type: "image",
                            note:
                              selectedSlot.action.type === "image"
                                ? selectedSlot.action.note
                                : "",
                            refreshInterval: Number(e.target.value) || 0,
                          },
                        })
                      }
                    >
                      <option value={0}>不自动刷新</option>
                      <option value={5}>每 5 秒</option>
                      <option value={10}>每 10 秒</option>
                      <option value={15}>每 15 秒</option>
                      <option value={30}>每 30 秒</option>
                      <option value={60}>每 60 秒</option>
                      <option value={120}>每 120 秒</option>
                    </select>
                  </div>
                </>
              )}

              {selectedSlot.action.type === "switchLayout" && (
                <div className="form-group">
                  <label>目标布局配置</label>
                  <select
                    className="select-input"
                    value={selectedSlot.action.layoutId}
                    onChange={(e) => {
                      const targetId = e.target.value;
                      const target = allLayouts.find((l) => l.id === targetId);
                      upsertSlot(selectedIndex, {
                        ...selectedSlot,
                        label: target ? target.name : selectedSlot.label,
                        action: { type: "switchLayout", layoutId: targetId },
                      });
                    }}
                  >
                    <option value="">请选择要跳转的布局...</option>
                    {allLayouts.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.cols}×{l.rows})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedSlot.action.type === "media" && (
                <div className="form-group">
                  <label>媒体 / 音量控制</label>
                  <select
                    className="select-input"
                    value={selectedSlot.action.control}
                    onChange={(e) => {
                      const control = e.target.value as
                        | "play_pause"
                        | "next"
                        | "prev"
                        | "vol_up"
                        | "vol_down"
                        | "mute";
                      const labelMap: Record<typeof control, string> = {
                        play_pause: "播放/暂停",
                        next: "下一曲",
                        prev: "上一曲",
                        vol_up: "音量 +",
                        vol_down: "音量 -",
                        mute: "静音",
                      };
                      upsertSlot(selectedIndex, {
                        ...selectedSlot,
                        label: labelMap[control],
                        action: { type: "media", control },
                      });
                    }}
                  >
                    <option value="play_pause">播放 / 暂停</option>
                    <option value="next">下一曲</option>
                    <option value="prev">上一曲</option>
                    <option value="vol_up">音量增大</option>
                    <option value="vol_down">音量减小</option>
                    <option value="mute">静音切换</option>
                  </select>
                </div>
              )}

              {selectedSlot.action.type === "webhook" && (
                <>
                  <div className="form-group">
                    <label>请求方法 & URL</label>
                    <div className="hotkey-manual-row">
                      <select
                        value={selectedSlot.action.method}
                        onChange={(e) =>
                          upsertSlot(selectedIndex, {
                            ...selectedSlot,
                            action: {
                              type: "webhook",
                              method: e.target.value,
                              url:
                                selectedSlot.action.type === "webhook"
                                  ? selectedSlot.action.url
                                  : "",
                              body:
                                selectedSlot.action.type === "webhook"
                                  ? selectedSlot.action.body
                                  : "",
                            },
                          })
                        }
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                      </select>
                      <input
                        style={{ flex: 2 }}
                        value={selectedSlot.action.url}
                        onChange={(e) =>
                          upsertSlot(selectedIndex, {
                            ...selectedSlot,
                            action: {
                              type: "webhook",
                              method:
                                selectedSlot.action.type === "webhook"
                                  ? selectedSlot.action.method
                                  : "GET",
                              url: e.target.value,
                              body:
                                selectedSlot.action.type === "webhook"
                                  ? selectedSlot.action.body
                                  : "",
                            },
                          })
                        }
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  {selectedSlot.action.method !== "GET" && (
                    <div className="form-group">
                      <label>JSON Body</label>
                      <textarea
                        rows={2}
                        value={selectedSlot.action.body}
                        onChange={(e) =>
                          upsertSlot(selectedIndex, {
                            ...selectedSlot,
                            action: {
                              type: "webhook",
                              method:
                                selectedSlot.action.type === "webhook"
                                  ? selectedSlot.action.method
                                  : "POST",
                              url:
                                selectedSlot.action.type === "webhook"
                                  ? selectedSlot.action.url
                                  : "",
                              body: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  )}
                </>
              )}

              {selectedSlot.action.type === "macro" && (
                <div className="form-group">
                  <label>宏步骤 ({selectedSlot.action.steps.length})</label>
                  <div className="macro-steps-list">
                    {selectedSlot.action.steps.map((step, sIdx) => (
                      <div key={sIdx} className="macro-step-card">
                        <div className="macro-step-head">
                          <span>步骤 {sIdx + 1}</span>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (selectedSlot.action.type !== "macro") return;
                              upsertSlot(selectedIndex, {
                                ...selectedSlot,
                                action: {
                                  type: "macro",
                                  steps: selectedSlot.action.steps.filter(
                                    (_, i) => i !== sIdx
                                  ),
                                },
                              });
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <select
                          className="select-input"
                          value={step.action.type}
                          onChange={(e) => {
                            if (selectedSlot.action.type !== "macro") return;
                            const nextType = e.target.value;
                            const defaultAct: SlotAction =
                              nextType === "hotkey"
                                ? { type: "hotkey", modifiers: ["cmd"], key: "c", repeatCount: 1 }
                                : nextType === "media"
                                ? { type: "media", control: "play_pause" }
                                : nextType === "url"
                                ? { type: "url", url: "https://google.com" }
                                : { type: "command", command: "echo step" };
                            const nextSteps = selectedSlot.action.steps.map((st, i) =>
                              i === sIdx ? { ...st, action: defaultAct } : st
                            );
                            upsertSlot(selectedIndex, {
                              ...selectedSlot,
                              action: { type: "macro", steps: nextSteps },
                            });
                          }}
                        >
                          <option value="hotkey">快捷键</option>
                          <option value="media">媒体控制</option>
                          <option value="url">打开网址</option>
                          <option value="command">Shell 命令</option>
                        </select>
                        {step.action.type === "hotkey" && (
                          <input
                            placeholder="按键，如 c 或 space"
                            value={step.action.key}
                            onChange={(e) => {
                              if (selectedSlot.action.type !== "macro") return;
                              const nextSteps = selectedSlot.action.steps.map((st, i) =>
                                i === sIdx && st.action.type === "hotkey"
                                  ? {
                                      ...st,
                                      action: { ...st.action, key: e.target.value },
                                    }
                                  : st
                              );
                              upsertSlot(selectedIndex, {
                                ...selectedSlot,
                                action: { type: "macro", steps: nextSteps },
                              });
                            }}
                          />
                        )}
                        {step.action.type === "command" && (
                          <input
                            placeholder="Shell 命令"
                            value={step.action.command}
                            onChange={(e) => {
                              if (selectedSlot.action.type !== "macro") return;
                              const nextSteps = selectedSlot.action.steps.map((st, i) =>
                                i === sIdx && st.action.type === "command"
                                  ? {
                                      ...st,
                                      action: { ...st.action, command: e.target.value },
                                    }
                                  : st
                              );
                              upsertSlot(selectedIndex, {
                                ...selectedSlot,
                                action: { type: "macro", steps: nextSteps },
                              });
                            }}
                          />
                        )}
                        {step.action.type === "url" && (
                          <input
                            placeholder="https://..."
                            value={step.action.url}
                            onChange={(e) => {
                              if (selectedSlot.action.type !== "macro") return;
                              const nextSteps = selectedSlot.action.steps.map((st, i) =>
                                i === sIdx && st.action.type === "url"
                                  ? {
                                      ...st,
                                      action: { ...st.action, url: e.target.value },
                                    }
                                  : st
                              );
                              upsertSlot(selectedIndex, {
                                ...selectedSlot,
                                action: { type: "macro", steps: nextSteps },
                              });
                            }}
                          />
                        )}
                        <div className="hotkey-manual-row">
                          <label>执行后延迟 (ms)</label>
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            value={step.delayMs}
                            onChange={(e) => {
                              if (selectedSlot.action.type !== "macro") return;
                              const nextSteps = selectedSlot.action.steps.map((st, i) =>
                                i === sIdx
                                  ? { ...st, delayMs: Number(e.target.value) || 0 }
                                  : st
                              );
                              upsertSlot(selectedIndex, {
                                ...selectedSlot,
                                action: { type: "macro", steps: nextSteps },
                              });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        if (selectedSlot.action.type !== "macro") return;
                        upsertSlot(selectedIndex, {
                          ...selectedSlot,
                          action: {
                            type: "macro",
                            steps: [
                              ...selectedSlot.action.steps,
                              {
                                action: { type: "command", command: "echo done" },
                                delayMs: 200,
                              },
                            ],
                          },
                        });
                      }}
                    >
                      <Plus size={14} /> 添加步骤
                    </button>
                  </div>
                </div>
              )}

              {selectedSlot.action.type === "url" && (
                <div className="form-group">
                  <label>目标网址</label>
                  <input
                    value={selectedSlot.action.url}
                    onChange={(e) =>
                      upsertSlot(selectedIndex, {
                        ...selectedSlot,
                        action: { type: "url", url: e.target.value },
                      })
                    }
                  />
                </div>
              )}

              {selectedSlot.action.type === "command" && (
                <div className="form-group">
                  <label>Shell 命令</label>
                  <textarea
                    rows={3}
                    value={selectedSlot.action.command}
                    onChange={(e) =>
                      upsertSlot(selectedIndex, {
                        ...selectedSlot,
                        action: { type: "command", command: e.target.value },
                      })
                    }
                  />
                </div>
              )}

              <div className="inspector-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => triggerSlotAction(selectedSlot.action)}
                >
                  <Play size={14} />
                  <span>测试触发</span>
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => clearSlot(selectedIndex)}
                >
                  <Trash2 size={14} />
                  <span>清空</span>
                </button>
              </div>
            </div>
          )}
        </aside>
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
    </div>
  );
}
