import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy,
  Check,
  Trash2,
  Edit3,
  ExternalLink,
  Sun,
  Moon,
  Plus,
  LayoutGrid,
  ShieldAlert,
  KeyRound,
  Network,
  Download,
  Upload,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
} from "lucide-react";
import {
  checkAccessibilityPermission,
  openAccessibilitySettings,
  openExternalUrl,
} from "../api";
import type { LayoutConfig, ServerInfo } from "../types";
import type { ThemeMode } from "../utils/theme";
import { ConfigTransferModal } from "./ConfigTransferModal";

interface HomePageProps {
  serverInfo: ServerInfo | null;
  layouts: LayoutConfig[];
  onlineCount: number;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onCreateLayout: () => void;
  onSelectLayout: (layout: LayoutConfig) => void;
  onDuplicateLayout: (layout: LayoutConfig) => void;
  onDeleteLayout: (layoutId: string) => void;
  onImportLayouts: (layouts: LayoutConfig[]) => Promise<void>;
  generateId: () => string;
  onUpdatePairingCode: (code: string) => Promise<void>;
  onUpdateLanIp: (ip: string) => Promise<void>;
  onToggleHideDockIcon: (hide: boolean) => Promise<void>;
  onToggleHttps: (enabled: boolean) => Promise<void>;
}

function formatLastSeen(ts: number): string {
  if (!ts) return "从未连接";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return new Date(ts * 1000).toLocaleDateString();
}

export function HomePage({
  serverInfo,
  layouts,
  onlineCount,
  theme,
  onToggleTheme,
  onCreateLayout,
  onSelectLayout,
  onDuplicateLayout,
  onDeleteLayout,
  onImportLayouts,
  generateId,
  onUpdatePairingCode,
  onUpdateLanIp,
  onToggleHideDockIcon,
  onToggleHttps,
}: HomePageProps) {
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeSaved, setCodeSaved] = useState(false);
  const [accessibilityOk, setAccessibilityOk] = useState(true);
  const [httpsBusy, setHttpsBusy] = useState(false);
  const [httpsError, setHttpsError] = useState<string | null>(null);
  const [transferModal, setTransferModal] = useState<
    | null
    | { mode: "import" }
    | { mode: "export"; layouts: LayoutConfig[] }
  >(null);

  useEffect(() => {
    if (serverInfo?.pairingCode) {
      setCodeInput(serverInfo.pairingCode);
    }
  }, [serverInfo?.pairingCode]);

  const refreshAccessibility = () => {
    checkAccessibilityPermission(false)
      .then(setAccessibilityOk)
      .catch(() => {});
  };

  useEffect(() => {
    refreshAccessibility();
    window.addEventListener("focus", refreshAccessibility);
    return () => window.removeEventListener("focus", refreshAccessibility);
  }, []);

  const handleCopy = async () => {
    if (!serverInfo) return;
    await navigator.clipboard.writeText(serverInfo.mobileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSaveCode = async () => {
    const trimmed = codeInput.trim();
    if (!trimmed) return;
    await onUpdatePairingCode(trimmed);
    setCodeSaved(true);
    setTimeout(() => setCodeSaved(false), 1800);
  };

  return (
    <div className="home-container">
      <header className="home-header">
        <div>
          <h1 className="app-title">LanDeck</h1>
          <p className="app-subtitle">
            在桌面端创建与编辑布局配置，移动端扫码后可自由选择并实时同步切换
          </p>
        </div>
        <div className="home-header-actions">
          {serverInfo?.platform === "macos" && (
            <button
              className={`btn btn-sm ${
                serverInfo.hideDockIcon ? "btn-primary" : "btn-secondary"
              }`}
              onClick={() => onToggleHideDockIcon(!serverInfo.hideDockIcon)}
              title="开启后将隐藏 macOS Dock 栏图标，仅保留顶部菜单栏托盘图标"
            >
              {serverInfo.hideDockIcon ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>
                {serverInfo.hideDockIcon ? "已隐藏 Dock 图标" : "隐藏 Dock 图标"}
              </span>
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={onToggleTheme}
            title={theme === "dark" ? "切换到明亮模式" : "切换到暗黑模式"}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            <span>{theme === "dark" ? "明亮" : "暗黑"}</span>
          </button>
          {serverInfo && (
            <div className="server-badge">
              <span className="dot-online" />
              <span>
                服务运行中 · {serverInfo.lanIp}:
                {serverInfo.httpsEnabled && serverInfo.httpsPort
                  ? `${serverInfo.httpsPort} (HTTPS)`
                  : serverInfo.port}{" "}
                · 在线 {onlineCount}
              </span>
            </div>
          )}
        </div>
      </header>

      {!accessibilityOk && (
        <div className="accessibility-banner">
          <div className="accessibility-banner-text">
            <ShieldAlert size={18} />
            <div>
              <strong>未检测到 macOS 辅助功能权限</strong>
              <p>
                快捷键与媒体控制（播放/暂停、切歌）需要辅助功能权限。请在「系统设置 → 隐私与安全性 → 辅助功能」中开启 LanDeck（若重新打包过，请先用「-」移除旧的 LanDeck 再重新添加或开关）。
              </p>
            </div>
          </div>
          <div className="accessibility-banner-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => openAccessibilitySettings()}
            >
              打开辅助功能设置
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={refreshAccessibility}
            >
              重新检测
            </button>
          </div>
        </div>
      )}

      <div className="home-grid">
        <section className="card qr-card">
          <div className="card-header-row">
            <h2 className="card-title">扫码连接移动设备</h2>
          </div>
          <p className="card-desc">
            确保手机与电脑处于同一局域网，扫码后即可在手机上选择要使用的布局配置：
          </p>

          {serverInfo?.availableIps && serverInfo.availableIps.length > 1 && (
            <div className="ip-selector-bar">
              <span className="ip-selector-label">当前网卡 IP：</span>
              <div
                className="ip-selector-wrap"
                title="检测到多个网卡，点击可切换用于生成连接二维码与移动端访问的 IP"
              >
                <Network size={13} />
                <select
                  className="ip-select"
                  value={serverInfo.lanIp}
                  onChange={(e) => onUpdateLanIp(e.target.value)}
                >
                  {serverInfo.availableIps.map((ifa) => (
                    <option key={ifa.ip} value={ifa.ip}>
                      {ifa.name}: {ifa.ip}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="qr-box">
            {serverInfo ? (
              <QRCodeSVG
                value={serverInfo.mobileUrl}
                size={196}
                bgColor="#ffffff"
                fgColor="#0f172a"
                level="M"
              />
            ) : (
              <div className="qr-loading">正在启动服务...</div>
            )}
          </div>

          {serverInfo && (
            <>
              <div className="url-row">
                <code className="url-text">{serverInfo.mobileUrl}</code>
                <button className="btn btn-secondary" onClick={handleCopy}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copied ? "已复制" : "复制"}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const previewUrl =
                      serverInfo.httpsEnabled && serverInfo.httpsPort
                        ? `https://127.0.0.1:${serverInfo.httpsPort}/deck`
                        : `http://127.0.0.1:${serverInfo.port}/deck`;
                    openExternalUrl(previewUrl);
                  }}
                  title="在本机浏览器模拟移动端"
                >
                  <ExternalLink size={15} />
                  <span>本机预览</span>
                </button>
              </div>

              <div className="pairing-box">
                <div className="pairing-box-header">
                  <KeyRound size={15} />
                  <span>连接配对码</span>
                  {!serverInfo.pairingConfigured && (
                    <span className="pairing-init-tip">
                      初次使用建议确认或自定义配对码
                    </span>
                  )}
                </div>
                <div className="pairing-box-row">
                  <input
                    className="pairing-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={codeInput}
                    onChange={(e) =>
                      setCodeInput(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="输入数字配对码（如 4829）"
                    maxLength={16}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveCode}
                    disabled={!codeInput.trim()}
                  >
                    {codeSaved ? <Check size={14} /> : null}
                    <span>{codeSaved ? "已保存" : "保存配对码"}</span>
                  </button>
                </div>
              </div>

              <div className="https-box">
                <div className="https-box-header">
                  <div className="https-box-title">
                    {serverInfo.httpsEnabled ? (
                      <ShieldCheck size={16} className="https-icon-on" />
                    ) : (
                      <Lock size={16} />
                    )}
                    <span>本地 HTTPS (SSL)</span>
                  </div>
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      serverInfo.httpsEnabled ? "btn-secondary" : "btn-primary"
                    }`}
                    disabled={httpsBusy}
                    onClick={async () => {
                      setHttpsBusy(true);
                      setHttpsError(null);
                      try {
                        await onToggleHttps(!serverInfo.httpsEnabled);
                      } catch (e) {
                        setHttpsError(
                          e instanceof Error ? e.message : String(e)
                        );
                      } finally {
                        setHttpsBusy(false);
                      }
                    }}
                  >
                    <span>
                      {httpsBusy
                        ? "处理中..."
                        : serverInfo.httpsEnabled
                          ? "关闭 HTTPS"
                          : "一键开启"}
                    </span>
                  </button>
                </div>

                <p className="https-hint">
                  {!serverInfo.httpsEnabled ? (
                    <span className="https-recommend-badge">推荐开启</span>
                  ) : (
                    <span className="https-running-badge">已启用</span>
                  )}
                  <span>
                    加密局域网通信，并解锁浏览器原生 <strong>WakeLock 屏幕常亮</strong>（充电时自动生效，无需视频保活）与完整 <strong>PWA 主屏幕应用</strong>体验。
                  </span>
                </p>

                {httpsError && (
                  <p className="pairing-error-text">{httpsError}</p>
                )}

                {serverInfo.httpsEnabled && serverInfo.caCertUrl && (
                  <div className="https-ca-panel">
                    <div className="https-ca-qr">
                      <QRCodeSVG
                        value={serverInfo.caCertUrl}
                        size={84}
                        bgColor="#ffffff"
                        fgColor="#0f172a"
                        level="M"
                      />
                    </div>
                    <div className="https-ca-guide">
                      <div className="https-ca-title">
                        首次使用请扫码下载并信任根证书
                      </div>
                      <p>
                        1. 手机扫码下载 <code>LanDeck-CA.crt</code>（
                        <code>{serverInfo.caCertUrl}</code>）
                      </p>
                      <p>
                        2. <strong>iOS</strong>：设置 → 已下载描述文件安装 → 通用 → 关于本机 → 证书信任设置开启信任；
                        <strong>Android</strong>：设置 → 安全/凭据 → 安装 CA 证书。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <div className="home-right-col">
          <section className="card">
            <div className="card-header-row">
              <h2 className="card-title">布局配置 ({layouts.length})</h2>
              <div className="layout-header-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setTransferModal({ mode: "import" })}
                  title="从文本、JSON 文件或 URL 导入配置"
                >
                  <Upload size={14} />
                  <span>导入</span>
                </button>
                {layouts.length > 0 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setTransferModal({ mode: "export", layouts })
                    }
                    title="导出全部布局配置"
                  >
                    <Download size={14} />
                    <span>导出全部</span>
                  </button>
                )}
                <button className="btn btn-primary btn-sm" onClick={onCreateLayout}>
                  <Plus size={14} />
                  <span>创建配置</span>
                </button>
              </div>
            </div>

            {layouts.length === 0 ? (
              <div className="empty-devices">
                <LayoutGrid size={36} className="empty-icon" />
                <p>暂无布局配置</p>
                <span>点击右上角「创建配置」开始设计你的 LanDeck 面板</span>
              </div>
            ) : (
              <div className="device-list">
                {layouts.map((layout) => {
                  const isLandscape = layout.width > layout.height;
                  return (
                    <div key={layout.id} className="device-item">
                      <div
                        className="device-main"
                        onClick={() => onSelectLayout(layout)}
                      >
                        <div className="device-icon-wrap">
                          <LayoutGrid size={20} />
                        </div>
                        <div className="device-meta">
                          <div className="device-name-row">
                            <span className="device-name">{layout.name}</span>
                            <span className="status-pill offline">
                              {isLandscape ? "横屏" : "竖屏"}
                            </span>
                          </div>
                          <div className="device-sub">
                            <span>
                              网格 {layout.cols} × {layout.rows}
                            </span>
                            <span>·</span>
                            <span>{layout.slots.length} 个按钮</span>
                            <span>·</span>
                            <span>更新于 {formatLastSeen(layout.updatedAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="device-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => onSelectLayout(layout)}
                        >
                          <Edit3 size={14} />
                          <span>编辑</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            setTransferModal({
                              mode: "export",
                              layouts: [layout],
                            })
                          }
                          title="导出配置"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onDuplicateLayout(layout)}
                          title="复制配置"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => onDeleteLayout(layout.id)}
                          title="删除配置"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {transferModal && (
        <ConfigTransferModal
          mode={transferModal.mode}
          layoutsToExport={
            transferModal.mode === "export" ? transferModal.layouts : []
          }
          generateId={generateId}
          onImportLayouts={onImportLayouts}
          onClose={() => setTransferModal(null)}
        />
      )}
    </div>
  );
}
