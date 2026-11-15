import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Upload, Smile, Trash2, Search, X } from "lucide-react";
import { EMOJI_ICON_PREFIX, getEmojiIcon, saveCustomImage } from "../api";
import { EMOJI_CATEGORIES, ALL_EMOJIS } from "../constants/editor";
import { isValidSingleEmoji } from "../utils/emoji";

interface SlotIconPickerProps {
  selectedIndex: number;
  icon: string | null | undefined;
  allowEmoji?: boolean;
  onChangeIcon: (nextIcon: string | null) => void;
}

export function SlotIconPicker({
  selectedIndex,
  icon,
  allowEmoji = true,
  onChangeIcon,
}: SlotIconPickerProps) {
  const [iconUrlInput, setIconUrlInput] = useState("");
  const [iconUrlError, setIconUrlError] = useState<string | null>(null);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [activeCategory, setActiveCategory] = useState("frequent");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [emojiError, setEmojiError] = useState<string | null>(null);

  const [panelCoords, setPanelCoords] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null);
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rawIcon = icon ?? "";
    if (
      rawIcon.startsWith("http://") ||
      rawIcon.startsWith("https://") ||
      rawIcon.startsWith("data:")
    ) {
      setIconUrlInput(rawIcon);
    } else {
      setIconUrlInput("");
    }
    setIconUrlError(null);
    setEmojiError(null);
    if (!allowEmoji) {
      setShowEmojiPanel(false);
    }
  }, [selectedIndex, icon, allowEmoji]);

  const updateCoords = useCallback(() => {
    if (!emojiTriggerRef.current) return;
    const rect = emojiTriggerRef.current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setShowEmojiPanel(false);
      return;
    }
    const panelWidth = 285;
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - panelWidth - 10));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = 310;
    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const availableSpace = openUp ? spaceAbove - 12 : spaceBelow - 12;
    const maxHeight = Math.max(Math.min(availableSpace, 360), 200);

    setPanelCoords({
      left,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!showEmojiPanel) {
      setEmojiSearch("");
      setEmojiError(null);
      return;
    }

    updateCoords();

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        emojiTriggerRef.current &&
        !emojiTriggerRef.current.contains(target) &&
        emojiPanelRef.current &&
        !emojiPanelRef.current.contains(target)
      ) {
        setShowEmojiPanel(false);
      }
    }

    function handleScroll(e: Event) {
      if (emojiPanelRef.current && emojiPanelRef.current.contains(e.target as Node)) {
        return;
      }
      updateCoords();
    }

    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showEmojiPanel, updateCoords]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const ext = file.name.split(".").pop() || "png";
    const iconUrl = await saveCustomImage(Array.from(new Uint8Array(buf)), ext);
    onChangeIcon(iconUrl);
    e.target.value = "";
  };

  const handleApplyIconUrl = () => {
    const trimmed = iconUrlInput.trim();
    if (!trimmed) {
      setIconUrlError("请输入图片链接或 Base64 URL");
      return;
    }
    const lower = trimmed.toLowerCase();
    const isValid =
      lower.startsWith("http://") ||
      lower.startsWith("https://") ||
      lower.startsWith("data:image/");
    if (!isValid) {
      setIconUrlError("仅支持 http://、https:// 或 data:image/... Base64 URL");
      return;
    }
    setIconUrlError(null);
    setEmojiError(null);
    onChangeIcon(trimmed);
  };

  const handleApplyEmoji = (rawEmoji: string) => {
    const trimmed = rawEmoji.trim();
    if (!trimmed) return;
    if (!isValidSingleEmoji(trimmed)) {
      setEmojiError("仅支持单个 Emoji 表情");
      return;
    }
    setEmojiError(null);
    setIconUrlError(null);
    onChangeIcon(`${EMOJI_ICON_PREFIX}${trimmed}`);
    setShowEmojiPanel(false);
  };

  const currentEmoji = getEmojiIcon(icon);

  // Filter emojis based on search or category
  const displayedEmojis: string[] = emojiSearch.trim()
    ? ALL_EMOJIS.filter((e: string) => e.includes(emojiSearch.trim()))
    : EMOJI_CATEGORIES.find((c) => c.id === activeCategory)?.emojis || EMOJI_CATEGORIES[0].emojis;

  return (
    <div className="form-group">
      <label>{allowEmoji ? "槽位图标 / Emoji" : "槽位图片"}</label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleImageUpload}
      />
      <div className="icon-toolbar-row">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => fileInputRef.current?.click()}
          title="上传本地图片作为图标"
        >
          <Upload size={14} />
          <span>上传图片</span>
        </button>

        {allowEmoji && (
          <button
            ref={emojiTriggerRef}
            type="button"
            className={`btn btn-secondary btn-sm emoji-trigger-btn ${currentEmoji ? "has-emoji" : ""}`}
            onClick={() => setShowEmojiPanel((prev) => !prev)}
            title="点击打开 Emoji 选择面板"
          >
            {currentEmoji ? (
              <span className="emoji-trigger-preview">{currentEmoji}</span>
            ) : (
              <Smile size={14} />
            )}
            <span>{currentEmoji ? "更换 Emoji" : "选择 Emoji"}</span>
          </button>
        )}

        {icon && (
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-icon-only"
            onClick={() => onChangeIcon(null)}
            title={allowEmoji ? "移除当前图标或 Emoji" : "移除当前图片"}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="icon-url-row">
        <input
          type="text"
          value={iconUrlInput}
          onChange={(e) => {
            setIconUrlInput(e.target.value);
            if (iconUrlError) setIconUrlError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleApplyIconUrl();
            }
          }}
          placeholder="图片链接或 Base64 URL..."
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleApplyIconUrl}
          disabled={!iconUrlInput.trim()}
        >
          应用
        </button>
      </div>
      {iconUrlError && <p className="icon-url-error">{iconUrlError}</p>}

      {allowEmoji &&
        showEmojiPanel &&
        panelCoords &&
        createPortal(
          <div
            ref={emojiPanelRef}
            className="emoji-picker-panel"
            style={{
              position: "fixed",
              left: `${panelCoords.left}px`,
              top: panelCoords.top !== undefined ? `${panelCoords.top}px` : "auto",
              bottom: panelCoords.bottom !== undefined ? `${panelCoords.bottom}px` : "auto",
              maxHeight: `${panelCoords.maxHeight}px`,
              zIndex: 99999,
            }}
          >
            <div className="emoji-panel-header">
              <div className="emoji-search-wrap">
                <Search size={13} className="emoji-search-icon" />
                <input
                  type="text"
                  className="emoji-search-input"
                  placeholder="搜索或输入任意单个 Emoji..."
                  value={emojiSearch}
                  onChange={(e) => {
                    setEmojiSearch(e.target.value);
                    if (emojiError) setEmojiError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && emojiSearch.trim()) {
                      e.preventDefault();
                      handleApplyEmoji(emojiSearch);
                    } else if (e.key === "Escape") {
                      setShowEmojiPanel(false);
                    }
                  }}
                  autoFocus
                />
              </div>
              <button
                type="button"
                className="emoji-panel-close-btn"
                onClick={() => setShowEmojiPanel(false)}
                title="关闭"
              >
                <X size={14} />
              </button>
            </div>

            {emojiError && <p className="emoji-panel-error">{emojiError}</p>}

            <div className="emoji-category-bar">
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`emoji-cat-btn ${activeCategory === cat.id && !emojiSearch.trim() ? "active" : ""}`}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setEmojiSearch("");
                  }}
                  title={cat.name}
                >
                  {cat.icon}
                </button>
              ))}
            </div>

            <div className="emoji-grid-scroll">
              {displayedEmojis.length === 0 ? (
                <div className="emoji-empty-tip">
                  {isValidSingleEmoji(emojiSearch.trim()) ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleApplyEmoji(emojiSearch)}
                    >
                      使用自定义 Emoji 「{emojiSearch.trim()}」
                    </button>
                  ) : (
                    "未找到匹配的 Emoji"
                  )}
                </div>
              ) : (
                <div className="emoji-grid">
                  {displayedEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`emoji-cell-btn ${currentEmoji === emoji ? "active" : ""}`}
                      onClick={() => handleApplyEmoji(emoji)}
                      title={`使用 ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
