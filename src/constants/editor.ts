export interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "frequent",
    name: "常用",
    icon: "🔥",
    emojis: [
      "🚀", "⚡", "🔥", "✨", "💡", "🎯", "📌", "🔔", "🏷️", "🔑", "🔒", "🛡️",
      "⏱️", "⏳", "📅", "📍", "⭐", "🎉", "❤️", "💥", "👀", "🧠", "👍", "👏",
    ],
  },
  {
    id: "media",
    name: "多媒体",
    icon: "🎵",
    emojis: [
      "🎵", "🎶", "⏯️", "⏸️", "⏹️", "⏺️", "⏭️", "⏮️", "🔈", "🔉", "🔊", "🔇",
      "🎙️", "🎧", "📻", "📺", "📷", "📹", "🎬", "🎸", "🎹", "🎺", "🥁", "🎚️",
    ],
  },
  {
    id: "work",
    name: "办公开发",
    icon: "💻",
    emojis: [
      "💻", "🖥️", "⌨️", "🖱️", "📱", "🖨️", "💾", "📁", "📂", "📄", "📊", "📈",
      "📉", "📋", "📝", "🔍", "🌐", "📧", "📦", "💼", "📚", "🔖", "📎", "🗂️",
    ],
  },
  {
    id: "games",
    name: "游戏娱乐",
    icon: "🎮",
    emojis: [
      "🎮", "🕹️", "🎲", "🎯", "🎨", "🎭", "🎪", "🎫", "🏆", "🥇", "🥈", "🥉",
      "⚽", "🏀", "🎾", "🎳", "👾", "♟️", "🧩", "🥊", "🏎️", "✈️", "🚀", "🛸",
    ],
  },
  {
    id: "system",
    name: "系统工具",
    icon: "⚙️",
    emojis: [
      "⚙️", "🛠️", "🔧", "🔨", "🧰", "🔋", "🔌", "💡", "🧹", "🗑️", "🔄", "🔁",
      "🔀", "📶", "🛑", "⚠️", "ℹ️", "❓", "❗️", "➕", "➖", "✖️", "➗", "🔘",
    ],
  },
  {
    id: "badges",
    name: "状态徽章",
    icon: "🟢",
    emojis: [
      "🔴", "🟢", "🟡", "🔵", "🟣", "🟠", "⚫", "⚪", "🔘",
      "🟩", "🟦", "🟨", "🟥", "🟧", "🟪", "⬛", "⬜", "💠",
      "✅", "❌", "💎", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣",
    ],
  },
  {
    id: "faces",
    name: "表情手势",
    icon: "😀",
    emojis: [
      "😀", "😎", "🥳", "🤔", "😴", "🤖", "👻", "👽",
      "👍", "👎", "👏", "🙌", "✌️", "🤘", "👊", "🤝", "✍️", "💪",
    ],
  },
];

export const EMOJI_PRESETS = EMOJI_CATEGORIES[0].emojis;

export const ALL_EMOJIS: string[] = Array.from(
  new Set(EMOJI_CATEGORIES.flatMap((c) => c.emojis))
);

export const COLOR_SWATCHES = [
  "#1e293b",
  "#1d4ed8",
  "#0f766e",
  "#7c3aed",
  "#be123c",
  "#b45309",
  "#374151",
  "#0369a1",
] as const;

export const IMAGE_REFRESH_OPTIONS = [
  { value: 0, label: "不自动刷新" },
  { value: 5, label: "每 5 秒" },
  { value: 10, label: "每 10 秒" },
  { value: 15, label: "每 15 秒" },
  { value: 30, label: "每 30 秒" },
  { value: 60, label: "每 60 秒" },
  { value: 120, label: "每 120 秒" },
] as const;

export function createSlotId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
