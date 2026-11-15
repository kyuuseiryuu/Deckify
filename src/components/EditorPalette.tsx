import {
  Activity,
  AppWindow,
  FolderOutput,
  Globe,
  Image as ImageIcon,
  Keyboard,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  Type,
  Volume2,
  Webhook,
  Headphones,
} from "lucide-react";
import { resolveIconUrl } from "../api";
import type { LocalAppInfo } from "../types";
import { isWindowsHost } from "./ActionConfigFields";

export type TemplateKind =
  | "hotkey"
  | "text"
  | "image"
  | "url"
  | "command"
  | "monitor"
  | "switchLayout"
  | "media"
  | "audioOutput"
  | "webhook"
  | "macro";

interface EditorPaletteProps {
  paletteTab: "apps" | "actions";
  onTabChange: (tab: "apps" | "actions") => void;
  appQuery: string;
  onAppQueryChange: (query: string) => void;
  loadingApps: boolean;
  filteredApps: LocalAppInfo[];
  serverPort?: number;
  onRefreshApps: () => void;
  onPlaceApp: (app: LocalAppInfo) => void;
  onCreateTemplate: (kind: TemplateKind) => void;
}

export function EditorPalette({
  paletteTab,
  onTabChange,
  appQuery,
  onAppQueryChange,
  loadingApps,
  filteredApps,
  serverPort,
  onRefreshApps,
  onPlaceApp,
  onCreateTemplate,
}: EditorPaletteProps) {
  return (
    <aside className="editor-sidebar">
      <div className="palette-tabs">
        <button
          className={`palette-tab ${paletteTab === "apps" ? "active" : ""}`}
          onClick={() => onTabChange("apps")}
        >
          <AppWindow size={15} />
          <span>本地应用</span>
        </button>
        <button
          className={`palette-tab ${paletteTab === "actions" ? "active" : ""}`}
          onClick={() => onTabChange("actions")}
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
                onChange={(e) => onAppQueryChange(e.target.value)}
                placeholder="搜索本地应用..."
              />
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onRefreshApps}
              title="刷新本地应用列表"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="apps-list">
            {loadingApps ? (
              <div className="apps-loading">正在扫描本地应用...</div>
            ) : filteredApps.length === 0 ? (
              <div className="apps-loading">未找到匹配应用</div>
            ) : (
              filteredApps.map((app) => {
                const iconSrc = resolveIconUrl(app.icon, serverPort);
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
                    onClick={() => onPlaceApp(app)}
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
            onClick={() => onCreateTemplate("hotkey")}
          >
            <Keyboard size={18} />
            <div>
              <div className="tpl-title">快捷键</div>
              <div className="tpl-desc">
                {isWindowsHost()
                  ? "模拟组合键，如 Ctrl+Shift+Esc 或 Win+Shift+S"
                  : "模拟组合键，如 Cmd+Shift+4"}
              </div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("text")}
          >
            <Type size={18} />
            <div>
              <div className="tpl-title">快捷输入文本</div>
              <div className="tpl-desc">自动键入预设文本，支持回车</div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("image")}
          >
            <ImageIcon size={18} />
            <div>
              <div className="tpl-title">图片 / 贴纸</div>
              <div className="tpl-desc">上传自定义图片或标签</div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("url")}
          >
            <Globe size={18} />
            <div>
              <div className="tpl-title">打开网页</div>
              <div className="tpl-desc">在默认浏览器打开指定网址</div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("command")}
          >
            <Terminal size={18} />
            <div>
              <div className="tpl-title">Shell 命令</div>
              <div className="tpl-desc">在桌面端执行自定义终端命令</div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("monitor")}
          >
            <Activity size={18} />
            <div>
              <div className="tpl-title">系统状态</div>
              <div className="tpl-desc">实时显示 CPU、内存或网络速率</div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("switchLayout")}
          >
            <FolderOutput size={18} />
            <div>
              <div className="tpl-title">跳转布局</div>
              <div className="tpl-desc">点击跳转到已配置的另一个布局</div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("media")}
          >
            <Volume2 size={18} />
            <div>
              <div className="tpl-title">媒体 / 音量</div>
              <div className="tpl-desc">播放暂停、切歌、系统音量控制</div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("audioOutput")}
          >
            <Headphones size={18} />
            <div>
              <div className="tpl-title">音源控制</div>
              <div className="tpl-desc">切换电脑扬声器/耳机/音频输出设备</div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("webhook")}
          >
            <Webhook size={18} />
            <div>
              <div className="tpl-title">HTTP Webhook</div>
              <div className="tpl-desc">静默发送 GET / POST 请求</div>
            </div>
          </button>
          <button
            className="action-template-btn"
            onClick={() => onCreateTemplate("macro")}
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
  );
}
