# Release Notes

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
