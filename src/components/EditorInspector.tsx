import {
  Globe,
  Image as ImageIcon,
  Keyboard,
  Play,
  Terminal,
  Trash2,
} from "lucide-react";
import { triggerSlotAction } from "../api";
import { COLOR_SWATCHES, IMAGE_REFRESH_OPTIONS } from "../constants/editor";
import type { DeckSlot, LayoutConfig, LocalAppInfo } from "../types";
import { canPlaceSpan } from "../utils/grid";
import { ActionConfigFields } from "./ActionConfigFields";
import type { TemplateKind } from "./EditorPalette";
import { MacroStepsEditor } from "./MacroStepsEditor";
import { SlotIconPicker } from "./SlotIconPicker";

interface EditorInspectorProps {
  selectedIndex: number;
  selectedSlot: DeckSlot | null;
  draft: LayoutConfig;
  allLayouts: LayoutConfig[];
  apps: LocalAppInfo[];
  onCreateTemplate: (kind: TemplateKind, targetIndex?: number) => void;
  onUpsertSlot: (index: number, slot: DeckSlot) => void;
  onClearSlot: (index: number) => void;
}

export function EditorInspector({
  selectedIndex,
  selectedSlot,
  draft,
  allLayouts,
  apps,
  onCreateTemplate,
  onUpsertSlot,
  onClearSlot,
}: EditorInspectorProps) {
  return (
    <aside className="editor-inspector">
      <h3 className="inspector-title">槽位属性 #{selectedIndex + 1}</h3>

      {!selectedSlot ? (
        <div className="inspector-empty">
          <p>当前槽位为空</p>
          <span>从左侧点击或拖拽应用，或快速创建一个功能按钮：</span>
          <div className="quick-create-grid">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onCreateTemplate("hotkey", selectedIndex)}
            >
              <Keyboard size={14} /> 快捷键
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onCreateTemplate("image", selectedIndex)}
            >
              <ImageIcon size={14} /> 图片
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onCreateTemplate("url", selectedIndex)}
            >
              <Globe size={14} /> 网页
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onCreateTemplate("command", selectedIndex)}
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
                onUpsertSlot(selectedIndex, {
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
                onUpsertSlot(selectedIndex, {
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
                    onUpsertSlot(selectedIndex, { ...selectedSlot, color: c })
                  }
                />
              ))}
              <input
                type="color"
                value={selectedSlot.color || "#1e293b"}
                onChange={(e) =>
                  onUpsertSlot(selectedIndex, {
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
                    onUpsertSlot(selectedIndex, {
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
                    onUpsertSlot(selectedIndex, {
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
                    onUpsertSlot(selectedIndex, {
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
                    onUpsertSlot(selectedIndex, {
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

          <SlotIconPicker
            selectedIndex={selectedIndex}
            icon={selectedSlot.icon}
            onChangeIcon={(nextIcon) =>
              onUpsertSlot(selectedIndex, {
                ...selectedSlot,
                icon: nextIcon,
              })
            }
          />

          <ActionConfigFields
            action={selectedSlot.action}
            localApps={apps}
            onChange={(nextAction, suggestedLabel) =>
              onUpsertSlot(selectedIndex, {
                ...selectedSlot,
                label: suggestedLabel ?? selectedSlot.label,
                action: nextAction,
              })
            }
          />

          {selectedSlot.action.type === "image" && (
            <>
              <div className="form-group">
                <label>网络图片 URL（可选，支持动态图）</label>
                <input
                  placeholder="https://example.com/image.png"
                  value={selectedSlot.icon ?? ""}
                  onChange={(e) =>
                    onUpsertSlot(selectedIndex, {
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
                    onUpsertSlot(selectedIndex, {
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
                  {IMAGE_REFRESH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
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
                  onUpsertSlot(selectedIndex, {
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

          {selectedSlot.action.type === "macro" && (
            <MacroStepsEditor
              steps={selectedSlot.action.steps}
              localApps={apps}
              onChange={(nextSteps) =>
                onUpsertSlot(selectedIndex, {
                  ...selectedSlot,
                  action: { type: "macro", steps: nextSteps },
                })
              }
            />
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
              onClick={() => onClearSlot(selectedIndex)}
            >
              <Trash2 size={14} />
              <span>清空</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
