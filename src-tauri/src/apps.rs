use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::models::LocalAppInfo;

pub fn scan_local_apps(icon_cache_dir: &Path) -> Vec<LocalAppInfo> {
    let mut apps = Vec::new();
    let mut search_dirs = vec![PathBuf::from("/Applications")];

    if let Ok(home) = std::env::var("HOME") {
        search_dirs.push(PathBuf::from(home).join("Applications"));
    }

    for dir in search_dirs {
        if dir.exists() {
            collect_apps_in_dir(&dir, icon_cache_dir, &mut apps, 0);
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.path == b.path);
    apps
}

fn collect_apps_in_dir(
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
            // Scan subdirectories like /Applications/Utilities
            collect_apps_in_dir(&path, icon_cache_dir, out, depth + 1);
        }
    }
}

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

    let icon = extract_app_icon(&contents_dir, icon_file.as_deref(), app_path, icon_cache_dir);

    Some(LocalAppInfo {
        name,
        path: app_path.to_string_lossy().to_string(),
        bundle_id,
        icon,
    })
}

fn extract_app_icon(
    contents_dir: &Path,
    icon_name: Option<&str>,
    app_path: &Path,
    icon_cache_dir: &Path,
) -> Option<String> {
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
