import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  deleteLayout,
  getOnlineCount,
  getServerInfo,
  listLayouts,
  saveLayout,
  setLanIp,
  setPairingCode,
} from "./api";
import { DeckPage } from "./components/DeckPage";
import { EditorPage } from "./components/EditorPage";
import { HomePage } from "./components/HomePage";
import type { LayoutConfig, ServerInfo } from "./types";
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
  const [onlineCount, setOnlineCount] = useState(0);
  const [editingLayoutId, setEditingLayoutId] = useState<string | null>(null);

  const refreshOnlineCount = async () => {
    setOnlineCount(await getOnlineCount());
  };

  const refreshLayouts = async () => {
    setLayouts(await listLayouts());
  };

  useEffect(() => {
    getServerInfo().then(setServerInfo);
    refreshLayouts();
    refreshOnlineCount();

    const unlistenClients = listen("clients-updated", () => {
      refreshOnlineCount();
    });
    const unlistenLayouts = listen("layouts-updated", () => {
      refreshLayouts();
    });

    return () => {
      unlistenClients.then((fn) => fn());
      unlistenLayouts.then((fn) => fn());
    };
  }, []);

  const editingLayout =
    layouts.find((l) => l.id === editingLayoutId) ?? null;

  const handleCreateLayout = async () => {
    const newLayout: LayoutConfig = {
      id: createLayoutId(),
      name: `配置 ${layouts.length + 1}`,
      width: 390,
      height: 844,
      cols: 3,
      rows: 5,
      slots: [],
      updatedAt: Math.floor(Date.now() / 1000),
    };
    const saved = await saveLayout(newLayout);
    setLayouts((prev) => [saved, ...prev]);
    setEditingLayoutId(saved.id);
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

  if (editingLayout) {
    return (
      <EditorPage
        layout={editingLayout}
        allLayouts={layouts}
        serverInfo={serverInfo}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={() => setEditingLayoutId(null)}
        onSaveLayout={handleSaveLayout}
      />
    );
  }

  return (
    <HomePage
      serverInfo={serverInfo}
      layouts={layouts}
      onlineCount={onlineCount}
      theme={theme}
      onToggleTheme={toggleTheme}
      onCreateLayout={handleCreateLayout}
      onSelectLayout={(l) => setEditingLayoutId(l.id)}
      onDuplicateLayout={handleDuplicateLayout}
      onDeleteLayout={handleDeleteLayout}
      onImportLayouts={handleImportLayouts}
      generateId={createLayoutId}
      onUpdatePairingCode={handleUpdatePairingCode}
      onUpdateLanIp={handleUpdateLanIp}
    />
  );
}

export default App;
