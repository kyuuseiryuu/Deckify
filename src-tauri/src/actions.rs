use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use enigo::{Direction, Enigo, Key, Keyboard, Settings};

use crate::models::SlotAction;

#[cfg(target_os = "macos")]
pub fn is_accessibility_trusted(prompt: bool) -> bool {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    static PROMPTED: AtomicBool = AtomicBool::new(false);

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
        static kAXTrustedCheckOptionPrompt: *const c_void;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        static kCFBooleanTrue: *const c_void;
        static kCFTypeDictionaryKeyCallBacks: c_void;
        static kCFTypeDictionaryValueCallBacks: c_void;
        fn CFDictionaryCreate(
            allocator: *const c_void,
            keys: *const *const c_void,
            values: *const *const c_void,
            num_values: isize,
            key_callbacks: *const c_void,
            value_callbacks: *const c_void,
        ) -> *const c_void;
        fn CFRelease(cf: *const c_void);
    }

    unsafe {
        if AXIsProcessTrusted() {
            return true;
        }
        if prompt && !PROMPTED.swap(true, Ordering::SeqCst) {
            let keys = [kAXTrustedCheckOptionPrompt];
            let values = [kCFBooleanTrue];
            let dict = CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                1,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );
            let trusted = AXIsProcessTrustedWithOptions(dict);
            if !dict.is_null() {
                CFRelease(dict);
            }
            return trusted;
        }
        false
    }
}

#[cfg(not(target_os = "macos"))]
pub fn is_accessibility_trusted(_prompt: bool) -> bool {
    true
}

fn run_enigo_on_main<F>(app: &tauri::AppHandle, f: F) -> Result<(), String>
where
    F: FnOnce(&mut Enigo) -> Result<(), String> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        if !is_accessibility_trusted(true) {
            let _ = tx.send(Err(
                "缺少 macOS 辅助功能权限：请在「系统设置 → 隐私与安全性 → 辅助功能」中开启 Deckify（重新打包后需先移除旧项再重新添加）".into(),
            ));
            return;
        }
        let res = match Enigo::new(&Settings::default()) {
            Ok(mut enigo) => f(&mut enigo),
            Err(e) => Err(format!("Input init failed (请检查辅助功能权限): {}", e)),
        };
        let _ = tx.send(res);
    })
    .map_err(|e| format!("Failed to dispatch to main thread: {}", e))?;

    rx.recv()
        .unwrap_or_else(|e| Err(format!("Main thread reply error: {}", e)))
}

pub fn execute_action(app: &tauri::AppHandle, action: &SlotAction) -> Result<(), String> {
    match action {
        SlotAction::App { path, .. } => {
            #[cfg(target_os = "macos")]
            {
                let status = Command::new("open")
                    .arg("-a")
                    .arg(path)
                    .status()
                    .map_err(|e| format!("Failed to launch app: {}", e))?;
                if !status.success() {
                    return Err(format!("open -a exited with status {}", status));
                }
                Ok(())
            }
            #[cfg(not(target_os = "macos"))]
            {
                Command::new(path)
                    .spawn()
                    .map_err(|e| format!("Failed to launch app: {}", e))?;
                Ok(())
            }
        }
        SlotAction::Hotkey {
            modifiers,
            key,
            repeat_count,
        } => trigger_hotkey(app, modifiers, key, *repeat_count),
        SlotAction::Text { text, auto_enter } => trigger_text(app, text, *auto_enter),
        SlotAction::Image { .. }
        | SlotAction::Monitor { .. }
        | SlotAction::SwitchLayout { .. } => Ok(()),
        SlotAction::Media { control } => trigger_media(app, control),
        SlotAction::Webhook { url, method, body } => trigger_webhook(url, method, body),
        SlotAction::Macro { steps } => {
            for (idx, step) in steps.iter().enumerate() {
                execute_action(app, &step.action)
                    .map_err(|e| format!("步骤 {} 执行失败: {}", idx + 1, e))?;
                if step.delay_ms > 0 {
                    thread::sleep(Duration::from_millis(step.delay_ms.min(10_000)));
                }
            }
            Ok(())
        }
        SlotAction::Url { url } => {
            #[cfg(target_os = "macos")]
            {
                Command::new("open")
                    .arg(url)
                    .spawn()
                    .map_err(|e| format!("Failed to open URL: {}", e))?;
                Ok(())
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = url;
                Err("URL action not implemented on this OS".into())
            }
        }
        SlotAction::Command { command } => {
            Command::new("sh")
                .arg("-c")
                .arg(command)
                .spawn()
                .map_err(|e| format!("Failed to run command: {}", e))?;
            Ok(())
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_modifier_spec(m: &str) -> Option<(u16, u64)> {
    match m.to_lowercase().as_str() {
        "cmd" | "command" | "meta" | "super" => Some((0x37, 0x0010_0000)),
        "shift" => Some((0x38, 0x0002_0000)),
        "alt" | "option" => Some((0x3A, 0x0008_0000)),
        "ctrl" | "control" => Some((0x3B, 0x0004_0000)),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn macos_key_code(k: &str) -> Option<u16> {
    match k.trim().to_lowercase().as_str() {
        "a" => Some(0x00),
        "s" => Some(0x01),
        "d" => Some(0x02),
        "f" => Some(0x03),
        "h" => Some(0x04),
        "g" => Some(0x05),
        "z" => Some(0x06),
        "x" => Some(0x07),
        "c" => Some(0x08),
        "v" => Some(0x09),
        "b" => Some(0x0B),
        "q" => Some(0x0C),
        "w" => Some(0x0D),
        "e" => Some(0x0E),
        "r" => Some(0x0F),
        "y" => Some(0x10),
        "t" => Some(0x11),
        "1" => Some(0x12),
        "2" => Some(0x13),
        "3" => Some(0x14),
        "4" => Some(0x15),
        "6" => Some(0x16),
        "5" => Some(0x17),
        "=" | "equal" => Some(0x18),
        "9" => Some(0x19),
        "7" => Some(0x1A),
        "-" | "minus" => Some(0x1B),
        "8" => Some(0x1C),
        "0" => Some(0x1D),
        "]" | "bracketright" => Some(0x1E),
        "o" => Some(0x1F),
        "u" => Some(0x20),
        "[" | "bracketleft" => Some(0x21),
        "i" => Some(0x22),
        "p" => Some(0x23),
        "enter" | "return" => Some(0x24),
        "l" => Some(0x25),
        "j" => Some(0x26),
        "'" | "quote" => Some(0x27),
        "k" => Some(0x28),
        ";" | "semicolon" => Some(0x29),
        "\\" | "backslash" => Some(0x2A),
        "," | "comma" => Some(0x2B),
        "/" | "slash" => Some(0x2C),
        "n" => Some(0x2D),
        "m" => Some(0x2E),
        "." | "period" => Some(0x2F),
        "tab" => Some(0x30),
        "space" | " " => Some(0x31),
        "`" | "backquote" | "grave" => Some(0x32),
        "backspace" => Some(0x33),
        "esc" | "escape" => Some(0x35),
        "f1" => Some(0x7A),
        "f2" => Some(0x78),
        "f3" => Some(0x63),
        "f4" => Some(0x76),
        "f5" => Some(0x60),
        "f6" => Some(0x61),
        "f7" => Some(0x62),
        "f8" => Some(0x64),
        "f9" => Some(0x65),
        "f10" => Some(0x6D),
        "f11" => Some(0x67),
        "f12" => Some(0x6F),
        "home" => Some(0x73),
        "pageup" => Some(0x74),
        "delete" => Some(0x75),
        "end" => Some(0x77),
        "pagedown" => Some(0x79),
        "left" | "arrowleft" => Some(0x7B),
        "right" | "arrowright" => Some(0x7C),
        "down" | "arrowdown" => Some(0x7D),
        "up" | "arrowup" => Some(0x7E),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn trigger_macos_hotkey(
    app: &tauri::AppHandle,
    modifiers: &[String],
    key: &str,
    repeat_count: usize,
) -> Result<bool, String> {
    use std::ffi::c_void;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceCreate(state_id: i32) -> *const c_void;
        fn CGEventCreateKeyboardEvent(
            source: *const c_void,
            virtual_key: u16,
            key_down: bool,
        ) -> *mut c_void;
        fn CGEventSetFlags(event: *mut c_void, flags: u64);
        fn CGEventPost(tap: u32, event: *mut c_void);
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const c_void);
    }

    let mod_specs: Vec<(u16, u64)> = modifiers
        .iter()
        .filter_map(|m| macos_modifier_spec(m))
        .collect();

    let trimmed_key = key.trim();
    let is_modifier_only = trimmed_key.is_empty() || trimmed_key.eq_ignore_ascii_case("none");

    let key_code_opt = if is_modifier_only {
        if mod_specs.is_empty() {
            return Err("No key or modifier specified".into());
        }
        None
    } else {
        match macos_key_code(trimmed_key) {
            Some(code) => Some(code),
            None => return Ok(false),
        }
    };

    let count = repeat_count.max(1);
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        if !is_accessibility_trusted(true) {
            let _ = tx.send(Err(
                "缺少 macOS 辅助功能权限：请在「系统设置 → 隐私与安全性 → 辅助功能」中开启 Deckify（重新打包后需先移除旧项再重新添加）".into(),
            ));
            return;
        }

        unsafe {
            // kCGEventSourceStateHIDSystemState = 1, kCGHIDEventTap = 0
            let source = CGEventSourceCreate(1);
            let post_key = |vk: u16, down: bool, flags: u64| {
                let ev = CGEventCreateKeyboardEvent(source, vk, down);
                if !ev.is_null() {
                    CGEventSetFlags(ev, flags);
                    CGEventPost(0, ev);
                    CFRelease(ev.cast());
                }
            };

            let all_flags: u64 = mod_specs.iter().fold(0, |acc, (_, f)| acc | *f);

            for i in 0..count {
                if let Some(vk) = key_code_opt {
                    let mut cur_flags = 0u64;
                    for (mk, mf) in &mod_specs {
                        cur_flags |= *mf;
                        post_key(*mk, true, cur_flags);
                    }
                    post_key(vk, true, all_flags);
                    thread::sleep(Duration::from_millis(12));
                    post_key(vk, false, all_flags);
                    for (mk, mf) in mod_specs.iter().rev() {
                        cur_flags &= !*mf;
                        post_key(*mk, false, cur_flags);
                    }
                } else {
                    for (mk, mf) in &mod_specs {
                        post_key(*mk, true, *mf);
                        thread::sleep(Duration::from_millis(20));
                        post_key(*mk, false, 0);
                    }
                }

                if i + 1 < count {
                    thread::sleep(Duration::from_millis(75));
                }
            }

            if !source.is_null() {
                CFRelease(source);
            }
        }

        let _ = tx.send(Ok(true));
    })
    .map_err(|e| format!("Failed to dispatch to main thread: {}", e))?;

    rx.recv()
        .unwrap_or_else(|e| Err(format!("Main thread reply error: {}", e)))
}

fn trigger_text(app: &tauri::AppHandle, text: &str, auto_enter: bool) -> Result<(), String> {
    if text.is_empty() && !auto_enter {
        return Err("文本内容不能为空".into());
    }
    if !text.is_empty() {
        let content = text.to_string();
        run_enigo_on_main(app, move |enigo| {
            enigo
                .text(&content)
                .map_err(|e| format!("文本输入失败: {}", e))
        })?;
    }
    if auto_enter {
        thread::sleep(Duration::from_millis(20));
        trigger_hotkey(app, &[], "enter", 1)?;
    }
    Ok(())
}

fn trigger_hotkey(
    app: &tauri::AppHandle,
    modifiers: &[String],
    key: &str,
    repeat_count: usize,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if trigger_macos_hotkey(app, modifiers, key, repeat_count)? {
            return Ok(());
        }
    }

    let mut mod_keys = Vec::new();
    for m in modifiers {
        if let Some(k) = parse_modifier(m) {
            mod_keys.push(k);
        }
    }

    let trimmed_key = key.trim();
    let is_modifier_only = trimmed_key.is_empty() || trimmed_key.eq_ignore_ascii_case("none");
    let main_key = if is_modifier_only {
        if mod_keys.is_empty() {
            return Err("No key or modifier specified".into());
        }
        None
    } else {
        Some(parse_main_key(trimmed_key)?)
    };

    let count = repeat_count.max(1);
    for i in 0..count {
        let mods_clone = mod_keys.clone();
        run_enigo_on_main(app, move |enigo| {
            if let Some(mk) = main_key {
                for k in &mods_clone {
                    enigo
                        .key(*k, Direction::Press)
                        .map_err(|e| format!("Modifier press failed: {}", e))?;
                }
                enigo
                    .key(mk, Direction::Click)
                    .map_err(|e| format!("Key click failed: {}", e))?;
                for k in mods_clone.iter().rev() {
                    let _ = enigo.key(*k, Direction::Release);
                }
            } else {
                for k in &mods_clone {
                    enigo
                        .key(*k, Direction::Click)
                        .map_err(|e| format!("Modifier click failed: {}", e))?;
                }
            }
            Ok(())
        })?;

        if i + 1 < count {
            thread::sleep(Duration::from_millis(60));
        }
    }

    Ok(())
}

fn trigger_media(app: &tauri::AppHandle, control: &str) -> Result<(), String> {
    match control {
        "vol_up" | "vol_down" | "mute" => {
            #[cfg(target_os = "macos")]
            {
                let script = match control {
                    "vol_up" => "set volume output volume ((output volume of (get volume settings)) + 6)",
                    "vol_down" => "set volume output volume ((output volume of (get volume settings)) - 6)",
                    _ => "set volume output muted (not (output muted of (get volume settings)))",
                };
                let status = Command::new("osascript")
                    .arg("-e")
                    .arg(script)
                    .status()
                    .map_err(|e| format!("osascript failed: {}", e))?;
                if !status.success() {
                    return Err("调节音量失败".into());
                }
                Ok(())
            }
            #[cfg(not(target_os = "macos"))]
            {
                Err("Media volume control only implemented on macOS".into())
            }
        }
        "play_pause" | "next" | "prev" => {
            let key = match control {
                "play_pause" => Key::MediaPlayPause,
                "next" => Key::MediaNextTrack,
                _ => Key::MediaPrevTrack,
            };
            run_enigo_on_main(app, move |enigo| {
                enigo
                    .key(key, Direction::Click)
                    .map_err(|e| format!("媒体按键触发失败: {}", e))
            })
        }
        _ => Err(format!("Unsupported media control: {}", control)),
    }
}

fn trigger_webhook(url: &str, method: &str, body: &str) -> Result<(), String> {
    let clean_url = url.trim();
    if clean_url.is_empty() {
        return Err("Webhook URL 不能为空".into());
    }
    let upper_method = method.trim().to_uppercase();
    let http_method = if upper_method.is_empty() {
        "GET".to_string()
    } else {
        upper_method
    };

    let mut cmd = Command::new("curl");
    cmd.arg("-sS")
        .arg("-f")
        .arg("--max-time")
        .arg("10")
        .arg("-X")
        .arg(&http_method);

    if !body.trim().is_empty() && http_method != "GET" {
        cmd.arg("-H")
            .arg("Content-Type: application/json")
            .arg("-d")
            .arg(body);
    }

    let out = cmd
        .arg(clean_url)
        .output()
        .map_err(|e| format!("Webhook 请求失败: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("Webhook 错误: {}", stderr.trim()));
    }
    Ok(())
}

fn parse_modifier(m: &str) -> Option<Key> {
    match m.to_lowercase().as_str() {
        "cmd" | "command" | "meta" | "super" => Some(Key::Meta),
        "ctrl" | "control" => Some(Key::Control),
        "alt" | "option" => Some(Key::Alt),
        "shift" => Some(Key::Shift),
        _ => None,
    }
}

fn parse_main_key(k: &str) -> Result<Key, String> {
    let lower = k.trim().to_lowercase();
    match lower.as_str() {
        "space" | " " => Ok(Key::Space),
        "enter" | "return" => Ok(Key::Return),
        "tab" => Ok(Key::Tab),
        "esc" | "escape" => Ok(Key::Escape),
        "backspace" => Ok(Key::Backspace),
        "delete" => Ok(Key::Delete),
        "up" | "arrowup" => Ok(Key::UpArrow),
        "down" | "arrowdown" => Ok(Key::DownArrow),
        "left" | "arrowleft" => Ok(Key::LeftArrow),
        "right" | "arrowright" => Ok(Key::RightArrow),
        "home" => Ok(Key::Home),
        "end" => Ok(Key::End),
        "pageup" => Ok(Key::PageUp),
        "pagedown" => Ok(Key::PageDown),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),
        "backquote" | "grave" => Ok(Key::Unicode('`')),
        "minus" => Ok(Key::Unicode('-')),
        "equal" => Ok(Key::Unicode('=')),
        "bracketleft" => Ok(Key::Unicode('[')),
        "bracketright" => Ok(Key::Unicode(']')),
        "backslash" => Ok(Key::Unicode('\\')),
        "semicolon" => Ok(Key::Unicode(';')),
        "quote" => Ok(Key::Unicode('\'')),
        "comma" => Ok(Key::Unicode(',')),
        "period" => Ok(Key::Unicode('.')),
        "slash" => Ok(Key::Unicode('/')),
        _ => {
            let mut chars = lower.chars();
            if let (Some(ch), None) = (chars.next(), chars.next()) {
                Ok(Key::Unicode(ch))
            } else {
                Err(format!("Unsupported key: {}", k))
            }
        }
    }
}
