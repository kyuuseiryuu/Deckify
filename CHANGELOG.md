# Release Notes

## v1.4.0 (2026-11-15)

### ✨ 新特性 (Features)
- **音源控制组件（SlotAction::AudioOutput）**：
  - Windows 原生 WASAPI 端点快速枚举与毫秒级无感知切换（`IPolicyConfig::SetDefaultEndpoint`，支持媒体/通信多角色）。
  - 支持四种交互模式：混合模式（单击快速轮换，长按 400ms 弹出完整音源浮层）、浮层选择、循环切换、固定指定设备。
  - 支持设备白名单过滤（留空默认轮换所有可用设备）与智能设备图标识别（耳机、扬声器、电视/显示器）。
  - 移动端音源选择浮层（Bottom Sheet Modal）与全双工 WebSocket 音频设备状态实时双向同步。
- **全新悬浮 Emoji 选择面板与表情库扩充**：
  - Emoji 设置升级为图标按钮触发 Portal 悬浮面板，即点即设并自动关闭，支持直接搜索与自定义单 Emoji 快速应用。
  - 预设 Emoji 扩充至 150+ 个，结构化涵盖常用、多媒体、办公开发、游戏娱乐、系统工具、状态徽章与表情手势。
- **现代化 Portal 下拉组件（CustomSelect）**：
  - 全新零外部重型依赖的 React 自定义下拉组件，基于 `createPortal` 挂载至根节点并自带视口空间自动翻转（Auto Flip），彻底杜绝撑开容器或产生多余滚动条。
  - 支持选项图标、徽章标签与选项超 8 项时自动呈现即时过滤搜索框。

### 🐛 修复与优化 (Fixes & Refactors)
- **输入框与表单样式优化**：修复原生复选框宽度继承导致的白名单设备名称隐形与默认标签折行问题；精简 Shell 命令、应用路径与文本输入框的超长占位符文案并添加文本省略。
- **主页排版防挤压**：重构多网卡环境下的 IP 选择器为独立工具条，修复主页标题「扫码连接移动设备」及「本地 HTTPS」推荐徽章与按钮在紧凑视口下被迫折行的问题。
- **全局原生 Select 暗黑美化**：补全全局原生 Select 控件的自定义 SVG 箭头、圆角与暗黑高亮样式。

---

## v1.3.0 (2026-11-15)

### ✨ 新特性 (Features)
- **一键本地 CA 开启 HTTPS**：支持在桌面端生成本地 CA 证书并启用 HTTPS 服务，新增推荐启用说明与二维码地址自动切换。
- **屏幕常亮控制（KeepAwakeControl）**：
  - 支持在移动端控制面板切换「保持不熄屏」（HTTPS 下优先使用原生 Screen Wake Lock API，HTTP 下提供静音媒体保活兼容）。
  - HTTPS 模式下检测到正在充电（或浏览器不支持 Battery API 时按降级策略）默认自动开启常亮，切换时展示轻量 Toast 提示。
- **按钮自定义图标全面升级**：
  - 支持网络图片 URL（`http://` / `https://`）与 Base64 Data URL（`data:image/...`）。
  - 新增 **Emoji 图标** 支持：提供常用 Emoji 快捷选择栏，并支持通过 Unicode 属性正则 + Grapheme 分段校验输入任意单个 Emoji（含组合表情、肤色修饰符、国旗、按键序列等）。
- **配对页面与数字配对码**：
  - 将配对视图独立抽离为 `PairingPage` 组件。
  - 配对码改为纯 6 位数字，配对输入框限定数字输入模式（`inputMode="numeric"`）。
- **macOS 隐藏 Dock 图标**：支持在桌面端设置及系统托盘菜单中切换隐藏/显示 macOS Dock 图标并保持状态同步。

### 🐛 修复与优化 (Fixes & Refactors)
- **iOS PWA 交互优化**：修复 PWA 模式下顶部栏右上角按钮的触摸响应与安全区样式问题。
- **Windows 兼容修复**：修复 Windows 端执行 curl 时弹出命令行窗口的问题，以及 macOS 菜单导入问题。
- **编辑器架构重构**：从 `EditorPage` 抽离全局常量（`src/constants/editor.ts`）及 `SlotIconPicker`、`EditorPalette`、`EditorInspector` 组件，提升可维护性。

---

## v1.2.3
- 更新应用桌面图标、Web/PWA Favicon 与应用截图。

## v1.2.2
- 新增配置 JSON 导出下载反馈提示。

## v1.2.1
- 项目正式更名为 **LanDeck**（`la.ksr.landeck`）。

## v1.2.0
- 新增配置导入 / 导出功能与官网隐私政策页面。
