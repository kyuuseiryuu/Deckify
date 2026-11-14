import { useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileJson,
  FileText,
  Link,
  Upload,
  X,
} from "lucide-react";
import { fetchUrlText } from "../api";
import type { LayoutConfig } from "../types";
import {
  downloadJsonFile,
  parseImportedLayouts,
  sanitizeFilename,
  serializeLayoutsForExport,
} from "../utils/configTransfer";

type ImportTab = "text" | "file" | "url";

interface ConfigTransferModalProps {
  mode: "export" | "import";
  layoutsToExport?: LayoutConfig[];
  generateId: () => string;
  onImportLayouts: (layouts: LayoutConfig[]) => Promise<void>;
  onClose: () => void;
}

export function ConfigTransferModal({
  mode,
  layoutsToExport = [],
  generateId,
  onImportLayouts,
  onClose,
}: ConfigTransferModalProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>("text");
  const [textInput, setTextInput] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const exportedJson = useMemo(
    () =>
      mode === "export" ? serializeLayoutsForExport(layoutsToExport) : "",
    [mode, layoutsToExport]
  );

  const exportFilename = useMemo(() => {
    if (layoutsToExport.length === 1) {
      return `${sanitizeFilename(layoutsToExport[0].name)}.json`;
    }
    return "landeck-layouts-backup.json";
  }, [layoutsToExport]);

  const fileSummary = useMemo(() => {
    if (!fileContent) return null;
    try {
      const parsed = parseImportedLayouts(fileContent, generateId);
      const totalSlots = parsed.reduce((acc, l) => acc + l.slots.length, 0);
      return `已识别 ${parsed.length} 个布局（共 ${totalSlots} 个按钮）`;
    } catch (e) {
      return e instanceof Error ? e.message : "文件解析失败";
    }
  }, [fileContent, generateId]);

  const handleCopyExport = async () => {
    await navigator.clipboard.writeText(exportedJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadExport = () => {
    downloadJsonFile(exportFilename, exportedJson);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      setFileName(file.name);
      setFileContent(text);
    } catch {
      setError("读取文件失败，请重试");
    }
  };

  const handleConfirmImport = async () => {
    setError(null);
    setBusy(true);
    try {
      let rawText = "";
      if (activeTab === "text") {
        rawText = textInput;
      } else if (activeTab === "file") {
        if (!fileContent) {
          throw new Error("请先选择一个 JSON 配置文件");
        }
        rawText = fileContent;
      } else {
        const cleanUrl = urlInput.trim();
        if (!cleanUrl) {
          throw new Error("请输入配置文件的 URL 地址");
        }
        rawText = await fetchUrlText(cleanUrl);
      }

      const layouts = parseImportedLayouts(rawText, generateId);
      await onImportLayouts(layouts);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "export") {
    const title =
      layoutsToExport.length === 1
        ? `导出配置 · ${layoutsToExport[0].name}`
        : `导出全部配置（${layoutsToExport.length} 个布局）`;

    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal-card config-modal-card"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="config-modal-header">
            <h3 className="modal-title">{title}</h3>
            <button
              type="button"
              className="config-modal-close"
              onClick={onClose}
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
          <p className="modal-desc">
            你可以直接复制下方 JSON 文本分享给他人，或下载为 <code>.json</code> 文件备份。
          </p>

          <textarea
            className="config-textarea"
            value={exportedJson}
            readOnly
            spellCheck={false}
          />

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
            >
              关闭
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCopyExport}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? "已复制" : "复制 JSON"}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleDownloadExport}
            >
              <Download size={14} />
              <span>下载 JSON 文件</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card config-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="config-modal-header">
          <h3 className="modal-title">导入布局配置</h3>
          <button
            type="button"
            className="config-modal-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <p className="modal-desc">
          支持单个布局或批量布局备份 JSON，导入后会自动分配新 ID，不会覆盖现有配置。
        </p>

        <div className="config-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "text"}
            className={`config-tab ${activeTab === "text" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("text");
              setError(null);
            }}
          >
            <FileText size={14} />
            <span>文本框输入</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "file"}
            className={`config-tab ${activeTab === "file" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("file");
              setError(null);
            }}
          >
            <FileJson size={14} />
            <span>选择 JSON 文件</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "url"}
            className={`config-tab ${activeTab === "url" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("url");
              setError(null);
            }}
          >
            <Link size={14} />
            <span>URL 导入</span>
          </button>
        </div>

        {activeTab === "text" && (
          <div className="config-tab-body">
            <textarea
              className="config-textarea"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={'在此粘贴导出的 JSON 配置文本，例如：\n{\n  "name": "我的面板",\n  "cols": 3,\n  "rows": 5,\n  "slots": [...]\n}'}
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === "file" && (
          <div className="config-tab-body">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <button
              type="button"
              className="config-file-picker"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={22} />
              <span className="config-file-title">
                {fileName ? `已选择：${fileName}` : "点击选择本地 .json 配置文件"}
              </span>
              <span className="config-file-sub">
                {fileSummary ?? "支持单个布局或批量导出的 JSON 文件"}
              </span>
            </button>
          </div>
        )}

        {activeTab === "url" && (
          <div className="config-tab-body">
            <label className="config-field-label" htmlFor="import-url-input">
              配置文件链接（支持 http:// 或 https://）
            </label>
            <input
              id="import-url-input"
              type="url"
              className="config-url-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://raw.githubusercontent.com/.../layout.json"
            />
            <p className="config-url-hint">
              将通过桌面端直接拉取目标 JSON 内容，不受浏览器跨域限制。
            </p>
          </div>
        )}

        {error && <div className="config-error-box">{error}</div>}

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleConfirmImport}
            disabled={busy}
          >
            <Upload size={14} />
            <span>
              {busy
                ? activeTab === "url"
                  ? "正在获取..."
                  : "正在导入..."
                : activeTab === "url"
                  ? "获取并导入"
                  : "确认导入"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
