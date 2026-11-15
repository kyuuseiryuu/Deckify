import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Play,
  SkipForward,
  SkipBack,
  Volume1,
  Volume2,
  VolumeX,
  Cpu,
  HardDrive,
  ArrowDownUp,
} from "lucide-react";
import { listAudioDevices } from "../api";
import type { AudioDeviceInfo, AudioOutputMode, LocalAppInfo, SlotAction } from "../types";
import { CustomSelect, type CustomSelectOption } from "./CustomSelect";
import { getAudioDeviceIcon, getCleanAudioDeviceName } from "../utils/audio";

export const isWindowsHost = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /win/i.test(navigator.userAgent || navigator.platform);
};

export const MODIFIER_OPTIONS_MAC = [
  { id: "cmd", label: "⌘ Cmd", symbol: "⌘" },
  { id: "ctrl", label: "⌃ Ctrl", symbol: "⌃" },
  { id: "alt", label: "⌥ Alt", symbol: "⌥" },
  { id: "shift", label: "⇧ Shift", symbol: "⇧" },
] as const;

export const MODIFIER_OPTIONS_WIN = [
  { id: "ctrl", label: "Ctrl", symbol: "Ctrl" },
  { id: "alt", label: "Alt", symbol: "Alt" },
  { id: "shift", label: "Shift", symbol: "Shift" },
  { id: "cmd", label: "⊞ Win", symbol: "Win" },
] as const;

export const MODIFIER_OPTIONS = isWindowsHost()
  ? MODIFIER_OPTIONS_WIN
  : MODIFIER_OPTIONS_MAC;

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
  const isWin = isWindowsHost();
  const formatMod = (m: string) => {
    const lower = m.toLowerCase();
    if (lower === "cmd" || lower === "meta" || lower === "win") {
      return isWin ? "WIN" : "CMD";
    }
    return m.toUpperCase();
  };
  const parts = [
    ...modifiers.map(formatMod),
    key ? key.toUpperCase() : "",
  ].filter(Boolean);
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
    case "monitor": {
      const metricLabels = {
        cpu: "CPU",
        memory: "内存",
        network: "网络",
      } as const;
      return `系统状态: ${metricLabels[action.metric] ?? action.metric}`;
    }
    case "audioOutput": {
      switch (action.mode) {
        case "direct":
          return "音源: 指定设备";
        case "flyout":
          return "音源: 弹浮层选择";
        case "cycle":
          return "音源: 单击轮换";
        case "hybrid":
        default:
          return "音源: 单击轮换/长按浮层";
      }
    }
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
      const isWin = isWindowsHost();
      if (isWin) {
        if (e.ctrlKey) modifiers.push("ctrl");
        if (e.altKey) modifiers.push("alt");
        if (e.shiftKey) modifiers.push("shift");
        if (e.metaKey) modifiers.push("cmd");
      } else {
        if (e.metaKey) modifiers.push("cmd");
        if (e.ctrlKey) modifiers.push("ctrl");
        if (e.altKey) modifiers.push("alt");
        if (e.shiftKey) modifiers.push("shift");
      }

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
    const appOptions: CustomSelectOption[] = [
      { value: "", label: "选择本机应用..." },
      ...localApps.map((app) => ({
        value: app.path,
        label: app.name,
        hint: app.path,
        icon: <Play size={14} />,
      })),
    ];

    return (
      <div className="form-group">
        {!compact && <label>启动应用</label>}
        {localApps.length > 0 && (
          <CustomSelect
            value={
              localApps.some((a) => a.path === action.path) ? action.path : ""
            }
            options={appOptions}
            placeholder="选择本机应用..."
            searchable
            onChange={(val) => {
              const found = localApps.find((a) => a.path === val);
              if (found) {
                onChange(
                  { type: "app", name: found.name, path: found.path },
                  found.name
                );
              }
            }}
          />
        )}
        <input
          value={action.path}
          onChange={(e) => {
            const path = e.target.value;
            const inferredName =
              path.split(/[/\\]/).pop()?.replace(/\.(app|lnk|exe)$/i, "") || action.name;
            onChange({ type: "app", name: inferredName, path });
          }}
          placeholder={
            isWindowsHost()
              ? "应用绝对路径，如 C:\\..."
              : "/Applications/Safari.app"
          }
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
            {isWindowsHost()
              ? "系统保留快捷键（如 Win+D / Ctrl+Shift+Esc / Alt+Tab）请直接使用上方修饰键与主键选择器配置"
              : "系统保留快捷键（如 Cmd+W / Cmd+Space / Cmd+Tab）请直接使用上方修饰键与主键选择器配置"}
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
          placeholder="输入自动键入的文本..."
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
    const mediaSelectOptions: CustomSelectOption[] = [
      { value: "play_pause", label: "播放 / 暂停", icon: <Play size={14} /> },
      { value: "next", label: "下一曲", icon: <SkipForward size={14} /> },
      { value: "prev", label: "上一曲", icon: <SkipBack size={14} /> },
      { value: "vol_up", label: "音量增大", icon: <Volume2 size={14} /> },
      { value: "vol_down", label: "音量减小", icon: <Volume1 size={14} /> },
      { value: "mute", label: "静音切换", icon: <VolumeX size={14} /> },
    ];

    return (
      <div className="form-group">
        {!compact && <label>媒体控制动作</label>}
        <CustomSelect
          value={action.control}
          options={mediaSelectOptions}
          onChange={(val) => {
            const control = val as
              | "play_pause"
              | "next"
              | "prev"
              | "vol_up"
              | "vol_down"
              | "mute";
            const opt = MEDIA_OPTIONS.find((m) => m.value === control);
            onChange({ type: "media", control }, opt?.shortLabel);
          }}
        />
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
          placeholder="输入终端命令，如: calc 或 notepad"
        />
      </div>
    );
  }

  if (action.type === "monitor") {
    const metricDefaultLabels: Record<"cpu" | "memory" | "network", string> = {
      cpu: "CPU",
      memory: "内存",
      network: "网络",
    };
    return (
      <div className="form-group">
        {!compact && <label>监控指标</label>}
        <CustomSelect
          value={action.metric}
          options={[
            { value: "cpu", label: "CPU 占用率", icon: <Cpu size={14} /> },
            { value: "memory", label: "内存占用率", icon: <HardDrive size={14} /> },
            { value: "network", label: "网络速率", icon: <ArrowDownUp size={14} /> },
          ]}
          onChange={(val) => {
            const metric = val as "cpu" | "memory" | "network";
            onChange({ type: "monitor", metric }, metricDefaultLabels[metric]);
          }}
        />
      </div>
    );
  }

  if (action.type === "audioOutput") {
    return (
      <AudioOutputConfig
        action={action}
        onChange={onChange}
        compact={compact}
      />
    );
  }

  return null;
}

const AUDIO_MODE_OPTIONS: CustomSelectOption[] = [
  {
    value: "hybrid",
    label: "混合模式",
    badge: "推荐",
    hint: "轻按快速轮换，长按弹出设备浮层",
  },
  {
    value: "flyout",
    label: "浮层选择",
    hint: "轻按弹出完整音源列表浮层",
  },
  {
    value: "cycle",
    label: "循环切换",
    hint: "轻按在可用设备间轮流切换",
  },
  {
    value: "direct",
    label: "指定设备",
    hint: "轻按直接切换到特定输出设备",
  },
];

function AudioOutputConfig({
  action,
  onChange,
  compact,
}: {
  action: Extract<SlotAction, { type: "audioOutput" }>;
  onChange: (next: SlotAction, suggestedLabel?: string) => void;
  compact?: boolean;
}) {
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDevices = () => {
    setLoading(true);
    listAudioDevices()
      .then((res) => setDevices(res))
      .catch((err) => console.error("Failed to list audio devices", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const deviceOptions: CustomSelectOption[] = [
    { value: "", label: "-- 请选择目标设备 --" },
    ...devices.map((d) => ({
      value: d.id,
      label: d.name,
      icon: getAudioDeviceIcon(d.name, 16),
      badge: d.isDefault ? "默认" : undefined,
    })),
  ];

  return (
    <>
      <div className="form-group">
        {!compact && <label>交互模式</label>}
        <CustomSelect
          value={action.mode || "hybrid"}
          options={AUDIO_MODE_OPTIONS}
          onChange={(val) => {
            onChange({
              ...action,
              mode: val as AudioOutputMode,
            });
          }}
        />
        <span className="field-hint" style={{ marginTop: 4, display: "block", fontSize: 12, opacity: 0.8 }}>
          {action.mode === "hybrid" && "在移动端：轻按瞬间在常用设备间切换；长按400ms呼出完整音源弹层。"}
          {action.mode === "flyout" && "在移动端：轻按直接弹出当前连接的所有音频源列表供精准选择。"}
          {action.mode === "cycle" && "在移动端：轻按直接轮流切换到下一个音频输出设备。"}
          {action.mode === "direct" && "在移动端：轻按直接切换到预设的特定设备，当前设备激活时高亮。"}
        </span>
      </div>

      {action.mode === "direct" && (
        <div className="form-group">
          <div className="audio-header-row">
            {!compact && <label className="audio-section-label">目标输出设备</label>}
            <button
              type="button"
              className="btn-link-action"
              onClick={fetchDevices}
              disabled={loading}
              title="刷新设备列表"
            >
              <RefreshCw size={12} className={loading ? "spin" : ""} />
              <span>刷新</span>
            </button>
          </div>
          <CustomSelect
            value={action.targetDeviceId || ""}
            options={deviceOptions}
            placeholder="-- 请选择目标设备 --"
            onChange={(devId) => {
              const found = devices.find((d) => d.id === devId);
              const shortName = found ? getCleanAudioDeviceName(found.name) : undefined;
              onChange(
                { ...action, targetDeviceId: devId },
                shortName || undefined
              );
            }}
          />
        </div>
      )}

      {(action.mode === "cycle" || action.mode === "hybrid") && (
        <div className="form-group">
          <div className="audio-header-row">
            <div className="audio-header-left">
              <label className="audio-section-label">参与轮换的设备</label>
              <span className="audio-section-hint">未勾选时默认轮换全部可用设备</span>
            </div>
            <button
              type="button"
              className="btn-link-action"
              onClick={fetchDevices}
              disabled={loading}
              title="刷新设备列表"
            >
              <RefreshCw size={12} className={loading ? "spin" : ""} />
              <span>刷新</span>
            </button>
          </div>
          <div className="audio-whitelist-box">
            {devices.length === 0 ? (
              <span style={{ fontSize: 12, opacity: 0.6, padding: "8px 4px" }}>
                {loading ? "正在获取系统音频设备..." : "未检测到可用音频设备"}
              </span>
            ) : (
              devices.map((d) => {
                const isChecked = action.whitelistDeviceIds?.includes(d.id) ?? false;
                return (
                  <label key={d.id} className="audio-whitelist-item">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const current = action.whitelistDeviceIds || [];
                        const nextList = e.target.checked
                          ? [...current, d.id]
                          : current.filter((id) => id !== d.id);
                        onChange({
                          ...action,
                          whitelistDeviceIds: nextList,
                        });
                      }}
                    />
                    <span className="audio-whitelist-item-icon">
                      {getAudioDeviceIcon(d.name, 15)}
                    </span>
                    <span className="audio-whitelist-item-name" title={d.name}>
                      {d.name}
                    </span>
                    {d.isDefault && (
                      <span className="audio-whitelist-badge-default">
                        默认
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
