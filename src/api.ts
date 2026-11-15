import { invoke } from "@tauri-apps/api/core";
import type {
  AudioDeviceInfo,
  LayoutConfig,
  LocalAppInfo,
  ServerInfo,
  SlotAction,
} from "./types";

export async function getServerInfo(): Promise<ServerInfo> {
  return invoke<ServerInfo>("get_server_info");
}

export async function setLanIp(ip: string): Promise<ServerInfo> {
  return invoke<ServerInfo>("set_lan_ip", { ip });
}

export async function setPairingCode(code: string): Promise<ServerInfo> {
  return invoke<ServerInfo>("set_pairing_code", { code });
}

export async function setHideDockIcon(hide: boolean): Promise<ServerInfo> {
  return invoke<ServerInfo>("set_hide_dock_icon", { hide });
}

export async function setHttpsEnabled(enabled: boolean): Promise<ServerInfo> {
  return invoke<ServerInfo>("set_https_enabled", { enabled });
}

export async function getOnlineCount(): Promise<number> {
  return invoke<number>("get_online_count");
}

export async function listLayouts(): Promise<LayoutConfig[]> {
  return invoke<LayoutConfig[]>("list_layouts");
}

export async function saveLayout(layout: LayoutConfig): Promise<LayoutConfig> {
  return invoke<LayoutConfig>("save_layout", { layout });
}

export async function deleteLayout(layoutId: string): Promise<void> {
  return invoke<void>("delete_layout", { layoutId });
}

export async function listLocalApps(): Promise<LocalAppInfo[]> {
  return invoke<LocalAppInfo[]>("list_local_apps");
}

export async function saveCustomImage(
  bytes: number[],
  extension: string
): Promise<string> {
  return invoke<string>("save_custom_image", { bytes, extension });
}

export async function triggerSlotAction(action: SlotAction): Promise<void> {
  return invoke<void>("trigger_slot_action", { action });
}

export async function checkAccessibilityPermission(
  prompt = false
): Promise<boolean> {
  return invoke<boolean>("check_accessibility_permission", { prompt });
}

export async function openAccessibilitySettings(): Promise<void> {
  return invoke<void>("open_accessibility_settings");
}

export async function openExternalUrl(url: string): Promise<void> {
  return invoke<void>("open_external_url", { url });
}

export async function fetchUrlText(url: string): Promise<string> {
  return invoke<string>("fetch_url_text", { url });
}

export const EMOJI_ICON_PREFIX = "emoji:";

export function getEmojiIcon(
  iconPath: string | null | undefined
): string | null {
  if (!iconPath || !iconPath.startsWith(EMOJI_ICON_PREFIX)) {
    return null;
  }
  const emoji = iconPath.slice(EMOJI_ICON_PREFIX.length).trim();
  return emoji || null;
}

export async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
  return invoke<AudioDeviceInfo[]>("list_audio_devices");
}

export async function setDefaultAudioDevice(deviceId: string): Promise<void> {
  return invoke<void>("set_default_audio_device", { deviceId });
}

export function resolveIconUrl(
  iconPath: string | null | undefined,
  serverPort?: number
): string | null {
  if (!iconPath || iconPath.startsWith(EMOJI_ICON_PREFIX)) return null;
  if (iconPath.startsWith("http") || iconPath.startsWith("data:")) {
    return iconPath;
  }
  if (serverPort) {
    return `http://127.0.0.1:${serverPort}${iconPath}`;
  }
  return iconPath;
}
