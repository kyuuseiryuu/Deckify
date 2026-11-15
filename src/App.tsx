import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  deleteLayout,
  deleteScreenRatio,
  getOnlineCount,
  getServerInfo,
  listLayouts,
  listScreenRatios,
  saveLayout,
  setHideDockIcon,
  setHttpsEnabled,
  setLanIp,
  setPairingCode,
} from "./api";
import { DeckPage } from "./components/DeckPage";
import { EditorPage } from "./components/EditorPage";
import { HomePage } from "./components/HomePage";
import type { LayoutConfig, ScreenRatioPreset, ServerInfo } from "./types";
import { useTheme } from "./utils/theme";

export function App() {
  const isMobileDeck = window.location.pathname.startsWith("/deck");
  if (isMobileDeck) {
    return <DeckPage />;
  }

  return <DesktopApp />;
}

function createLayoutId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `layout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function DesktopApp() {
  const [theme, toggleTheme] = useTheme();
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [layouts, setLayouts] = useState<LayoutConfig[]>([]);
  const [screenRatios, setScreenRatios] = useState<ScreenRatioPreset[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [editingLayoutId, setEditingLayoutId] = useState<string | null>(null);

  const refreshOnlineCount = async () => {
    setOnlineCount(await getOnlineCount());
  };

  const refreshLayouts = async () => {
    setLayouts(await listLayouts());
  };

  const refreshScreenRatios = async () => {
    setScreenRatios(await listScreenRatios());
  };

  useEffect(() => {
    getServerInfo().then(setServerInfo);
    refreshLayouts();
    refreshScreenRatios();
    refreshOnlineCount();

    const unlistenClients = listen("clients-updated", () => {
      refreshOnlineCount();
    });
    const unlistenLayouts = listen("layouts-updated", () => {
      refreshLayouts();
    });
    const unlistenRatios = listen("screen-ratios-updated", () => {
      refreshScreenRatios();
    });
    const unlistenServerInfo = listen<ServerInfo>(
      "server-info-updated",
      (event) => {
        setServerInfo(event.payload);
      }
    );

    return () => {
      unlistenClients.then((fn) => fn());
      unlistenLayouts.then((fn) => fn());
      unlistenRatios.then((fn) => fn());
      unlistenServerInfo.then((fn) => fn());
    };
  }, []);

  const editingLayout =
    layouts.find((l) => l.id === editingLayoutId) ?? null;

  const handleCreateLayout = async (options?: {
    name?: string;
    width?: number;
    height?: number;
  }) => {
    const width = options?.width && options.width > 0 ? options.width : 390;
    const height = options?.height && options.height > 0 ? options.height : 844;
    const isLandscape = width > height;
    const newLayout: LayoutConfig = {
      id: createLayoutId(),
      name: options?.name?.trim() || `配置 ${layouts.length + 1}`,
      width,
      height,
      cols: isLandscape ? 5 : 3,
      rows: isLandscape ? 3 : 5,
      slots: [],
      updatedAt: Math.floor(Date.now() / 1000),
    };
    const saved = await saveLayout(newLayout);
    setLayouts((prev) => [saved, ...prev]);
    setEditingLayoutId(saved.id);
  };

  const handleDeleteScreenRatio = async (ratioKey: string) => {
    const updated = await deleteScreenRatio(ratioKey);
    setScreenRatios(updated);
  };

  const handleSaveLayout = async (layout: LayoutConfig) => {
    const saved = await saveLayout(layout);
    setLayouts((prev) =>
      prev.map((l) => (l.id === saved.id ? saved : l))
    );
  };

  const handleDeleteLayout = async (layoutId: string) => {
    await deleteLayout(layoutId);
    if (editingLayoutId === layoutId) {
      setEditingLayoutId(null);
    }
    await refreshLayouts();
  };

  const handleDuplicateLayout = async (layout: LayoutConfig) => {
    const cloned: LayoutConfig = {
      ...layout,
      id: createLayoutId(),
      name: `${layout.name} 副本`,
      slots: layout.slots.map((s) => ({ ...s, id: createLayoutId() })),
      updatedAt: Math.floor(Date.now() / 1000),
    };
    const saved = await saveLayout(cloned);
    setLayouts((prev) => [saved, ...prev]);
  };

  const handleImportLayouts = async (imported: LayoutConfig[]) => {
    const savedList: LayoutConfig[] = [];
    for (const layout of imported) {
      const saved = await saveLayout(layout);
      savedList.push(saved);
    }
    setLayouts((prev) => [...savedList.reverse(), ...prev]);
  };

  const handleUpdatePairingCode = async (code: string) => {
    const updated = await setPairingCode(code);
    setServerInfo(updated);
  };

  const handleUpdateLanIp = async (ip: string) => {
    const updated = await setLanIp(ip);
    setServerInfo(updated);
  };

  const handleToggleHideDockIcon = async (hide: boolean) => {
    const updated = await setHideDockIcon(hide);
    setServerInfo(updated);
  };

  const handleToggleHttps = async (enabled: boolean) => {
    const updated = await setHttpsEnabled(enabled);
    setServerInfo(updated);
  };

  if (editingLayout) {
    return (
      <EditorPage
        key={editingLayout.id}
        layout={editingLayout}
        allLayouts={layouts}
        screenRatios={screenRatios}
        serverInfo={serverInfo}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={() => setEditingLayoutId(null)}
        onSaveLayout={handleSaveLayout}
        onSelectLayout={(layoutId) => setEditingLayoutId(layoutId)}
      />
    );
  }

  return (
    <HomePage
      serverInfo={serverInfo}
      layouts={layouts}
      screenRatios={screenRatios}
      onlineCount={onlineCount}
      theme={theme}
      onToggleTheme={toggleTheme}
      onCreateLayout={handleCreateLayout}
      onDeleteScreenRatio={handleDeleteScreenRatio}
      onSelectLayout={(l) => setEditingLayoutId(l.id)}
      onDuplicateLayout={handleDuplicateLayout}
      onDeleteLayout={handleDeleteLayout}
      onImportLayouts={handleImportLayouts}
      generateId={createLayoutId}
      onUpdatePairingCode={handleUpdatePairingCode}
      onUpdateLanIp={handleUpdateLanIp}
      onToggleHideDockIcon={handleToggleHideDockIcon}
      onToggleHttps={handleToggleHttps}
    />
  );
}

export default App;
