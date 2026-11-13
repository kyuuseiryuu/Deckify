import { invoke } from "@tauri-apps/api/core";
import type {
  LayoutConfig,
  LocalAppInfo,
  ServerInfo,
  SlotAction,
} from "./types";

export async function getServerInfo(): Promise<ServerInfo> {
  return invoke<ServerInfo>("get_server_info");
}

export async function setPairingCode(code: string): Promise<ServerInfo> {
  return invoke<ServerInfo>("set_pairing_code", { code });
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

export function resolveIconUrl(
  iconPath: string | null | undefined,
  serverPort?: number
): string | null {
  if (!iconPath) return null;
  if (iconPath.startsWith("http") || iconPath.startsWith("data:")) {
    return iconPath;
  }
  if (serverPort) {
    return `http://127.0.0.1:${serverPort}${iconPath}`;
  }
  return iconPath;
}
