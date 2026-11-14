use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use crate::models::LocalAppInfo;

#[cfg(target_os = "macos")]
pub fn scan_local_apps(icon_cache_dir: &Path) -> Vec<LocalAppInfo> {
    let mut apps = Vec::new();
    let mut search_dirs = vec![PathBuf::from("/Applications")];

    if let Ok(home) = std::env::var("HOME") {
        search_dirs.push(PathBuf::from(home).join("Applications"));
    }

    for dir in search_dirs {
        if dir.exists() {
            collect_macos_apps_in_dir(&dir, icon_cache_dir, &mut apps, 0);
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.path == b.path);
    apps
}

#[cfg(target_os = "macos")]
fn collect_macos_apps_in_dir(
    dir: &Path,
    icon_cache_dir: &Path,
    out: &mut Vec<LocalAppInfo>,
    depth: usize,
) {
    if depth > 2 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) == Some("app") {
            if let Some(info) = parse_macos_app(&path, icon_cache_dir) {
                out.push(info);
            }
        } else if depth < 2 {
            collect_macos_apps_in_dir(&path, icon_cache_dir, out, depth + 1);
        }
    }
}

#[cfg(target_os = "macos")]
fn parse_macos_app(app_path: &Path, icon_cache_dir: &Path) -> Option<LocalAppInfo> {
    let contents_dir = app_path.join("Contents");
    let info_plist_path = contents_dir.join("Info.plist");
    let fallback_name = app_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let (name, bundle_id, icon_file) = if let Ok(val) = plist::Value::from_file(&info_plist_path) {
        let dict = val.as_dictionary();
        let display_name = dict
            .and_then(|d| {
                d.get("CFBundleDisplayName")
                    .or_else(|| d.get("CFBundleName"))
                    .and_then(|v| v.as_string())
            })
            .map(|s| s.to_string())
            .unwrap_or_else(|| fallback_name.clone());

        let bundle_id = dict
            .and_then(|d| d.get("CFBundleIdentifier"))
            .and_then(|v| v.as_string())
            .map(|s| s.to_string());

        let icon_file = dict
            .and_then(|d| {
                d.get("CFBundleIconFile")
                    .or_else(|| d.get("CFBundleIconName"))
                    .and_then(|v| v.as_string())
            })
            .map(|s| s.to_string());

        (display_name, bundle_id, icon_file)
    } else {
        (fallback_name, None, None)
    };

    let icon = extract_macos_app_icon(&contents_dir, icon_file.as_deref(), app_path, icon_cache_dir);

    Some(LocalAppInfo {
        name,
        path: app_path.to_string_lossy().to_string(),
        bundle_id,
        icon,
    })
}

#[cfg(target_os = "macos")]
fn extract_macos_app_icon(
    contents_dir: &Path,
    icon_name: Option<&str>,
    app_path: &Path,
    icon_cache_dir: &Path,
) -> Option<String> {
    use std::process::Command;

    let resources_dir = contents_dir.join("Resources");
    if !resources_dir.exists() {
        return None;
    }

    let mut candidate: Option<PathBuf> = None;
    if let Some(name) = icon_name {
        let with_ext = if name.ends_with(".icns") {
            name.to_string()
        } else {
            format!("{}.icns", name)
        };
        let p = resources_dir.join(&with_ext);
        if p.exists() {
            candidate = Some(p);
        }
    }

    if candidate.is_none() {
        if let Ok(entries) = fs::read_dir(&resources_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().and_then(|e| e.to_str()) == Some("icns") {
                    candidate = Some(p);
                    break;
                }
            }
        }
    }

    let icns_path = candidate?;
    let mut hasher = DefaultHasher::new();
    app_path.to_string_lossy().hash(&mut hasher);
    let cache_filename = format!("app_{:x}.png", hasher.finish());
    let cached_png = icon_cache_dir.join(&cache_filename);

    if !cached_png.exists() {
        let status = Command::new("/usr/bin/sips")
            .arg("-s")
            .arg("format")
            .arg("png")
            .arg("-z")
            .arg("128")
            .arg("128")
            .arg(&icns_path)
            .arg("--out")
            .arg(&cached_png)
            .output()
            .ok()?;

        if !status.status.success() || !cached_png.exists() {
            return None;
        }
    }

    Some(format!("/icons/{}", cache_filename))
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct SHFILEINFOW {
    h_icon: *mut std::ffi::c_void,
    i_icon: i32,
    dw_attributes: u32,
    sz_display_name: [u16; 260],
    sz_type_name: [u16; 80],
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct GdiplusStartupInput {
    gdiplus_version: u32,
    debug_event_callback: *const std::ffi::c_void,
    suppress_background_thread: i32,
    suppress_external_codecs: i32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct GUID {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

#[cfg(target_os = "windows")]
#[link(name = "shell32")]
#[link(name = "user32")]
#[link(name = "gdiplus")]
#[link(name = "comctl32")]
extern "system" {
    fn SHGetFileInfoW(
        psz_path: *const u16,
        dw_file_attributes: u32,
        psfi: *mut SHFILEINFOW,
        cb_file_info: u32,
        u_flags: u32,
    ) -> usize;
    fn DestroyIcon(h_icon: *mut std::ffi::c_void) -> i32;
    fn ImageList_GetIcon(himl: *mut std::ffi::c_void, i: i32, flags: u32) -> *mut std::ffi::c_void;
    fn SHGetImageList(i_image_list: i32, riid: *const GUID, ppv: *mut *mut std::ffi::c_void) -> i32;
    fn GdiplusStartup(
        token: *mut usize,
        input: *const GdiplusStartupInput,
        output: *mut std::ffi::c_void,
    ) -> i32;
    fn GdipCreateBitmapFromHICON(
        h_icon: *mut std::ffi::c_void,
        bitmap: *mut *mut std::ffi::c_void,
    ) -> i32;
    fn GdipSaveImageToFile(
        image: *mut std::ffi::c_void,
        filename: *const u16,
        clsid_encoder: *const GUID,
        encoder_params: *const std::ffi::c_void,
    ) -> i32;
    fn GdipDisposeImage(image: *mut std::ffi::c_void) -> i32;
}

#[cfg(target_os = "windows")]
pub fn scan_local_apps(icon_cache_dir: &Path) -> Vec<LocalAppInfo> {
    let mut apps = Vec::new();
    let mut search_dirs = Vec::new();

    if let Ok(progdata) = std::env::var("ProgramData") {
        search_dirs.push(PathBuf::from(progdata).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        search_dirs.push(PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Ok(pub_desk) = std::env::var("PUBLIC") {
        search_dirs.push(PathBuf::from(pub_desk).join("Desktop"));
    }
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        search_dirs.push(PathBuf::from(userprofile).join("Desktop"));
    }

    for dir in search_dirs {
        if dir.exists() {
            collect_windows_apps_in_dir(&dir, icon_cache_dir, &mut apps, 0);
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name) || a.path == b.path);
    apps
}

#[cfg(target_os = "windows")]
fn collect_windows_apps_in_dir(
    dir: &Path,
    icon_cache_dir: &Path,
    out: &mut Vec<LocalAppInfo>,
    depth: usize,
) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_windows_apps_in_dir(&path, icon_cache_dir, out, depth + 1);
            continue;
        }

        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };

        let is_lnk = ext.eq_ignore_ascii_case("lnk");
        let is_exe = ext.eq_ignore_ascii_case("exe");

        if is_lnk || is_exe {
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if should_skip_windows_app(stem) {
                continue;
            }

            let icon = extract_windows_icon(&path, icon_cache_dir);
            out.push(LocalAppInfo {
                name: stem.to_string(),
                path: path.to_string_lossy().to_string(),
                bundle_id: None,
                icon,
            });
        }
    }
}

#[cfg(target_os = "windows")]
fn should_skip_windows_app(stem: &str) -> bool {
    let lower = stem.to_lowercase();
    lower.is_empty()
        || lower.contains("uninstall")
        || lower.contains("卸载")
        || lower.contains("readme")
        || lower.contains("help")
        || lower.contains("manual")
        || lower.contains("documentation")
        || lower.contains("license")
        || lower.contains("许可")
        || lower.contains("网站")
        || lower.contains("website")
        || lower.contains("feedback")
        || lower.contains("update")
        || lower.contains("install")
        || lower == "desktop"
}

#[cfg(target_os = "windows")]
fn extract_windows_icon(app_path: &Path, icon_cache_dir: &Path) -> Option<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::Once;

    let mut hasher = DefaultHasher::new();
    app_path.to_string_lossy().hash(&mut hasher);
    let cache_filename = format!("app_{:x}.png", hasher.finish());
    let cached_png = icon_cache_dir.join(&cache_filename);

    if cached_png.exists() {
        return Some(format!("/icons/{}", cache_filename));
    }

    static GDIP_INIT: Once = Once::new();
    static mut GDIP_TOKEN: usize = 0;
    GDIP_INIT.call_once(|| {
        let input = GdiplusStartupInput {
            gdiplus_version: 1,
            debug_event_callback: std::ptr::null(),
            suppress_background_thread: 0,
            suppress_external_codecs: 0,
        };
        unsafe {
            let mut token = 0;
            if GdiplusStartup(&mut token, &input, std::ptr::null_mut()) == 0 {
                GDIP_TOKEN = token;
            }
        }
    });

    let wide_path: Vec<u16> = OsStr::new(app_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut shfi = SHFILEINFOW {
        h_icon: std::ptr::null_mut(),
        i_icon: 0,
        dw_attributes: 0,
        sz_display_name: [0; 260],
        sz_type_name: [0; 80],
    };

    const SHGFI_SYSICONINDEX: u32 = 0x00004000;
    const SHGFI_LARGEICON: u32 = 0x00000000;
    const SHIL_EXTRALARGE: i32 = 2; // 48x48

    // Query system icon index without SHGFI_ICON so Windows does not composite the shortcut arrow overlay
    let himl_res = unsafe {
        SHGetFileInfoW(
            wide_path.as_ptr(),
            0,
            &mut shfi,
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_SYSICONINDEX | SHGFI_LARGEICON,
        )
    };

    if himl_res == 0 || shfi.i_icon < 0 {
        return None;
    }

    // Try extracting high-resolution 48x48 icon via SHGetImageList (SHIL_EXTRALARGE)
    const IID_I_IMAGE_LIST: GUID = GUID {
        data1: 0x46eb5926,
        data2: 0x582e,
        data3: 0x4017,
        data4: [0x9f, 0xdf, 0xe8, 0x99, 0x8d, 0xaa, 0x09, 0x50],
    };

    let mut h_icon: *mut std::ffi::c_void = std::ptr::null_mut();
    let mut himl_large: *mut std::ffi::c_void = std::ptr::null_mut();
    if unsafe { SHGetImageList(SHIL_EXTRALARGE, &IID_I_IMAGE_LIST, &mut himl_large) } == 0
        && !himl_large.is_null()
    {
        // ILD_NORMAL (0) extracts raw icon without shortcut link overlay
        h_icon = unsafe { ImageList_GetIcon(himl_large, shfi.i_icon, 0) };
    }

    // Fallback to himl returned by SHGetFileInfoW
    if h_icon.is_null() {
        let himl = himl_res as *mut std::ffi::c_void;
        h_icon = unsafe { ImageList_GetIcon(himl, shfi.i_icon, 0) };
    }

    if h_icon.is_null() {
        return None;
    }

    let mut p_bitmap: *mut std::ffi::c_void = std::ptr::null_mut();
    let create_status = unsafe { GdipCreateBitmapFromHICON(h_icon, &mut p_bitmap) };
    unsafe {
        DestroyIcon(h_icon);
    }

    if create_status != 0 || p_bitmap.is_null() {
        return None;
    }

    const PNG_ENCODER_CLSID: GUID = GUID {
        data1: 0x557cf406,
        data2: 0x1a04,
        data3: 0x11d3,
        data4: [0x9a, 0x73, 0x00, 0x00, 0xf8, 0x1e, 0xf3, 0x2e],
    };

    let wide_dest: Vec<u16> = OsStr::new(&cached_png)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let save_status = unsafe {
        GdipSaveImageToFile(
            p_bitmap,
            wide_dest.as_ptr(),
            &PNG_ENCODER_CLSID,
            std::ptr::null(),
        )
    };

    unsafe {
        GdipDisposeImage(p_bitmap);
    }

    if save_status == 0 && cached_png.exists() {
        Some(format!("/icons/{}", cache_filename))
    } else {
        None
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn scan_local_apps(_icon_cache_dir: &Path) -> Vec<LocalAppInfo> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_local_apps() {
        let temp_dir = std::env::temp_dir().join("landeck_test_icons_no_arrow");
        let _ = fs::create_dir_all(&temp_dir);
        let apps = scan_local_apps(&temp_dir);
        println!("Found {} apps on Windows", apps.len());
        for app in apps.iter().take(5) {
            println!("App: {} -> {:?} (icon: {:?})", app.name, app.path, app.icon);
        }
        assert!(!apps.is_empty(), "Should find at least one installed app on Windows");
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
