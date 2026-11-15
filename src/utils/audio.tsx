import { Headphones, Speaker, Tv, Volume2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Returns a fitting Lucide icon based on audio device friendly name.
 */
export function getAudioDeviceIcon(name?: string, size = 18): ReactNode {
  if (!name) return <Volume2 size={size} />;
  const lower = name.toLowerCase();
  if (
    lower.includes("headphone") ||
    lower.includes("earphone") ||
    lower.includes("headset") ||
    lower.includes("airpod") ||
    lower.includes("buds") ||
    lower.includes("耳机") ||
    lower.includes("耳麦")
  ) {
    return <Headphones size={size} />;
  }
  if (
    lower.includes("tv") ||
    lower.includes("monitor") ||
    lower.includes("display") ||
    lower.includes("hdmi") ||
    lower.includes("ultragear") ||
    lower.includes("显示器") ||
    lower.includes("电视")
  ) {
    return <Tv size={size} />;
  }
  if (
    lower.includes("speaker") ||
    lower.includes("扬声器") ||
    lower.includes("音箱") ||
    lower.includes("sound")
  ) {
    return <Speaker size={size} />;
  }
  return <Volume2 size={size} />;
}

/**
 * Strips device backend / parenthetical controller details for clean compact display.
 * E.g., "LG ULTRAGEAR (NVIDIA High Definition Audio)" -> "LG ULTRAGEAR"
 */
export function getCleanAudioDeviceName(name?: string): string {
  if (!name) return "";
  const idx = name.indexOf("(");
  if (idx > 0) {
    return name.slice(0, idx).trim();
  }
  return name.trim();
}
