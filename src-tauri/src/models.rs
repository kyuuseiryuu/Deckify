use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub lan_ip: String,
    pub port: u16,
    pub pairing_code: String,
    pub pairing_configured: bool,
    pub mobile_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroStep {
    pub action: Box<SlotAction>,
    #[serde(default, rename = "delayMs")]
    pub delay_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SlotAction {
    App {
        name: String,
        path: String,
    },
    Hotkey {
        modifiers: Vec<String>,
        key: String,
        #[serde(default = "default_span", rename = "repeatCount")]
        repeat_count: usize,
    },
    Text {
        text: String,
        #[serde(default, rename = "autoEnter")]
        auto_enter: bool,
    },
    Image {
        #[serde(default)]
        note: String,
        #[serde(default, rename = "refreshInterval")]
        refresh_interval: u64,
    },
    Monitor {
        metric: String,
    },
    SwitchLayout {
        #[serde(rename = "layoutId")]
        layout_id: String,
    },
    Media {
        control: String,
    },
    Webhook {
        url: String,
        #[serde(default = "default_method")]
        method: String,
        #[serde(default)]
        body: String,
    },
    Macro {
        steps: Vec<MacroStep>,
    },
    Url {
        url: String,
    },
    Command {
        command: String,
    },
}

fn default_method() -> String {
    "GET".to_string()
}

fn default_span() -> usize {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckSlot {
    pub id: String,
    pub index: usize,
    pub label: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    #[serde(default = "default_span")]
    pub col_span: usize,
    #[serde(default = "default_span")]
    pub row_span: usize,
    #[serde(default, rename = "fontSize")]
    pub font_size: Option<u32>,
    pub action: SlotAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutConfig {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub cols: usize,
    pub rows: usize,
    pub slots: Vec<DeckSlot>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAppInfo {
    pub name: String,
    pub path: String,
    pub bundle_id: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu: f32,
    pub mem_percent: f32,
    pub mem_used_gb: f32,
    pub mem_total_gb: f32,
    pub net_rx_kbps: f64,
    pub net_tx_kbps: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WsClientMsg {
    Register {
        code: String,
        #[serde(rename = "selectedLayoutId")]
        selected_layout_id: Option<String>,
    },
    Trigger {
        #[serde(rename = "layoutId")]
        layout_id: String,
        #[serde(rename = "slotId")]
        slot_id: String,
    },
    Ping,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WsServerMsg {
    LayoutsList {
        layouts: Vec<LayoutConfig>,
    },
    LayoutSync {
        layout: LayoutConfig,
    },
    ActionResult {
        #[serde(rename = "slotId")]
        slot_id: String,
        ok: bool,
        error: Option<String>,
    },
    SystemStats {
        stats: SystemStats,
    },
    Pong,
    AuthError {
        message: String,
    },
    Error {
        message: String,
    },
}
