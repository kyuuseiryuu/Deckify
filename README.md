# Deckify

**Deckify** 是一款基于 **Tauri 2 + Rust + React** 构建的桌面端智能控制面板应用，可以将同一局域网内的手机、平板等移动设备变为可自由定制的触控快捷控制台（类似 Stream Deck）。

桌面端内置轻量级 HTTP 与 WebSocket 服务并内嵌移动端页面，移动端无需安装额外客户端，打开浏览器扫码（支持 PWA 添加到主屏幕）并输入配对码即可实时同步面板布局并远程触发桌面操作。

---

## 核心特性

- **零客户端移动控制端（Web / PWA）**
  - 桌面端启动时自动开启局域网 HTTP + WebSocket 服务（默认端口 `19820`，被占用时自动分配可用端口），并生成连接二维码。
  - 支持配对码验证与自定义配对码，实时显示在线设备数量，支持多布局同步切换。
  - 提供 `manifest.webmanifest`，可将 `/deck` 页面添加到手机主屏幕以接近原生应用的全屏体验运行。
- **可视化网格布局编辑器**
  - 支持多套布局配置的新建、复制、删除与实时同步。
  - 支持自定义画布尺寸、网格行列数（`cols` / `rows`）以及单个按键的跨列/跨行尺寸（`colSpan` / `rowSpan`）。
  - 支持自定义按键标签、字体大小、背景色、系统应用图标以及本地自定义图片上传。
  - 支持浅色 / 深色主题切换，桌面端关闭主窗口后自动最小化到系统托盘后台运行。
- **丰富的动作类型**
  - **应用启动（App）**：自动扫描本地已安装应用并提取图标，一键启动或切换应用。
  - **快捷键（Hotkey）**：模拟组合快捷键触发，支持设置重复次数。
  - **文本输入（Text）**：自动输入预设文本内容，支持自动追加回车发送。
  - **媒体控制（Media）**：支持播放/暂停、上一曲、下一曲、音量加/减、静音。
  - **系统监控（Monitor）**：每 1.5 秒实时推送并展示桌面端 CPU 使用率、内存占用及网络上下行速率。
  - **宏指令（Macro）**：将多个动作与自定义延迟（`delayMs`）编排为自动化工作流。
  - **布局切换（Switch Layout）**：在移动端一键跳转到指定控制面板。
  - **打开链接（URL）**：在桌面端默认浏览器打开指定网址。
  - **终端命令（Command）**：执行自定义 Shell 命令。
  - **Webhook**：向指定 URL 发送 HTTP 请求（支持自定义请求方法与请求体）。
  - **图片展示（Image）**：在按键位展示图片，支持定时刷新。

---

## 技术栈

- **桌面壳与后端**：[Tauri 2](https://tauri.app/)、Rust（`axum` Web/WebSocket 服务、`tokio`、`rust-embed`、`enigo` 键鼠模拟、`sysinfo` 系统监控、`local-ip-address`、Windows GDI+ / Shell 图标提取与进程管理、macOS `plist`）
- **前端**：React 19、TypeScript、Vite 6、`lucide-react`、`qrcode.react`

---

## 目录结构

```text
Deckify/
├── src/                        # React + TypeScript 前端（桌面端管理界面 & 移动端 /deck 控制界面）
│   ├── components/             # HomePage、EditorPage、DeckPage、MonitorTile 等组件
│   ├── utils/                  # 网格计算、图片路径、主题工具
│   ├── api.ts                  # Tauri IPC 调用封装
│   └── types.ts                # 布局、动作与 WebSocket 消息类型定义
├── src-tauri/                  # Tauri 2 / Rust 后端
│   ├── src/
│   │   ├── lib.rs              # Tauri 入口、系统托盘、IPC 命令、系统状态广播
│   │   ├── server.rs           # Axum HTTP/WebSocket 服务与静态资源嵌入
│   │   ├── actions.rs          # 各类动作执行器（应用、快捷键、宏、命令等）
│   │   ├── apps.rs             # 本地应用扫描与图标提取
│   │   ├── models.rs           # 数据模型与 WebSocket 协议定义
│   │   └── state.rs            # 应用状态、布局持久化与连接管理
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.ts
```

---

## 快速开始

### 环境要求

- **Node.js**（建议 18+）与 **npm**
- **Rust** 工具链（`rustc` / `cargo`）
- **Tauri 2 系统依赖**（Windows 需 WebView2 及 C++ Build Tools；macOS 需安装 Xcode Command Line Tools；其他平台请参考 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/)）

### 安装依赖

```bash
npm install
```

### 开发模式运行

```bash
npm run tauri dev
```

### 构建桌面应用

> 注意：Rust 后端通过 `rust-embed` 将 `dist/` 目录打包进服务端以供移动端访问，构建时请先确保前端已编译或直接使用 Tauri 构建命令（`tauri.conf.json` 已配置 `beforeBuildCommand: "npm run build"`）。

```bash
# 构建默认安装包
npm run tauri build

# 构建 Windows 安装包 (NSIS)
npm run build-win

# 仅构建 macOS .app 包
npm run build-app
```

---

## 使用说明

1. 启动 Deckify 桌面端后，确保手机/平板与电脑处于**同一局域网**。
2. 使用移动设备扫描桌面端首页显示的二维码（或手动访问提示的局域网地址 `/deck`），输入配对码完成连接。
3. 在桌面端新建或编辑控制面板布局，配置按键动作并保存，移动端会自动同步最新布局。
4. **系统权限说明**：
   - **Windows**：开箱即用，无需额外配置辅助功能权限。
   - **macOS**：若使用「快捷键」或「文本输入」等模拟键盘操作，请在系统弹窗或「系统设置 → 隐私与安全性 → 辅助功能」中为 Deckify 授予辅助功能权限。
