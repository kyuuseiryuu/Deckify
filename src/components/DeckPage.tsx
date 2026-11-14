import { useEffect, useMemo, useRef, useState } from "react";
import {
  Wifi,
  WifiOff,
  Sun,
  Moon,
  BatteryCharging,
  Keyboard,
  Image as ImageIcon,
  Globe,
  Terminal,
  FolderOutput,
  LayoutGrid,
  Volume2,
  VolumeX,
  Webhook,
  Layers,
  Type,
} from "lucide-react";
import { getEmojiIcon } from "../api";
import type { DeckSlot, LayoutConfig, SystemStats, WsServerMsg } from "../types";
import { computeGridLayout } from "../utils/grid";
import { withRefreshTick } from "../utils/imageUrl";
import { useTheme } from "../utils/theme";
import { KeepAwakeControl } from "./KeepAwakeControl";
import { MonitorTile } from "./MonitorTile";
import { PairingPage } from "./PairingPage";

const SELECTED_LAYOUT_KEY = "smartdeck_selected_layout_id";
const PAIRING_CODE_KEY = "smartdeck_pairing_code";
const SOUND_ENABLED_KEY = "landeck_sound_enabled";

export function DeckPage() {
  const [theme, toggleTheme] = useTheme();
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem(SOUND_ENABLED_KEY) !== "false"
  );
  const [connected, setConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [layoutsList, setLayoutsList] = useState<LayoutConfig[]>([]);
  const [activeLayout, setActiveLayout] = useState<LayoutConfig | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [isCharging, setIsCharging] = useState(false);
  const [flashMap, setFlashMap] = useState<Record<string, "ok" | "err">>({});
  const [pressingMap, setPressingMap] = useState<Record<string, boolean>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const activeLayoutIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pressTimersRef = useRef<Record<string, number>>({});
  const toastTimerRef = useRef<number | null>(null);
  activeLayoutIdRef.current = activeLayout?.id ?? null;

  const showToast = (msg: string, durationMs = 2400) => {
    setToastMsg(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
    }, durationMs);
  };

  const [pairingCode, setPairingCode] = useState<string>(() => {
    return localStorage.getItem(PAIRING_CODE_KEY) ?? "";
  });
  const [paired, setPaired] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!pairingCode) return;

    let closed = false;
    let authFailed = false;
    let isPaired = false;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let verifyTimeout: number | undefined;

    const connect = () => {
      if (closed || authFailed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      if (verifyTimeout) clearTimeout(verifyTimeout);
      verifyTimeout = window.setTimeout(() => {
        if (!closed && !isPaired) {
          setVerifying(false);
        }
      }, 4000);

      const sendRegister = () => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          JSON.stringify({
            type: "register",
            code: pairingCode,
            selectedLayoutId: localStorage.getItem(SELECTED_LAYOUT_KEY),
          })
        );
      };

      ws.onopen = () => {
        setConnected(true);
        setErrorMsg(null);
        setAuthError(null);
        sendRegister();
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 15000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsServerMsg;
          if (msg.type === "authError") {
            authFailed = true;
            localStorage.removeItem(PAIRING_CODE_KEY);
            setPaired(false);
            setVerifying(false);
            setAuthError(msg.message);
            setPairingCode("");
            ws.close();
          } else if (msg.type === "layoutsList") {
            isPaired = true;
            if (verifyTimeout) clearTimeout(verifyTimeout);
            localStorage.setItem(PAIRING_CODE_KEY, pairingCode);
            setPaired(true);
            setVerifying(false);
            setAuthError(null);
            setLayoutsList(msg.layouts);
            const curId =
              activeLayoutIdRef.current ||
              localStorage.getItem(SELECTED_LAYOUT_KEY);
            if (curId) {
              const matched = msg.layouts.find((l) => l.id === curId);
              if (matched) {
                setActiveLayout(matched);
              }
            }
          } else if (msg.type === "layoutSync") {
            setActiveLayout(msg.layout);
            localStorage.setItem(SELECTED_LAYOUT_KEY, msg.layout.id);
            setShowPicker(false);
          } else if (msg.type === "systemStats") {
            setStats(msg.stats);
          } else if (msg.type === "actionResult") {
            setFlashMap((prev) => ({
              ...prev,
              [msg.slotId]: msg.ok ? "ok" : "err",
            }));
            if (!msg.ok && msg.error) {
              setToastMsg(msg.error);
              setTimeout(() => setToastMsg(null), 3500);
            }
            setTimeout(() => {
              setFlashMap((prev) => {
                const next = { ...prev };
                delete next[msg.slotId];
                return next;
              });
            }, 350);
          } else if (msg.type === "error") {
            setErrorMsg(msg.message);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!isPaired) {
          setVerifying(false);
        }
        if (pingTimer) clearInterval(pingTimer);
        if (verifyTimeout) clearTimeout(verifyTimeout);
        if (!closed && !authFailed) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        if (!authFailed) {
          setVerifying(false);
          setAuthError("连接失败，请确认与电脑在同一局域网");
          setErrorMsg("连接失败，请确认与电脑在同一局域网");
        }
      };
    };

    connect();

    const tickTimer = window.setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => {
      closed = true;
      clearInterval(tickTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (verifyTimeout) clearTimeout(verifyTimeout);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [pairingCode]);

  const handleSelectLayout = (layoutId: string) => {
    const found = layoutsList.find((l) => l.id === layoutId);
    if (found) {
      setActiveLayout(found);
      localStorage.setItem(SELECTED_LAYOUT_KEY, layoutId);
      setShowPicker(false);
    }
  };

  const playKeyClickSound = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      // Ignore Web Audio failures when blocked by browser autoplay policy
    }
  };

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(SOUND_ENABLED_KEY, String(next));
      return next;
    });
  };

  const handleTrigger = (slot: DeckSlot) => {
    if (!activeLayout) return;

    setPressingMap((prev) => ({ ...prev, [slot.id]: true }));
    if (pressTimersRef.current[slot.id]) {
      window.clearTimeout(pressTimersRef.current[slot.id]);
    }
    pressTimersRef.current[slot.id] = window.setTimeout(() => {
      setPressingMap((prev) => {
        const next = { ...prev };
        delete next[slot.id];
        return next;
      });
    }, 160);

    try {
      if ("vibrate" in navigator) {
        navigator.vibrate(15);
      }
    } catch {
      // Ignore vibration errors on unsupported browsers
    }

    if (soundEnabled) {
      playKeyClickSound();
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "trigger",
          layoutId: activeLayout.id,
          slotId: slot.id,
        })
      );
    }
  };

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    const preventTouchDrag = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest(".deck-picker, .deck-topbar, .modal-card, .deck-token-prompt")
      ) {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener("touchmove", preventTouchDrag, { passive: false });

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
      document.removeEventListener("touchmove", preventTouchDrag);
    };
  }, []);

  const cols = activeLayout?.cols ?? 3;
  const rows = activeLayout?.rows ?? 5;
  const totalSlots = cols * rows;
  const { occupied, originMap } = useMemo(
    () => computeGridLayout(cols, rows, activeLayout?.slots ?? []),
    [cols, rows, activeLayout?.slots]
  );

  const showingPicker = showPicker || !activeLayout;

  const handlePairSubmit = (code: string) => {
    setAuthError(null);
    setPaired(false);
    setVerifying(true);
    setPairingCode(code);
  };

  if (!pairingCode || !paired) {
    return (
      <PairingPage
        authError={authError}
        verifying={verifying}
        onSubmit={handlePairSubmit}
      />
    );
  }

  return (
    <div className="deck-page">
      <div className="deck-topbar">
        <div className="deck-status">
          {connected ? (
            <Wifi size={14} className="text-emerald" />
          ) : (
            <WifiOff size={14} className="text-rose" />
          )}
          <span>{activeLayout?.name || "选择布局配置"}</span>
          {isCharging && (
            <span className="charging-badge" title="充电中，保持屏幕常亮">
              <BatteryCharging size={14} />
            </span>
          )}
          {!connected && <span className="reconnecting">重连中...</span>}
        </div>
        <div className="deck-tools">
          <KeepAwakeControl
            onChargingChange={setIsCharging}
            onToast={(msg) => showToast(msg)}
          />
          <button
            className={`icon-btn ${showingPicker ? "active" : ""}`}
            onClick={() => setShowPicker((v) => !v)}
            title="切换布局配置"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            className={`icon-btn ${soundEnabled ? "active" : ""}`}
            onClick={toggleSound}
            title={soundEnabled ? "关闭点击音效" : "开启点击音效"}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "切换到明亮模式" : "切换到暗黑模式"}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {errorMsg && <div className="deck-banner-error">{errorMsg}</div>}

      {showingPicker ? (
        <div className="deck-picker">
          <h2 className="deck-picker-title">选择要使用的布局配置</h2>
          {layoutsList.length === 0 ? (
            <div className="deck-picker-empty">
              <LayoutGrid size={36} className="empty-icon" />
              <p>桌面端还没有创建配置</p>
              <span>请在电脑端点击「创建配置」，保存后这里会实时出现</span>
            </div>
          ) : (
            <div className="deck-picker-list">
              {layoutsList.map((l) => {
                const isSelected = activeLayout?.id === l.id;
                return (
                  <button
                    key={l.id}
                    className={`deck-picker-card ${isSelected ? "active" : ""}`}
                    onClick={() => handleSelectLayout(l.id)}
                  >
                    <div className="deck-picker-name">{l.name}</div>
                    <div className="deck-picker-meta">
                      <span>
                        {l.cols} × {l.rows}
                      </span>
                      <span>·</span>
                      <span>{l.width > l.height ? "横屏" : "竖屏"}</span>
                      <span>·</span>
                      <span>{l.slots.length} 个按钮</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div
          className="deck-grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: totalSlots }).map((_, idx) => {
            const placed = originMap.get(idx);
            if (!placed && occupied.has(idx)) {
              return null;
            }
            if (!placed) {
              const col = idx % cols;
              const row = Math.floor(idx / cols);
              return (
                <div
                  key={idx}
                  className="deck-slot empty"
                  style={{
                    gridColumn: `${col + 1} / span 1`,
                    gridRow: `${row + 1} / span 1`,
                  }}
                />
              );
            }
            const { slot, col, row, colSpan, rowSpan } = placed;
            const flash = flashMap[slot.id];
            const isImageTile = slot.action.type === "image";
            const isMonitorTile = slot.action.type === "monitor";
            const emojiIcon = getEmojiIcon(slot.icon);
            const refreshInterval =
              slot.action.type === "image" ? slot.action.refreshInterval : 0;
            const imgSrc = emojiIcon
              ? null
              : withRefreshTick(slot.icon ?? null, refreshInterval, nowSec);
            return (
              <button
                key={slot.id}
                className={`deck-slot filled ${isImageTile ? "is-image" : ""} ${
                  isMonitorTile ? "is-monitor" : ""
                } ${pressingMap[slot.id] ? "pressing" : ""} ${
                  flash ? `flash-${flash}` : ""
                }`}
                style={{
                  backgroundColor: slot.color || "#1e293b",
                  gridColumn: `${col + 1} / span ${colSpan}`,
                  gridRow: `${row + 1} / span ${rowSpan}`,
                }}
                onPointerDown={() => handleTrigger(slot)}
              >
                {isMonitorTile && slot.action.type === "monitor" ? (
                  <MonitorTile
                    metric={slot.action.metric}
                    stats={stats}
                    label={slot.label}
                  />
                ) : isImageTile && imgSrc ? (
                  <>
                    <img
                      src={imgSrc}
                      alt={slot.label}
                      className="slot-full-img"
                      draggable={false}
                    />
                    {slot.label && (
                      <span
                        className="slot-overlay-label"
                        style={
                          slot.fontSize ? { fontSize: `${slot.fontSize}px` } : undefined
                        }
                      >
                        {slot.label}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {emojiIcon ? (
                      <span
                        className="deck-slot-emoji"
                        aria-label={slot.label}
                      >
                        {emojiIcon}
                      </span>
                    ) : imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={slot.label}
                        className="deck-slot-img"
                        draggable={false}
                      />
                    ) : (
                      <div className="deck-slot-fallback-icon">
                        {slot.action.type === "hotkey" && <Keyboard size={24} />}
                        {slot.action.type === "text" && <Type size={24} />}
                        {slot.action.type === "image" && <ImageIcon size={24} />}
                        {slot.action.type === "switchLayout" && (
                          <FolderOutput size={24} />
                        )}
                        {slot.action.type === "media" && <Volume2 size={24} />}
                        {slot.action.type === "webhook" && <Webhook size={24} />}
                        {slot.action.type === "macro" && <Layers size={24} />}
                        {slot.action.type === "url" && <Globe size={24} />}
                        {slot.action.type === "command" && <Terminal size={24} />}
                      </div>
                    )}
                    {slot.label && (
                      <span
                        className="deck-slot-label"
                        style={
                          slot.fontSize ? { fontSize: `${slot.fontSize}px` } : undefined
                        }
                      >
                        {slot.label}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {toastMsg && <div className="deck-toast">{toastMsg}</div>}
    </div>
  );
}
