export interface NetworkInterfaceInfo {
  name: string;
  ip: string;
}

export interface ServerInfo {
  lanIp: string;
  availableIps?: NetworkInterfaceInfo[];
  port: number;
  pairingCode: string;
  pairingConfigured: boolean;
  mobileUrl: string;
  platform?: string;
  hideDockIcon?: boolean;
  httpsEnabled?: boolean;
  httpsPort?: number | null;
  caCertUrl?: string | null;
}

export interface WebhookHeader {
  key: string;
  value: string;
}

export interface MacroStep {
  action: SlotAction;
  delayMs: number;
}

export interface AudioDeviceInfo {
  id: string;
  name: string;
  isDefault: boolean;
}

export type AudioOutputMode = "flyout" | "hybrid" | "cycle" | "direct";

export type SlotAction =
  | { type: "app"; name: string; path: string }
  | { type: "hotkey"; modifiers: string[]; key: string; repeatCount?: number }
  | { type: "text"; text: string; autoEnter?: boolean }
  | { type: "image"; note: string; refreshInterval?: number }
  | { type: "monitor"; metric: "cpu" | "memory" | "network" }
  | { type: "switchLayout"; layoutId: string }
  | {
      type: "media";
      control: "play_pause" | "next" | "prev" | "vol_up" | "vol_down" | "mute";
    }
  | {
      type: "webhook";
      url: string;
      method: string;
      headers?: WebhookHeader[];
      body: string;
    }
  | { type: "macro"; steps: MacroStep[] }
  | { type: "url"; url: string }
  | { type: "command"; command: string }
  | {
      type: "audioOutput";
      mode: AudioOutputMode;
      targetDeviceId?: string;
      whitelistDeviceIds?: string[];
    };

export interface SystemStats {
  cpu: number;
  memPercent: number;
  memUsedGb: number;
  memTotalGb: number;
  netRxKbps: number;
  netTxKbps: number;
}

export interface DeckSlot {
  id: string;
  index: number;
  label: string;
  icon?: string | null;
  color?: string | null;
  colSpan?: number;
  rowSpan?: number;
  fontSize?: number;
  action: SlotAction;
}

export interface LayoutConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  cols: number;
  rows: number;
  slots: DeckSlot[];
  updatedAt: number;
}

export interface ScreenRatioPreset {
  ratioKey: string;
  deviceName?: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface LocalAppInfo {
  name: string;
  path: string;
  bundleId?: string | null;
  icon?: string | null;
}

export type WsServerMsg =
  | { type: "layoutsList"; layouts: LayoutConfig[] }
  | { type: "layoutSync"; layout: LayoutConfig }
  | { type: "actionResult"; slotId: string; ok: boolean; error?: string | null }
  | { type: "systemStats"; stats: SystemStats }
  | { type: "audioDevices"; devices: AudioDeviceInfo[] }
  | { type: "pong" }
  | { type: "authError"; message: string }
  | { type: "error"; message: string };
