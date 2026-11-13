import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
} from "lucide-react";
import type { LocalAppInfo, MacroStep, SlotAction } from "../types";
import { ActionConfigFields, summarizeAction } from "./ActionConfigFields";

interface MacroStepsEditorProps {
  steps: MacroStep[];
  localApps: LocalAppInfo[];
  onChange: (steps: MacroStep[]) => void;
}

const DELAY_PRESETS = [0, 150, 300, 500, 1000] as const;

function createDefaultStepAction(
  type: string,
  localApps: LocalAppInfo[]
): SlotAction {
  switch (type) {
    case "app": {
      const first = localApps[0];
      return {
        type: "app",
        name: first?.name ?? "Safari",
        path: first?.path ?? "/Applications/Safari.app",
      };
    }
    case "media":
      return { type: "media", control: "play_pause" };
    case "webhook":
      return {
        type: "webhook",
        url: "https://example.com/hook",
        method: "POST",
        body: "{}",
      };
    case "url":
      return { type: "url", url: "https://google.com" };
    case "command":
      return { type: "command", command: "echo step" };
    case "text":
      return { type: "text", text: "", autoEnter: false };
    case "hotkey":
    default:
      return { type: "hotkey", modifiers: ["cmd"], key: "c", repeatCount: 1 };
  }
}

export function MacroStepsEditor({
  steps,
  localApps,
  onChange,
}: MacroStepsEditorProps) {
  const [collapsedMap, setCollapsedMap] = useState<Record<number, boolean>>({});

  const toggleCollapse = (idx: number) => {
    setCollapsedMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const moveStep = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const duplicateStep = (idx: number) => {
    const target = steps[idx];
    if (!target) return;
    const cloned: MacroStep = {
      delayMs: target.delayMs,
      action: JSON.parse(JSON.stringify(target.action)) as SlotAction,
    };
    const next = [...steps];
    next.splice(idx + 1, 0, cloned);
    onChange(next);
  };

  const removeStep = (idx: number) => {
    onChange(steps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, patch: Partial<MacroStep>) => {
    onChange(steps.map((st, i) => (i === idx ? { ...st, ...patch } : st)));
  };

  const addStep = () => {
    const nextIdx = steps.length;
    setCollapsedMap((prev) => ({ ...prev, [nextIdx]: false }));
    onChange([
      ...steps,
      {
        action: createDefaultStepAction("hotkey", localApps),
        delayMs: 150,
      },
    ]);
  };

  return (
    <div className="form-group">
      <label>宏步骤 ({steps.length})</label>
      <div className="macro-steps-list">
        {steps.map((step, sIdx) => {
          const isCollapsed = Boolean(collapsedMap[sIdx]);
          return (
            <div key={sIdx} className="macro-step-card">
              <div className="macro-step-head">
                <button
                  type="button"
                  className="macro-step-toggle"
                  onClick={() => toggleCollapse(sIdx)}
                  title={isCollapsed ? "展开步骤" : "折叠步骤"}
                >
                  {isCollapsed ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  <span className="macro-step-title">步骤 {sIdx + 1}</span>
                  <span className="macro-step-summary">
                    {summarizeAction(step.action)}
                    {step.delayMs > 0 ? ` · ${step.delayMs}ms` : ""}
                  </span>
                </button>
                <div className="macro-step-ops">
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => moveStep(sIdx, -1)}
                    disabled={sIdx === 0}
                    title="上移"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => moveStep(sIdx, 1)}
                    disabled={sIdx === steps.length - 1}
                    title="下移"
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => duplicateStep(sIdx)}
                    title="复制步骤"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-xs"
                    onClick={() => removeStep(sIdx)}
                    title="删除步骤"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {!isCollapsed && (
                <div className="macro-step-body">
                  <select
                    className="select-input"
                    value={step.action.type}
                    onChange={(e) =>
                      updateStep(sIdx, {
                        action: createDefaultStepAction(
                          e.target.value,
                          localApps
                        ),
                      })
                    }
                  >
                    <option value="hotkey">快捷键</option>
                    <option value="text">输入文本</option>
                    <option value="app">打开应用</option>
                    <option value="media">媒体控制</option>
                    <option value="webhook">Webhook</option>
                    <option value="url">打开网址</option>
                    <option value="command">Shell 命令</option>
                  </select>

                  <ActionConfigFields
                    action={step.action}
                    localApps={localApps}
                    compact
                    onChange={(nextAction) =>
                      updateStep(sIdx, { action: nextAction })
                    }
                  />

                  <div className="hotkey-manual-row">
                    <label>执行后延迟 (ms)</label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={50}
                      value={step.delayMs}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        updateStep(sIdx, {
                          delayMs: Number.isNaN(raw)
                            ? 0
                            : Math.min(10000, Math.max(0, raw)),
                        });
                      }}
                    />
                  </div>
                  <div className="delay-presets">
                    {DELAY_PRESETS.map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        className={`delay-pill ${
                          step.delayMs === ms ? "active" : ""
                        }`}
                        onClick={() => updateStep(sIdx, { delayMs: ms })}
                      >
                        {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={addStep}
        >
          <Plus size={14} /> 添加步骤
        </button>
      </div>
    </div>
  );
}
