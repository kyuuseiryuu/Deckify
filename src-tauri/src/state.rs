use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Emitter;
use tokio::sync::{mpsc, RwLock};

use crate::models::{LayoutConfig, ServerInfo, SystemStats, WsServerMsg};

pub type WsSender = mpsc::UnboundedSender<String>;

#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<RwLock<StateInner>>,
    pub app_handle: tauri::AppHandle,
}

pub struct StateInner {
    pub layouts: HashMap<String, LayoutConfig>,
    pub connections: HashMap<String, WsSender>,
    pub data_dir: PathBuf,
    pub icon_cache_dir: PathBuf,
    pub lan_ip: String,
    pub port: u16,
    pub pairing_code: String,
    pub pairing_configured: bool,
    pub hide_dock_icon: bool,
    #[cfg(target_os = "macos")]
    pub dock_menu_item: Option<tauri::menu::CheckMenuItem<tauri::Wry>>,
}

pub fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

impl AppState {
    pub fn new(
        app_handle: tauri::AppHandle,
        data_dir: PathBuf,
        lan_ip: String,
        port: u16,
        pairing_code: String,
        pairing_configured: bool,
    ) -> Self {
        let icon_cache_dir = data_dir.join("icons");
        let _ = fs::create_dir_all(&data_dir);
        let _ = fs::create_dir_all(&icon_cache_dir);

        let layouts = Self::load_layouts_from_disk(&data_dir);
        let hide_dock_icon = Self::load_hide_dock_icon(&data_dir);

        Self {
            inner: Arc::new(RwLock::new(StateInner {
                layouts,
                connections: HashMap::new(),
                data_dir,
                icon_cache_dir,
                lan_ip,
                port,
                pairing_code,
                pairing_configured,
                hide_dock_icon,
                #[cfg(target_os = "macos")]
                dock_menu_item: None,
            })),
            app_handle,
        }
    }

    fn layouts_file(data_dir: &PathBuf) -> PathBuf {
        data_dir.join("layouts.json")
    }

    fn pairing_code_file(data_dir: &PathBuf) -> PathBuf {
        data_dir.join("pairing_code.txt")
    }

    fn hide_dock_icon_file(data_dir: &PathBuf) -> PathBuf {
        data_dir.join("hide_dock_icon.txt")
    }

    fn load_hide_dock_icon(data_dir: &PathBuf) -> bool {
        fs::read_to_string(Self::hide_dock_icon_file(data_dir))
            .map(|s| s.trim() == "true")
            .unwrap_or(false)
    }

    fn load_layouts_from_disk(data_dir: &PathBuf) -> HashMap<String, LayoutConfig> {
        let path = Self::layouts_file(data_dir);
        let Ok(raw) = fs::read_to_string(path) else {
            return HashMap::new();
        };
        let mut list: Vec<LayoutConfig> = serde_json::from_str(&raw).unwrap_or_default();
        let mut map = HashMap::new();
        for layout in list.drain(..) {
            map.insert(layout.id.clone(), layout);
        }
        map
    }

    pub fn persist_layouts(data_dir: &PathBuf, layouts: &HashMap<String, LayoutConfig>) {
        let mut list: Vec<LayoutConfig> = layouts.values().cloned().collect();
        list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        if let Ok(json) = serde_json::to_string_pretty(&list) {
            let _ = fs::write(Self::layouts_file(data_dir), json);
        }
    }

    pub async fn server_info(&self) -> ServerInfo {
        let guard = self.inner.read().await;
        let available_ips = crate::detect_available_ips();
        ServerInfo {
            lan_ip: guard.lan_ip.clone(),
            available_ips,
            port: guard.port,
            pairing_code: guard.pairing_code.clone(),
            pairing_configured: guard.pairing_configured,
            mobile_url: format!("http://{}:{}/deck", guard.lan_ip, guard.port),
            platform: std::env::consts::OS.to_string(),
            hide_dock_icon: guard.hide_dock_icon,
        }
    }

    pub async fn set_hide_dock_icon(&self, hide: bool) -> Result<ServerInfo, String> {
        #[cfg(target_os = "macos")]
        let dock_item = {
            let mut guard = self.inner.write().await;
            guard.hide_dock_icon = hide;
            let _ = fs::write(
                Self::hide_dock_icon_file(&guard.data_dir),
                if hide { "true" } else { "false" },
            );
            guard.dock_menu_item.clone()
        };

        #[cfg(not(target_os = "macos"))]
        {
            let mut guard = self.inner.write().await;
            guard.hide_dock_icon = hide;
            let _ = fs::write(
                Self::hide_dock_icon_file(&guard.data_dir),
                if hide { "true" } else { "false" },
            );
        }

        #[cfg(target_os = "macos")]
        {
            if let Some(item) = dock_item {
                let _ = item.set_checked(hide);
            }
            let policy = if hide {
                tauri::ActivationPolicy::Accessory
            } else {
                tauri::ActivationPolicy::Regular
            };
            self.app_handle
                .set_activation_policy(policy)
                .map_err(|e| format!("Failed to update Dock icon visibility: {}", e))?;
        }

        let info = self.server_info().await;
        let _ = self.app_handle.emit("server-info-updated", &info);
        Ok(info)
    }

    pub async fn set_lan_ip(&self, ip: String) -> Result<ServerInfo, String> {
        let clean = ip.trim().to_string();
        if clean.is_empty() {
            return Err("IP 地址不能为空".into());
        }
        {
            let mut guard = self.inner.write().await;
            guard.lan_ip = clean;
        }
        Ok(self.server_info().await)
    }

    pub async fn set_pairing_code(&self, code: String) -> Result<ServerInfo, String> {
        let trimmed = code.trim().to_string();
        if trimmed.is_empty() {
            return Err("配对码不能为空".into());
        }
        {
            let mut guard = self.inner.write().await;
            guard.pairing_code = trimmed.clone();
            guard.pairing_configured = true;
            let _ = fs::write(Self::pairing_code_file(&guard.data_dir), &trimmed);
        }
        Ok(self.server_info().await)
    }

    pub async fn verify_pairing_code(&self, code: &str) -> bool {
        let guard = self.inner.read().await;
        guard.pairing_code == code.trim()
    }

    pub async fn online_count(&self) -> usize {
        let guard = self.inner.read().await;
        guard.connections.len()
    }

    pub async fn list_layouts(&self) -> Vec<LayoutConfig> {
        let guard = self.inner.read().await;
        let mut list: Vec<LayoutConfig> = guard.layouts.values().cloned().collect();
        list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        list
    }

    pub async fn register_connection(
        &self,
        conn_id: String,
        sender: WsSender,
        requested_layout_id: Option<String>,
    ) -> (Vec<LayoutConfig>, Option<LayoutConfig>) {
        let mut guard = self.inner.write().await;
        guard.connections.insert(conn_id, sender);

        let mut layouts: Vec<LayoutConfig> = guard.layouts.values().cloned().collect();
        layouts.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

        let selected = requested_layout_id.and_then(|id| guard.layouts.get(&id).cloned());
        (layouts, selected)
    }

    pub async fn unregister_connection(&self, conn_id: &str) {
        let mut guard = self.inner.write().await;
        guard.connections.remove(conn_id);
    }

    pub async fn save_layout(&self, mut layout: LayoutConfig) -> LayoutConfig {
        layout.updated_at = now_unix_secs();
        let saved = {
            let mut guard = self.inner.write().await;
            guard.layouts.insert(layout.id.clone(), layout.clone());
            Self::persist_layouts(&guard.data_dir, &guard.layouts);
            layout
        };

        self.broadcast_layout(&saved).await;
        self.broadcast_layouts_list().await;
        saved
    }

    pub async fn delete_layout(&self, layout_id: &str) {
        {
            let mut guard = self.inner.write().await;
            guard.layouts.remove(layout_id);
            Self::persist_layouts(&guard.data_dir, &guard.layouts);
        }
        self.broadcast_layouts_list().await;
    }

    pub async fn broadcast_layout(&self, layout: &LayoutConfig) {
        let msg = WsServerMsg::LayoutSync {
            layout: layout.clone(),
        };
        let Ok(payload) = serde_json::to_string(&msg) else {
            return;
        };

        let guard = self.inner.read().await;
        for sender in guard.connections.values() {
            let _ = sender.send(payload.clone());
        }
    }

    pub async fn broadcast_layouts_list(&self) {
        let layouts = self.list_layouts().await;
        let msg = WsServerMsg::LayoutsList { layouts };
        let Ok(payload) = serde_json::to_string(&msg) else {
            return;
        };
        let guard = self.inner.read().await;
        for sender in guard.connections.values() {
            let _ = sender.send(payload.clone());
        }
    }

    pub async fn broadcast_system_stats(&self, stats: &SystemStats) {
        let msg = WsServerMsg::SystemStats {
            stats: stats.clone(),
        };
        let Ok(payload) = serde_json::to_string(&msg) else {
            return;
        };

        let guard = self.inner.read().await;
        for sender in guard.connections.values() {
            let _ = sender.send(payload.clone());
        }
    }
}
