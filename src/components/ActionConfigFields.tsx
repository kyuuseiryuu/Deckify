import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { LocalAppInfo, SlotAction } from "../types";

export const MODIFIER_OPTIONS = [
  { id: "cmd", label: "⌘ Cmd", symbol: "⌘" },
  { id: "ctrl", label: "⌃ Ctrl", symbol: "⌃" },
  { id: "alt", label: "⌥ Alt", symbol: "⌥" },
  { id: "shift", label: "⇧ Shift", symbol: "⇧" },
] as const;

export const MAIN_KEY_OPTIONS = [
  "`",
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "space", "enter", "tab", "escape", "backspace", "delete",
  "up", "down", "left", "right",
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
] as const;

export const MEDIA_OPTIONS: Array<{
  value: "play_pause" | "next" | "prev" | "vol_up" | "vol_down" | "mute";
  label: string;
  shortLabel: string;
}> = [
  { value: "play_pause", label: "播放 / 暂停", shortLabel: "播放/暂停" },
  { value: "next", label: "下一曲", shortLabel: "下一曲" },
  { value: "prev", label: "上一曲", shortLabel: "上一曲" },
  { value: "vol_up", label: "音量增大", shortLabel: "音量 +" },
  { value: "vol_down", label: "音量减小", shortLabel: "音量 -" },
  { value: "mute", label: "静音切换", shortLabel: "静音" },
];

export function formatHotkeySummary(
  modifiers: string[],
  key: string,
  repeatCount?: number
): string {
  const parts = [...modifiers, key].filter(Boolean).map((p) => p.toUpperCase());
  const base = parts.length > 0 ? parts.join(" + ") : "未设置";
  const count = repeatCount ?? 1;
  return count > 1 ? `${base} ×${count}` : base;
}

export function summarizeAction(action: SlotAction): string {
  switch (action.type) {
    case "hotkey":
      return formatHotkeySummary(
        action.modifiers,
        action.key,
        action.repeatCount
      );
    case "text": {
      const preview = action.text.replace(/\s+/g, " ").trim();
      const snippet =
        preview.length > 14 ? `${preview.slice(0, 14)}…` : preview || "空文本";
      return action.autoEnter ? `输入: ${snippet} ↵` : `输入: ${snippet}`;
    }
    case "app":
      return action.name ? `打开 ${action.name}` : action.path || "打开应用";
    case "media":
      return (
        MEDIA_OPTIONS.find((m) => m.value === action.control)?.shortLabel ??
        action.control
      );
    case "webhook":
      return `${action.method} ${action.url || "Webhook"}`;
    case "url":
      return action.url || "打开网址";
    case "command":
      return action.command.trim() || "Shell 命令";
    default:
      return action.type;
  }
}

interface ActionConfigFieldsProps {
  action: SlotAction;
  onChange: (next: SlotAction, suggestedLabel?: string) => void;
  localApps?: LocalAppInfo[];
  compact?: boolean;
}

export function ActionConfigFields({
  action,
  onChange,
  localApps = [],
  compact = false,
}: ActionConfigFieldsProps) {
  const [recordingKey, setRecordingKey] = useState(false);

  useEffect(() => {
    if (!recordingKey || action.type !== "hotkey") return;
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
      onChange({
        type: "hotkey",
        modifiers,
        key: normalizedKey,
        repeatCount: action.repeatCount ?? 1,
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
  }, [recordingKey, action, onChange]);

  if (action.type === "app") {
    return (
      <div className="form-group">
        {!compact && <label>启动应用</label>}
        {localApps.length > 0 && (
          <select
            className="select-input"
            value={
              localApps.some((a) => a.path === action.path) ? action.path : ""
            }
            onChange={(e) => {
              const found = localApps.find((a) => a.path === e.target.value);
              if (found) {
                onChange(
                  { type: "app", name: found.name, path: found.path },
                  found.name
                );
              }
            }}
          >
            <option value="">选择本机应用...</option>
            {localApps.map((app) => (
              <option key={app.path} value={app.path}>
                {app.name}
              </option>
            ))}
          </select>
        )}
        <input
          value={action.path}
          onChange={(e) => {
            const path = e.target.value;
            const inferredName =
              path.split("/").pop()?.replace(/\.app$/i, "") || action.name;
            onChange({ type: "app", name: inferredName, path });
          }}
          placeholder="/Applications/Safari.app"
        />
      </div>
    );
  }

  if (action.type === "hotkey") {
    return (
      <div className="form-group">
        {!compact && <label>快捷键组合</label>}
        <button
          type="button"
          className={`record-key-btn ${recordingKey ? "recording" : ""}`}
          onClick={() => setRecordingKey((v) => !v)}
        >
          {recordingKey
            ? "请按下组合键（或下方手动选择）..."
            : formatHotkeySummary(
                action.modifiers,
                action.key,
                action.repeatCount
              )}
        </button>

        <div className="modifier-pills">
          {MODIFIER_OPTIONS.map((mod) => {
            const active = action.modifiers.includes(mod.id);
            return (
              <button
                key={mod.id}
                type="button"
                className={`mod-pill ${active ? "active" : ""}`}
                onClick={() => {
                  const nextMods = active
                    ? action.modifiers.filter((m) => m !== mod.id)
                    : [...action.modifiers, mod.id];
                  onChange({
                    type: "hotkey",
                    modifiers: nextMods,
                    key: action.key,
                    repeatCount: action.repeatCount ?? 1,
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
            value={action.key || "none"}
            onChange={(e) =>
              onChange({
                type: "hotkey",
                modifiers: action.modifiers,
                key: e.target.value === "none" ? "" : e.target.value,
                repeatCount: action.repeatCount ?? 1,
              })
            }
          >
            <option value="none">无主键（仅修饰键）</option>
            {MAIN_KEY_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="hotkey-manual-row">
          <label>连续触发（次）</label>
          <input
            type="number"
            min={1}
            step={1}
            value={action.repeatCount ?? 1}
            onChange={(e) => {
              const raw = parseInt(e.target.value, 10);
              const nextCount = Number.isNaN(raw) ? 1 : Math.max(1, raw);
              onChange({
                type: "hotkey",
                modifiers: action.modifiers,
                key: action.key,
                repeatCount: nextCount,
              });
            }}
          />
        </div>

        {!compact && (
          <span className="hint-text">
            系统保留快捷键（如 Cmd+W / Cmd+Space / Cmd+Tab）请直接使用上方修饰键与主键选择器配置
          </span>
        )}
      </div>
    );
  }

  if (action.type === "text") {
    return (
      <div className="form-group">
        {!compact && <label>快捷输入文本</label>}
        <textarea
          rows={compact ? 2 : 3}
          value={action.text}
          onChange={(e) =>
            onChange({
              type: "text",
              text: e.target.value,
              autoEnter: action.autoEnter,
            })
          }
          placeholder="输入要自动键入的文本内容（支持多行/中英文）..."
        />
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={Boolean(action.autoEnter)}
            onChange={(e) =>
              onChange({
                type: "text",
                text: action.text,
                autoEnter: e.target.checked,
              })
            }
          />
          <span>输入后自动按下回车（Enter）</span>
        </label>
      </div>
    );
  }

  if (action.type === "media") {
    return (
      <div className="form-group">
        {!compact && <label>媒体控制动作</label>}
        <select
          className="select-input"
          value={action.control}
          onChange={(e) => {
            const control = e.target.value as
              | "play_pause"
              | "next"
              | "prev"
              | "vol_up"
              | "vol_down"
              | "mute";
            const opt = MEDIA_OPTIONS.find((m) => m.value === control);
            onChange({ type: "media", control }, opt?.shortLabel);
          }}
        >
          {MEDIA_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (action.type === "webhook") {
    const headers = action.headers ?? [];
    const updateWebhook = (patch: Partial<typeof action>) =>
      onChange({
        type: "webhook",
        method: patch.method ?? action.method,
        url: patch.url ?? action.url,
        headers: patch.headers ?? headers,
        body: patch.body ?? action.body,
      });

    return (
      <>
        <div className="form-group">
          {!compact && <label>请求方法 & URL</label>}
          <div className="hotkey-manual-row">
            <select
              value={action.method}
              onChange={(e) => updateWebhook({ method: e.target.value })}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
            </select>
            <input
              style={{ flex: 2 }}
              value={action.url}
              onChange={(e) => updateWebhook({ url: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="form-group">
          <label>请求头 (Headers)</label>
          <div className="webhook-headers-list">
            {headers.map((h, idx) => (
              <div key={idx} className="webhook-header-row">
                <input
                  value={h.key}
                  onChange={(e) =>
                    updateWebhook({
                      headers: headers.map((item, i) =>
                        i === idx ? { ...item, key: e.target.value } : item
                      ),
                    })
                  }
                  placeholder="Key (如 Authorization)"
                />
                <input
                  value={h.value}
                  onChange={(e) =>
                    updateWebhook({
                      headers: headers.map((item, i) =>
                        i === idx ? { ...item, value: e.target.value } : item
                      ),
                    })
                  }
                  placeholder="Value"
                />
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  onClick={() =>
                    updateWebhook({
                      headers: headers.filter((_, i) => i !== idx),
                    })
                  }
                  title="删除 Header"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() =>
                updateWebhook({ headers: [...headers, { key: "", value: "" }] })
              }
            >
              <Plus size={12} />
              <span>添加 Header</span>
            </button>
          </div>
        </div>

        {action.method !== "GET" && (
          <div className="form-group">
            {!compact && <label>JSON Body</label>}
            <textarea
              className="webhook-body-textarea"
              rows={3}
              value={action.body}
              onChange={(e) => updateWebhook({ body: e.target.value })}
              placeholder='{"event":"smartdeck"}'
            />
          </div>
        )}
      </>
    );
  }

  if (action.type === "url") {
    return (
      <div className="form-group">
        {!compact && <label>目标网址</label>}
        <input
          value={action.url}
          onChange={(e) => onChange({ type: "url", url: e.target.value })}
          placeholder="https://..."
        />
      </div>
    );
  }

  if (action.type === "command") {
    return (
      <div className="form-group">
        {!compact && <label>Shell 命令</label>}
        <textarea
          rows={compact ? 2 : 3}
          value={action.command}
          onChange={(e) =>
            onChange({ type: "command", command: e.target.value })
          }
          placeholder="echo hello"
        />
      </div>
    );
  }

  return null;
}
