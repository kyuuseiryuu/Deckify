import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { EMOJI_ICON_PREFIX, getEmojiIcon, saveCustomImage } from "../api";
import { EMOJI_PRESETS } from "../constants/editor";
import { isValidSingleEmoji } from "../utils/emoji";

interface SlotIconPickerProps {
  selectedIndex: number;
  icon: string | null | undefined;
  onChangeIcon: (nextIcon: string | null) => void;
}

export function SlotIconPicker({
  selectedIndex,
  icon,
  onChangeIcon,
}: SlotIconPickerProps) {
  const [iconUrlInput, setIconUrlInput] = useState("");
  const [iconUrlError, setIconUrlError] = useState<string | null>(null);
  const [emojiInput, setEmojiInput] = useState("");
  const [emojiError, setEmojiError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    setEmojiInput(getEmojiIcon(rawIcon) ?? "");
    setIconUrlError(null);
    setEmojiError(null);
  }, [selectedIndex, icon]);

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
      setIconUrlError("请输入图片 URL 或 Base64 Data URL");
      return;
    }
    const lower = trimmed.toLowerCase();
    const isValid =
      lower.startsWith("http://") ||
      lower.startsWith("https://") ||
      lower.startsWith("data:image/");
    if (!isValid) {
      setIconUrlError(
        "仅支持 http://、https:// 图片链接或 data:image/... 格式的 Base64 Data URL"
      );
      return;
    }
    setIconUrlError(null);
    setEmojiError(null);
    onChangeIcon(trimmed);
  };

  const handleApplyEmoji = (rawEmoji: string) => {
    const trimmed = rawEmoji.trim();
    if (!trimmed) {
      setEmojiError("请输入单个 Emoji 表情");
      return;
    }
    if (!isValidSingleEmoji(trimmed)) {
      setEmojiError("仅支持输入 1 个 Emoji 表情（如 🚀、👨‍💻、1️⃣）");
      return;
    }
    setEmojiInput(trimmed);
    setEmojiError(null);
    setIconUrlError(null);
    onChangeIcon(`${EMOJI_ICON_PREFIX}${trimmed}`);
  };

  const currentEmoji = getEmojiIcon(icon);

  return (
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
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} />
          <span>上传图片</span>
        </button>
        {icon && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onChangeIcon(null)}
          >
            移除图标
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
          placeholder="输入图片 URL（https://...）或 data:image/...;base64,..."
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
      <div className="icon-emoji-row">
        <input
          type="text"
          value={emojiInput}
          onChange={(e) => {
            setEmojiInput(e.target.value);
            if (emojiError) setEmojiError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleApplyEmoji(emojiInput);
            }
          }}
          placeholder="输入任意单个 Emoji（如 🚀、👨‍💻、1️⃣）"
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => handleApplyEmoji(emojiInput)}
          disabled={!emojiInput.trim()}
        >
          设为 Emoji
        </button>
      </div>
      {emojiError && <p className="icon-url-error">{emojiError}</p>}
      <div className="emoji-preset-list">
        {EMOJI_PRESETS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`emoji-preset-btn ${currentEmoji === emoji ? "active" : ""}`}
            onClick={() => handleApplyEmoji(emoji)}
            title={`使用 ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
