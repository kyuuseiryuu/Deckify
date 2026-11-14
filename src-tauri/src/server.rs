use std::net::SocketAddr;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path as AxumPath, State,
    },
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use rust_embed::RustEmbed;
use tauri::Emitter;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::actions::execute_action;
use crate::models::{SlotAction, WsClientMsg, WsServerMsg};
use crate::state::AppState;

#[derive(RustEmbed)]
#[folder = "../dist"]
struct FrontendAssets;

pub async fn start_server(state: AppState, port: u16) {
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/manifest.webmanifest", get(serve_manifest))
        .route("/icons/:filename", get(serve_icon))
        .fallback(serve_frontend)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
        let _ = axum::serve(listener, app).await;
    }
}

async fn serve_manifest() -> Response {
    let manifest = serde_json::json!({
        "name": "LanDeck",
        "short_name": "LanDeck",
        "start_url": "/deck",
        "scope": "/deck",
        "display": "standalone",
        "background_color": "#0b0f19",
        "theme_color": "#0b0f19",
        "orientation": "any"
    });

    (
        [
            (header::CONTENT_TYPE, "application/manifest+json; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        manifest.to_string(),
    )
        .into_response()
}

async fn serve_icon(
    State(state): State<AppState>,
    AxumPath(filename): AxumPath<String>,
) -> Response {
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return StatusCode::BAD_REQUEST.into_response();
    }

    let icon_path = {
        let guard = state.inner.read().await;
        guard.icon_cache_dir.join(&filename)
    };

    match tokio::fs::read(&icon_path).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&icon_path)
                .first_or_octet_stream()
                .to_string();
            ([(header::CONTENT_TYPE, mime)], bytes).into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn serve_frontend(uri: Uri) -> Response {
    let raw_path = uri.path().trim_start_matches('/');
    let path = if raw_path.is_empty() || raw_path == "deck" || raw_path.starts_with("deck/") {
        "index.html"
    } else {
        raw_path
    };

    if let Some(content) = FrontendAssets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        ([(header::CONTENT_TYPE, mime.as_ref())], content.data).into_response()
    } else if let Some(index) = FrontendAssets::get("index.html") {
        ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], index.data).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            "Frontend assets not built yet. Run `npm run build`.",
        )
            .into_response()
    }
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let conn_id = Uuid::new_v4().to_string();
    let mut authenticated = false;

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = ws_rx.next().await {
        let Message::Text(text) = msg else {
            continue;
        };

        let Ok(parsed) = serde_json::from_str::<WsClientMsg>(&text) else {
            continue;
        };

        match parsed {
            WsClientMsg::Register {
                code,
                selected_layout_id,
            } => {
                if !state.verify_pairing_code(&code).await {
                    if let Ok(json) = serde_json::to_string(&WsServerMsg::AuthError {
                        message: "配对码错误，请核对桌面端显示的配对码".into(),
                    }) {
                        let _ = tx.send(json);
                    }
                    break;
                }

                authenticated = true;
                let (layouts, selected) = state
                    .register_connection(conn_id.clone(), tx.clone(), selected_layout_id)
                    .await;

                if let Ok(json) = serde_json::to_string(&WsServerMsg::LayoutsList { layouts }) {
                    let _ = tx.send(json);
                }
                if let Some(layout) = selected {
                    if let Ok(json) = serde_json::to_string(&WsServerMsg::LayoutSync { layout }) {
                        let _ = tx.send(json);
                    }
                }
                let _ = state.app_handle.emit("clients-updated", ());
            }
            WsClientMsg::Trigger { layout_id, slot_id } => {
                if !authenticated {
                    continue;
                }
                let action_opt = {
                    let guard = state.inner.read().await;
                    guard
                        .layouts
                        .get(&layout_id)
                        .and_then(|l| l.slots.iter().find(|s| s.id == slot_id))
                        .map(|s| s.action.clone())
                };

                let result = match action_opt {
                    Some(SlotAction::SwitchLayout {
                        layout_id: target_id,
                    }) => {
                        let target_layout = {
                            let guard = state.inner.read().await;
                            guard.layouts.get(&target_id).cloned()
                        };
                        if let Some(layout) = target_layout {
                            if let Ok(json) =
                                serde_json::to_string(&WsServerMsg::LayoutSync { layout })
                            {
                                let _ = tx.send(json);
                            }
                            Ok(())
                        } else {
                            Err("目标布局配置不存在".into())
                        }
                    }
                    Some(action) => {
                        let app_handle = state.app_handle.clone();
                        tokio::task::spawn_blocking(move || execute_action(&app_handle, &action))
                            .await
                            .unwrap_or_else(|e| Err(format!("Task panic: {}", e)))
                    }
                    None => Err("Slot not found".into()),
                };

                let reply = match result {
                    Ok(()) => WsServerMsg::ActionResult {
                        slot_id,
                        ok: true,
                        error: None,
                    },
                    Err(err) => WsServerMsg::ActionResult {
                        slot_id,
                        ok: false,
                        error: Some(err),
                    },
                };

                if let Ok(json) = serde_json::to_string(&reply) {
                    let _ = tx.send(json);
                }
            }
            WsClientMsg::Ping => {
                if let Ok(json) = serde_json::to_string(&WsServerMsg::Pong) {
                    let _ = tx.send(json);
                }
            }
        }
    }

    if authenticated {
        state.unregister_connection(&conn_id).await;
        let _ = state.app_handle.emit("clients-updated", ());
    }

    send_task.abort();
}
