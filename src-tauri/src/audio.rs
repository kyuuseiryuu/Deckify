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

#[cfg(target_os = "macos")]
mod macos_audio {
    use super::AudioDeviceInfo;
    use std::ffi::c_void;
    use std::ptr;

    #[repr(C)]
    #[derive(Clone, Copy, Debug)]
    pub struct AudioObjectPropertyAddress {
        pub m_selector: u32,
        pub m_scope: u32,
        pub m_element: u32,
    }

    const K_AUDIO_HARDWARE_PROPERTY_DEVICES: u32 = u32::from_be_bytes(*b"dev#");
    const K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE: u32 = u32::from_be_bytes(*b"dOut");
    const K_AUDIO_DEVICE_PROPERTY_DEVICE_NAME_CF_STRING: u32 = u32::from_be_bytes(*b"lnam");
    const K_AUDIO_DEVICE_PROPERTY_DEVICE_UID: u32 = u32::from_be_bytes(*b"uid ");
    const K_AUDIO_DEVICE_PROPERTY_STREAMS: u32 = u32::from_be_bytes(*b"stm#");

    const K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL: u32 = u32::from_be_bytes(*b"glob");
    const K_AUDIO_DEVICE_PROPERTY_SCOPE_OUTPUT: u32 = u32::from_be_bytes(*b"outp");
    const K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN: u32 = 0;

    const K_AUDIO_OBJECT_SYSTEM_OBJECT: u32 = 1;
    const NO_ERR: i32 = 0;
    const K_AUDIO_HARDWARE_NOT_RUNNING_ERROR: i32 = 0x6e6f7065; // 'nope' = 1852797029
    const K_CF_STRING_ENCODING_UTF8: u32 = 0x08000100;

    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyData(
            inObjectID: u32,
            inAddress: *const AudioObjectPropertyAddress,
            inQualifierDataSize: u32,
            inQualifierData: *const c_void,
            ioDataSize: *mut u32,
            outData: *mut c_void,
        ) -> i32;

        fn AudioObjectSetPropertyData(
            inObjectID: u32,
            inAddress: *const AudioObjectPropertyAddress,
            inQualifierDataSize: u32,
            inQualifierData: *const c_void,
            inDataSize: u32,
            inData: *const c_void,
        ) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringGetLength(theString: *const c_void) -> isize;
        fn CFStringGetCString(
            theString: *const c_void,
            buffer: *mut u8,
            bufferSize: isize,
            encoding: u32,
        ) -> bool;
        fn CFRelease(cf: *const c_void);
    }

    unsafe fn cfstring_to_string(cf_str: *const c_void) -> Option<String> {
        if cf_str.is_null() {
            return None;
        }
        let length = CFStringGetLength(cf_str);
        if length <= 0 {
            CFRelease(cf_str);
            return Some(String::new());
        }
        let max_size = length * 4 + 1;
        let mut buf = vec![0u8; max_size as usize];
        let success = CFStringGetCString(
            cf_str,
            buf.as_mut_ptr(),
            max_size,
            K_CF_STRING_ENCODING_UTF8,
        );
        CFRelease(cf_str);
        if success {
            if let Some(pos) = buf.iter().position(|&b| b == 0) {
                buf.truncate(pos);
            }
            String::from_utf8(buf).ok()
        } else {
            None
        }
    }

    pub fn list_devices() -> Result<Vec<AudioDeviceInfo>, String> {
        let mut default_dev_id: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        let addr_default = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };

        unsafe {
            let _ = AudioObjectGetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &addr_default,
                0,
                ptr::null(),
                &mut size,
                &mut default_dev_id as *mut u32 as *mut c_void,
            );
        }

        let addr_devices = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEVICES,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };

        let mut data_size: u32 = 0;
        let status = unsafe {
            AudioObjectGetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &addr_devices,
                0,
                ptr::null(),
                &mut data_size,
                ptr::null_mut(),
            )
        };
        if status == K_AUDIO_HARDWARE_NOT_RUNNING_ERROR {
            return Ok(Vec::new());
        }
        if status != NO_ERR {
            return Err(format!("获取 CoreAudio 设备列表大小失败: OSStatus {}", status));
        }

        let count = data_size as usize / std::mem::size_of::<u32>();
        if count == 0 {
            return Ok(Vec::new());
        }

        let mut device_ids = vec![0u32; count];
        let status = unsafe {
            AudioObjectGetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &addr_devices,
                0,
                ptr::null(),
                &mut data_size,
                device_ids.as_mut_ptr() as *mut c_void,
            )
        };
        if status == K_AUDIO_HARDWARE_NOT_RUNNING_ERROR {
            return Ok(Vec::new());
        }
        if status != NO_ERR {
            return Err(format!("获取 CoreAudio 设备列表失败: OSStatus {}", status));
        }

        let mut results = Vec::new();
        for dev_id in device_ids {
            // Check if device has output streams
            let addr_streams = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_STREAMS,
                m_scope: K_AUDIO_DEVICE_PROPERTY_SCOPE_OUTPUT,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let mut stream_size: u32 = 0;
            let status = unsafe {
                AudioObjectGetPropertyData(
                    dev_id,
                    &addr_streams,
                    0,
                    ptr::null(),
                    &mut stream_size,
                    ptr::null_mut(),
                )
            };
            if status != NO_ERR || stream_size == 0 {
                continue;
            }

            // Get UID
            let addr_uid = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_DEVICE_UID,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let mut cf_uid: *const c_void = ptr::null();
            let mut uid_size = std::mem::size_of::<*const c_void>() as u32;
            let status = unsafe {
                AudioObjectGetPropertyData(
                    dev_id,
                    &addr_uid,
                    0,
                    ptr::null(),
                    &mut uid_size,
                    &mut cf_uid as *mut *const c_void as *mut c_void,
                )
            };
            let uid = if status == NO_ERR && !cf_uid.is_null() {
                unsafe { cfstring_to_string(cf_uid) }.unwrap_or_else(|| dev_id.to_string())
            } else {
                dev_id.to_string()
            };

            // Get device name
            let addr_name = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_DEVICE_NAME_CF_STRING,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let mut cf_name: *const c_void = ptr::null();
            let mut name_size = std::mem::size_of::<*const c_void>() as u32;
            let status = unsafe {
                AudioObjectGetPropertyData(
                    dev_id,
                    &addr_name,
                    0,
                    ptr::null(),
                    &mut name_size,
                    &mut cf_name as *mut *const c_void as *mut c_void,
                )
            };
            let name = if status == NO_ERR && !cf_name.is_null() {
                unsafe { cfstring_to_string(cf_name) }.unwrap_or_else(|| format!("音频输出设备 ({})", dev_id))
            } else {
                format!("音频输出设备 ({})", dev_id)
            };

            let is_default = dev_id == default_dev_id;
            results.push(AudioDeviceInfo {
                id: uid,
                name,
                is_default,
            });
        }

        Ok(results)
    }

    pub fn set_default(target_id: &str) -> Result<(), String> {
        let addr_devices = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEVICES,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };

        let mut data_size: u32 = 0;
        let status = unsafe {
            AudioObjectGetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &addr_devices,
                0,
                ptr::null(),
                &mut data_size,
                ptr::null_mut(),
            )
        };
        if status == K_AUDIO_HARDWARE_NOT_RUNNING_ERROR {
            return Err("CoreAudio 服务未运行或当前环境不可用".into());
        }
        if status != NO_ERR {
            return Err(format!("获取 CoreAudio 设备列表大小失败: OSStatus {}", status));
        }

        let count = data_size as usize / std::mem::size_of::<u32>();
        if count == 0 {
            return Err(format!("未在系统中找到 ID 为 {} 的音频输出设备", target_id));
        }

        let mut device_ids = vec![0u32; count];
        let status = unsafe {
            AudioObjectGetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &addr_devices,
                0,
                ptr::null(),
                &mut data_size,
                device_ids.as_mut_ptr() as *mut c_void,
            )
        };
        if status == K_AUDIO_HARDWARE_NOT_RUNNING_ERROR {
            return Err("CoreAudio 服务未运行或当前环境不可用".into());
        }
        if status != NO_ERR {
            return Err(format!("获取 CoreAudio 设备列表失败: OSStatus {}", status));
        }

        let mut matched_device_id: Option<u32> = None;

        for dev_id in device_ids {
            let addr_uid = AudioObjectPropertyAddress {
                m_selector: K_AUDIO_DEVICE_PROPERTY_DEVICE_UID,
                m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
                m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
            };
            let mut cf_uid: *const c_void = ptr::null();
            let mut uid_size = std::mem::size_of::<*const c_void>() as u32;
            let status = unsafe {
                AudioObjectGetPropertyData(
                    dev_id,
                    &addr_uid,
                    0,
                    ptr::null(),
                    &mut uid_size,
                    &mut cf_uid as *mut *const c_void as *mut c_void,
                )
            };
            if status == NO_ERR && !cf_uid.is_null() {
                if let Some(uid) = unsafe { cfstring_to_string(cf_uid) } {
                    if uid == target_id {
                        matched_device_id = Some(dev_id);
                        break;
                    }
                }
            }
            if dev_id.to_string() == target_id {
                matched_device_id = Some(dev_id);
                break;
            }
        }

        let found_id = match matched_device_id {
            Some(id) => id,
            None => return Err(format!("未在系统中找到 ID 为 {} 的音频输出设备", target_id)),
        };

        let addr_default = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };
        let size = std::mem::size_of::<u32>() as u32;
        let status = unsafe {
            AudioObjectSetPropertyData(
                K_AUDIO_OBJECT_SYSTEM_OBJECT,
                &addr_default,
                0,
                ptr::null(),
                size,
                &found_id as *const u32 as *const c_void,
            )
        };
        if status != NO_ERR {
            return Err(format!("设置默认音频输出设备失败: OSStatus {}", status));
        }

        Ok(())
    }
}

pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_audio::list_devices()
    }
    #[cfg(target_os = "macos")]
    {
        macos_audio::list_devices()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Ok(vec![])
    }
}

pub fn set_default_audio_device(device_id: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows_audio::set_default(device_id)
    }
    #[cfg(target_os = "macos")]
    {
        macos_audio::set_default(device_id)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = device_id;
        Err("当前系统不支持切换系统默认音频源".into())
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
        match list_audio_devices() {
            Ok(devices) => {
                println!("\nFound {} devices:", devices.len());
                for d in &devices {
                    println!("  [{}] {} (default: {})", d.id, d.name, d.is_default);
                }
            }
            Err(e) => {
                println!(
                    "Notice: list_audio_devices failed (acceptable in headless/CI environment): {}",
                    e
                );
            }
        }
    }
}
