use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[cfg(target_os = "windows")]
mod windows_audio {
    use super::AudioDeviceInfo;
    use std::ffi::c_void;
    use windows::core::{GUID, HRESULT, PCWSTR};
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::Media::Audio::{
        eCommunications, eConsole, eMultimedia, eRender, DEVICE_STATE_ACTIVE, ERole,
        IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };

    const PKEY_DEVICE_FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
        pid: 14,
    };

    const CLSID_POLICY_CONFIG: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

    #[repr(C)]
    pub struct IPolicyConfigVtbl {
        pub base__: windows::core::IUnknown_Vtbl,
        pub get_mix_format: unsafe extern "system" fn(*mut c_void, PCWSTR, *mut c_void) -> HRESULT,
        pub get_device_format: unsafe extern "system" fn(*mut c_void, PCWSTR, i32, *mut c_void) -> HRESULT,
        pub reset_device_format: unsafe extern "system" fn(*mut c_void, PCWSTR) -> HRESULT,
        pub set_device_format: unsafe extern "system" fn(*mut c_void, PCWSTR, *mut c_void, *mut c_void) -> HRESULT,
        pub get_processing_period: unsafe extern "system" fn(*mut c_void, PCWSTR, i32, *mut i64, *mut i64) -> HRESULT,
        pub set_processing_period: unsafe extern "system" fn(*mut c_void, PCWSTR, *mut i64) -> HRESULT,
        pub get_share_mode: unsafe extern "system" fn(*mut c_void, PCWSTR, *mut c_void) -> HRESULT,
        pub set_share_mode: unsafe extern "system" fn(*mut c_void, PCWSTR, *mut c_void) -> HRESULT,
        pub get_property_value: unsafe extern "system" fn(*mut c_void, PCWSTR, *const PROPERTYKEY, *mut PROPVARIANT) -> HRESULT,
        pub set_property_value: unsafe extern "system" fn(*mut c_void, PCWSTR, *const PROPERTYKEY, *const PROPVARIANT) -> HRESULT,
        pub set_default_endpoint: unsafe extern "system" fn(*mut c_void, PCWSTR, ERole) -> HRESULT,
        pub set_endpoint_visibility: unsafe extern "system" fn(*mut c_void, PCWSTR, i32) -> HRESULT,
    }

    #[repr(transparent)]
    #[derive(Clone, PartialEq, Eq)]
    pub struct IPolicyConfig(windows::core::IUnknown);

    unsafe impl windows::core::Interface for IPolicyConfig {
        type Vtable = IPolicyConfigVtbl;
        const IID: GUID = GUID::from_u128(0xf8679f50_850a_41cf_9c72_430f290290c8);
    }

    struct ComGuard;
    impl ComGuard {
        fn new() -> Self {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
            ComGuard
        }
    }
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe {
                CoUninitialize();
            }
        }
    }

    pub fn list_devices() -> Result<Vec<AudioDeviceInfo>, String> {
        let _guard = ComGuard::new();
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("CoCreateInstance IMMDeviceEnumerator failed: {}", e))?;

            let default_id = match enumerator.GetDefaultAudioEndpoint(eRender, eConsole) {
                Ok(dev) => match dev.GetId() {
                    Ok(id_pwstr) => {
                        let id_str = id_pwstr.to_string().unwrap_or_default();
                        let _ = windows::Win32::System::Com::CoTaskMemFree(Some(id_pwstr.0 as *const _));
                        id_str
                    }
                    Err(_) => String::new(),
                },
                Err(_) => String::new(),
            };

            let collection = enumerator
                .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
                .map_err(|e| format!("EnumAudioEndpoints failed: {}", e))?;

            let count = collection
                .GetCount()
                .map_err(|e| format!("GetCount failed: {}", e))?;

            let mut list = Vec::with_capacity(count as usize);

            for i in 0..count {
                let dev = match collection.Item(i) {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                let id_pwstr = match dev.GetId() {
                    Ok(id) => id,
                    Err(_) => continue,
                };
                let id = id_pwstr.to_string().unwrap_or_default();
                let _ = windows::Win32::System::Com::CoTaskMemFree(Some(id_pwstr.0 as *const _));

                let mut name = String::new();
                if let Ok(store) = dev.OpenPropertyStore(windows::Win32::System::Com::STGM_READ) {
                    if let Ok(prop) = store.GetValue(&PKEY_DEVICE_FRIENDLY_NAME) {
                        name = prop.to_string();
                    }
                }

                if name.is_empty() {
                    name = format!("音频输出设备 {}", i + 1);
                }

                let is_default = !default_id.is_empty() && id == default_id;

                list.push(AudioDeviceInfo {
                    id,
                    name,
                    is_default,
                });
            }

            Ok(list)
        }
    }

    pub fn set_default(device_id: &str) -> Result<(), String> {
        let _guard = ComGuard::new();
        unsafe {
            let policy_config: IPolicyConfig = CoCreateInstance(
                &CLSID_POLICY_CONFIG,
                None,
                CLSCTX_INPROC_SERVER | CLSCTX_ALL,
            )
            .map_err(|e| format!("创建 CPolicyConfigClient 失败: {}", e))?;

            let wide_id: Vec<u16> = device_id
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            let pcwstr = PCWSTR(wide_id.as_ptr());

            use windows::core::Interface;
            let vtable = policy_config.vtable();

            let roles = [eConsole, eMultimedia, eCommunications];
            for role in roles {
                let res = (vtable.set_default_endpoint)(policy_config.as_raw(), pcwstr, role);
                if res.is_err() {
                    return Err(format!("设置默认音频端点失败 (role {:?}): {:?}", role, res));
                }
            }

            Ok(())
        }
    }
}

pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_audio::list_devices()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

pub fn set_default_audio_device(device_id: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows_audio::set_default(device_id)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = device_id;
        Err("仅 Windows 系统支持切换系统默认音频源".into())
    }
}

pub fn cycle_audio_device(whitelist_ids: &[String]) -> Result<Option<AudioDeviceInfo>, String> {
    let devices = list_audio_devices()?;
    if devices.is_empty() {
        return Ok(None);
    }

    // Filter by whitelist if provided and not empty
    let candidate_devices: Vec<AudioDeviceInfo> = if !whitelist_ids.is_empty() {
        let mut filtered = Vec::new();
        for w_id in whitelist_ids {
            if let Some(d) = devices.iter().find(|dev| &dev.id == w_id) {
                filtered.push(d.clone());
            }
        }
        if filtered.is_empty() {
            devices
        } else {
            filtered
        }
    } else {
        devices
    };

    if candidate_devices.is_empty() {
        return Ok(None);
    }

    // Find current default device index
    let current_idx = candidate_devices.iter().position(|d| d.is_default);
    let next_idx = match current_idx {
        Some(idx) => (idx + 1) % candidate_devices.len(),
        None => 0,
    };

    let target = &candidate_devices[next_idx];
    set_default_audio_device(&target.id)?;

    Ok(Some(AudioDeviceInfo {
        id: target.id.clone(),
        name: target.name.clone(),
        is_default: true,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_audio_devices() {
        let devices = list_audio_devices().expect("list_audio_devices failed");
        println!("\nFound {} devices:", devices.len());
        for d in &devices {
            println!("  [{}] {} (default: {})", d.id, d.name, d.is_default);
        }
    }
}
