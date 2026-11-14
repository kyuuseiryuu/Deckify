use std::fs;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rcgen::{
    date_time_ymd, BasicConstraints, CertificateParams, DistinguishedName, DnType,
    ExtendedKeyUsagePurpose, IsCa, KeyPair, KeyUsagePurpose, SanType,
};

pub struct CertBundle {
    pub ca_cert_path: PathBuf,
    pub server_cert_pem: String,
    pub server_key_pem: String,
}

fn unix_secs_to_ymd(secs: i64) -> (i32, u8, u8) {
    // Civil-from-days algorithm (Howard Hinnant)
    let z = secs.div_euclid(86_400) + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    (year as i32, m as u8, d as u8)
}

pub fn ensure_local_certs(data_dir: &Path, san_ips: &[String]) -> Result<CertBundle, String> {
    let certs_dir = data_dir.join("certs");
    fs::create_dir_all(&certs_dir).map_err(|e| format!("创建证书目录失败: {}", e))?;

    let ca_cert_path = certs_dir.join("ca.crt");
    let ca_key_path = certs_dir.join("ca.key");
    let server_cert_path = certs_dir.join("server.crt");
    let server_key_path = certs_dir.join("server.key");

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(1_760_000_000);

    // Build CA params consistently so leaf certs always chain to the saved Root CA
    let mut ca_params = CertificateParams::default();
    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, "LanDeck Local CA");
    dn.push(DnType::OrganizationName, "LanDeck");
    ca_params.distinguished_name = dn;
    ca_params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    ca_params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];

    let (y1, m1, d1) = unix_secs_to_ymd(now_secs - 86_400);
    let (y2, m2, d2) = unix_secs_to_ymd(now_secs + 3650 * 86_400);
    ca_params.not_before = date_time_ymd(y1, m1, d1);
    ca_params.not_after = date_time_ymd(y2, m2, d2);

    // Load or create local Root CA
    let (ca_cert, ca_key) = if ca_cert_path.exists() && ca_key_path.exists() {
        let ca_key_pem =
            fs::read_to_string(&ca_key_path).map_err(|e| format!("读取 CA 私钥失败: {}", e))?;
        let key_pair =
            KeyPair::from_pem(&ca_key_pem).map_err(|e| format!("解析 CA 私钥失败: {}", e))?;
        let cert = ca_params
            .self_signed(&key_pair)
            .map_err(|e| format!("重建 CA 证书失败: {}", e))?;
        (cert, key_pair)
    } else {
        let key_pair = KeyPair::generate().map_err(|e| format!("生成 CA 私钥失败: {}", e))?;
        let cert = ca_params
            .self_signed(&key_pair)
            .map_err(|e| format!("生成 CA 证书失败: {}", e))?;

        fs::write(&ca_cert_path, cert.pem())
            .map_err(|e| format!("保存 CA 证书失败: {}", e))?;
        fs::write(&ca_key_path, key_pair.serialize_pem())
            .map_err(|e| format!("保存 CA 私钥失败: {}", e))?;
        (cert, key_pair)
    };

    // Always issue/refresh leaf server certificate for current SAN IPs (<= 800 days for Apple compliance)
    let mut server_params = CertificateParams::default();
    let mut server_dn = DistinguishedName::new();
    server_dn.push(DnType::CommonName, "LanDeck Local Server");
    server_dn.push(DnType::OrganizationName, "LanDeck");
    server_params.distinguished_name = server_dn;
    server_params.is_ca = IsCa::NoCa;
    server_params.key_usages = vec![
        KeyUsagePurpose::DigitalSignature,
        KeyUsagePurpose::KeyEncipherment,
    ];
    server_params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];

    let (sy1, sm1, sd1) = unix_secs_to_ymd(now_secs - 86_400);
    let (sy2, sm2, sd2) = unix_secs_to_ymd(now_secs + 800 * 86_400);
    server_params.not_before = date_time_ymd(sy1, sm1, sd1);
    server_params.not_after = date_time_ymd(sy2, sm2, sd2);

    let mut sans = vec![
        SanType::DnsName("localhost".try_into().map_err(|e| format!("{}", e))?),
        SanType::IpAddress("127.0.0.1".parse::<IpAddr>().unwrap()),
    ];
    for ip_str in san_ips {
        if let Ok(ip) = ip_str.trim().parse::<IpAddr>() {
            if !sans.iter().any(|s| matches!(s, SanType::IpAddress(existing) if *existing == ip)) {
                sans.push(SanType::IpAddress(ip));
            }
        }
    }
    server_params.subject_alt_names = sans;

    let server_key = KeyPair::generate().map_err(|e| format!("生成服务端私钥失败: {}", e))?;
    let server_cert = server_params
        .signed_by(&server_key, &ca_cert, &ca_key)
        .map_err(|e| format!("签发服务端证书失败: {}", e))?;

    let server_cert_pem = server_cert.pem();
    let server_key_pem = server_key.serialize_pem();

    fs::write(&server_cert_path, &server_cert_pem)
        .map_err(|e| format!("保存服务端证书失败: {}", e))?;
    fs::write(&server_key_path, &server_key_pem)
        .map_err(|e| format!("保存服务端私钥失败: {}", e))?;

    Ok(CertBundle {
        ca_cert_path,
        server_cert_pem,
        server_key_pem,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ensure_local_certs() {
        let dir = std::env::temp_dir().join("landeck_test_certs");
        let _ = fs::remove_dir_all(&dir);
        let bundle = ensure_local_certs(&dir, &["192.168.1.50".to_string()]).unwrap();
        assert!(bundle.ca_cert_path.exists());
        assert!(bundle.server_cert_pem.contains("BEGIN CERTIFICATE"));
        assert!(bundle.server_key_pem.contains("BEGIN PRIVATE KEY"));

        // Second call should reuse existing CA
        let ca_before = fs::read_to_string(&bundle.ca_cert_path).unwrap();
        let bundle2 = ensure_local_certs(&dir, &["192.168.1.51".to_string()]).unwrap();
        let ca_after = fs::read_to_string(&bundle2.ca_cert_path).unwrap();
        assert_eq!(ca_before, ca_after);

        let _ = fs::remove_dir_all(&dir);
    }
}
