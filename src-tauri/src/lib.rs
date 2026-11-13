mod actions;
mod apps;
mod models;
mod server;
mod state;

use std::fs;
use std::net::TcpListener;
use std::path::PathBuf;
use std::time::Duration;

use sysinfo::{Networks, System};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State, WindowEvent,
};
use uuid::Uuid;

use crate::actions::execute_action;
use crate::apps::scan_local_apps;
use crate::models::{LayoutConfig, LocalAppInfo, ServerInfo, SlotAction, SystemStats};
use crate::state::AppState;

fn pick_port(preferred: u16) -> u16 {
    if TcpListener::bind(("0.0.0.0", preferred)).is_ok() {
        return preferred;
    }
    TcpListener::bind(("0.0.0.0", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(preferred)
}

fn load_pairing_code(data_dir: &PathBuf) -> (String, bool) {
    let _ = fs::create_dir_all(data_dir);
    let code_path = data_dir.join("pairing_code.txt");
    if let Ok(existing) = fs::read_to_string(&code_path) {
        let trimmed = existing.trim().to_string();
        if !trimmed.is_empty() {
            return (trimmed, true);
        }
    }
    let num = (Uuid::new_v4().as_u128() % 9000) + 1000;
    (format!("{:04}", num), false)
}

#[tauri::command]
async fn get_server_info(state: State<'_, AppState>) -> Result<ServerInfo, String> {
    Ok(state.server_info().await)
}

#[tauri::command]
async fn set_pairing_code(
    state: State<'_, AppState>,
    code: String,
) -> Result<ServerInfo, String> {
    state.set_pairing_code(code).await
}

#[tauri::command]
async fn get_online_count(state: State<'_, AppState>) -> Result<usize, String> {
    Ok(state.online_count().await)
}

#[tauri::command]
async fn list_layouts(state: State<'_, AppState>) -> Result<Vec<LayoutConfig>, String> {
    Ok(state.list_layouts().await)
}

#[tauri::command]
async fn save_layout(
    state: State<'_, AppState>,
    layout: LayoutConfig,
) -> Result<LayoutConfig, String> {
    let saved = state.save_layout(layout).await;
    let _ = state.app_handle.emit("layouts-updated", ());
    Ok(saved)
}

#[tauri::command]
async fn delete_layout(state: State<'_, AppState>, layout_id: String) -> Result<(), String> {
    state.delete_layout(&layout_id).await;
    let _ = state.app_handle.emit("layouts-updated", ());
    Ok(())
}

#[tauri::command]
async fn list_local_apps(state: State<'_, AppState>) -> Result<Vec<LocalAppInfo>, String> {
    let icon_cache_dir = {
        let guard = state.inner.read().await;
        guard.icon_cache_dir.clone()
    };
    tokio::task::spawn_blocking(move || scan_local_apps(&icon_cache_dir))
        .await
        .map_err(|e| format!("Failed to scan apps: {}", e))
}

#[tauri::command]
async fn save_custom_image(
    state: State<'_, AppState>,
    bytes: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    let ext = extension
        .trim_start_matches('.')
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    let safe_ext = if ext.is_empty() { "png".to_string() } else { ext };
    let filename = format!("custom_{}.{}", Uuid::new_v4().simple(), safe_ext);

    let dest = {
        let guard = state.inner.read().await;
        guard.icon_cache_dir.join(&filename)
    };

    tokio::fs::write(&dest, &bytes)
        .await
        .map_err(|e| format!("Failed to save image: {}", e))?;

    Ok(format!("/icons/{}", filename))
}

#[tauri::command]
async fn trigger_slot_action(app: tauri::AppHandle, action: SlotAction) -> Result<(), String> {
    tokio::task::spawn_blocking(move || execute_action(&app, &action))
        .await
        .map_err(|e| format!("Action task error: {}", e))?
}

#[tauri::command]
fn check_accessibility_permission(prompt: bool) -> bool {
    crate::actions::is_accessibility_trusted(prompt)
}

#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()
            .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(".deckify-data"));
            let lan_ip = local_ip_address::local_ip()
                .map(|ip| ip.to_string())
                .unwrap_or_else(|_| "127.0.0.1".to_string());
            let port = pick_port(19820);
            let (pairing_code, pairing_configured) = load_pairing_code(&data_dir);

            let state = AppState::new(
                app.handle().clone(),
                data_dir,
                lan_ip,
                port,
                pairing_code,
                pairing_configured,
            );
            app.manage(state.clone());

            let server_state = state.clone();
            tauri::async_runtime::spawn(async move {
                server::start_server(server_state, port).await;
            });

            let stats_state = state;
            tauri::async_runtime::spawn(async move {
                let mut sys = System::new_all();
                let mut networks = Networks::new_with_refreshed_list();
                loop {
                    tokio::time::sleep(Duration::from_millis(1500)).await;
                    sys.refresh_cpu_usage();
                    sys.refresh_memory();
                    networks.refresh();

                    let cpu = sys.global_cpu_usage();
                    let total_mem = sys.total_memory() as f64;
                    let used_mem = sys.used_memory() as f64;
                    let mem_percent = if total_mem > 0.0 {
                        ((used_mem / total_mem) * 100.0) as f32
                    } else {
                        0.0
                    };
                    let mem_used_gb = (used_mem / 1_073_741_824.0) as f32;
                    let mem_total_gb = (total_mem / 1_073_741_824.0) as f32;

                    let mut rx_bytes: u64 = 0;
                    let mut tx_bytes: u64 = 0;
                    for (_name, net) in &networks {
                        rx_bytes = rx_bytes.saturating_add(net.received());
                        tx_bytes = tx_bytes.saturating_add(net.transmitted());
                    }
                    let net_rx_kbps = (rx_bytes as f64) / 1024.0 / 1.5;
                    let net_tx_kbps = (tx_bytes as f64) / 1024.0 / 1.5;

                    let stats = SystemStats {
                        cpu,
                        mem_percent,
                        mem_used_gb,
                        mem_total_gb,
                        net_rx_kbps,
                        net_tx_kbps,
                    };

                    stats_state.broadcast_system_stats(&stats).await;
                    let _ = stats_state.app_handle.emit("system-stats", &stats);
                }
            });

            let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出 Deckify", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Deckify 正在后台运行")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            set_pairing_code,
            get_online_count,
            list_layouts,
            save_layout,
            delete_layout,
            list_local_apps,
            save_custom_image,
            trigger_slot_action,
            check_accessibility_permission,
            open_accessibility_settings,
            open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Deckify");
}
