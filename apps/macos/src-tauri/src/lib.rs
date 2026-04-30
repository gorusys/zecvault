//! Tauri desktop shell: in release, load bundled frontend assets directly.
use bip39::{Language, Mnemonic};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use zcash_keys::address::Address as ZcashPoolAddress;
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedSpendingKey};
use zcash_protocol::consensus::{MAIN_NETWORK, TEST_NETWORK};
use zip32::AccountId;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WalletRecord {
    mnemonic: String,
    network: String,
    #[serde(default)]
    wallet_name: String,
    wallet_fingerprint: String,
    unified_address: String,
    sapling_address: String,
    transparent_address: String,
    created_at_ts: i64,
    birthday_height: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WalletSnapshot {
    network: String,
    wallet_name: String,
    wallet_fingerprint: String,
    unified_address: String,
    sapling_address: String,
    transparent_address: String,
    created_at_ts: i64,
    birthday_height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WalletCreateResponse {
    mnemonic_words: Vec<String>,
    snapshot: WalletSnapshot,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WalletOpResponse {
    ok: bool,
    snapshot: Option<WalletSnapshot>,
    error: Option<String>,
}

fn normalize_mnemonic(input: &str) -> String {
    input
        .split_whitespace()
        .map(|w| w.trim().to_lowercase())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn now_unix_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn deterministic_hex(input: &str, len: usize) -> String {
    const HEX: &[u8] = b"0123456789abcdef";
    let mut acc = input.to_string();
    let mut out = String::with_capacity(len);
    for i in 0..len {
        let mut h: u32 = 0x811c9dc5;
        for b in acc.as_bytes() {
            h ^= (*b as u32) + i as u32;
            h = h.wrapping_mul(0x01000193);
        }
        out.push(HEX[(h % 16) as usize] as char);
        acc = format!("{:x}{}", h, acc);
    }
    out
}

fn derive_real_addresses(normalized_mnemonic: &str, network: &str) -> Result<(String, String, String), String> {
    let seed = Mnemonic::parse_in_normalized(Language::English, normalized_mnemonic)
        .map_err(|e| format!("mnemonic parse failed: {}", e))?
        .to_seed("");

    let account = AccountId::ZERO;
    let (ua, unified_encoded, sapling_encoded, transparent_encoded) = if network == "testnet" {
        let usk = UnifiedSpendingKey::from_seed(&TEST_NETWORK, &seed, account)
            .map_err(|e| format!("USK derivation failed: {}", e))?;
        let ufvk = usk.to_unified_full_viewing_key();
        let (ua, _) = ufvk
            .default_address(UnifiedAddressRequest::ALLOW_ALL)
            .map_err(|e| format!("default UA derivation failed: {}", e))?;
        let unified_encoded = ua.encode(&TEST_NETWORK);
        let sapling_encoded = ua
            .sapling()
            .map(|addr| ZcashPoolAddress::Sapling(*addr).encode(&TEST_NETWORK))
            .ok_or_else(|| "Sapling receiver derivation failed.".to_string())?;
        let transparent_encoded = ua
            .transparent()
            .map(|addr| ZcashPoolAddress::Transparent(*addr).encode(&TEST_NETWORK))
            .ok_or_else(|| "Transparent receiver derivation failed.".to_string())?;
        (ua, unified_encoded, sapling_encoded, transparent_encoded)
    } else {
        let usk = UnifiedSpendingKey::from_seed(&MAIN_NETWORK, &seed, account)
            .map_err(|e| format!("USK derivation failed: {}", e))?;
        let ufvk = usk.to_unified_full_viewing_key();
        let (ua, _) = ufvk
            .default_address(UnifiedAddressRequest::ALLOW_ALL)
            .map_err(|e| format!("default UA derivation failed: {}", e))?;
        let unified_encoded = ua.encode(&MAIN_NETWORK);
        let sapling_encoded = ua
            .sapling()
            .map(|addr| ZcashPoolAddress::Sapling(*addr).encode(&MAIN_NETWORK))
            .ok_or_else(|| "Sapling receiver derivation failed.".to_string())?;
        let transparent_encoded = ua
            .transparent()
            .map(|addr| ZcashPoolAddress::Transparent(*addr).encode(&MAIN_NETWORK))
            .ok_or_else(|| "Transparent receiver derivation failed.".to_string())?;
        (ua, unified_encoded, sapling_encoded, transparent_encoded)
    };

    let _ = ua;
    Ok((
        unified_encoded,
        sapling_encoded,
        transparent_encoded,
    ))
}

fn default_birthday_height(network: &str) -> u32 {
    match network {
        "testnet" => 280_000,
        _ => 419_200,
    }
}

fn to_public_snapshot(record: &WalletRecord) -> WalletSnapshot {
    WalletSnapshot {
        network: record.network.clone(),
        wallet_name: record.wallet_name.clone(),
        wallet_fingerprint: record.wallet_fingerprint.clone(),
        unified_address: record.unified_address.clone(),
        sapling_address: record.sapling_address.clone(),
        transparent_address: record.transparent_address.clone(),
        created_at_ts: record.created_at_ts,
        birthday_height: record.birthday_height,
    }
}

fn build_record(
    normalized_mnemonic: &str,
    network: &str,
    birthday_height: u32,
    wallet_name: Option<&str>,
) -> Result<WalletRecord, String> {
    let (unified_address, sapling_address, transparent_address) = derive_real_addresses(normalized_mnemonic, network)?;
    let fingerprint = deterministic_hex(&format!("fp|{}", normalized_mnemonic), 16);
    let resolved_name = wallet_name
        .map(|n| n.trim())
        .filter(|n| !n.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("Wallet {}", &fingerprint[0..6]));
    Ok(WalletRecord {
        mnemonic: normalized_mnemonic.to_string(),
        network: network.to_string(),
        wallet_name: resolved_name,
        wallet_fingerprint: fingerprint,
        unified_address,
        sapling_address,
        transparent_address,
        created_at_ts: now_unix_ts(),
        birthday_height,
    })
}

fn wallet_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create app data dir: {}", e))?;
    Ok(dir.join("wallet.json"))
}

fn write_wallet(path: &Path, snapshot: &WalletRecord) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(snapshot).map_err(|e| format!("wallet serialize failed: {}", e))?;
    fs::write(path, json).map_err(|e| format!("wallet write failed: {}", e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("wallet permission update failed: {}", e))?;
    }
    Ok(())
}

fn read_wallet(path: &Path) -> Result<Option<WalletRecord>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read(path).map_err(|e| format!("wallet read failed: {}", e))?;
    let data: WalletRecord =
        serde_json::from_slice(&raw).map_err(|e| format!("wallet parse failed: {}", e))?;
    Ok(Some(data))
}

#[tauri::command]
fn wallet_create(app: tauri::AppHandle, network: String, password: String) -> Result<WalletCreateResponse, String> {
    let _ = app;
    let _ = password;
    let mnemonic = Mnemonic::generate_in(Language::English, 24)
        .map_err(|e| format!("mnemonic generation failed: {}", e))?;
    let normalized = normalize_mnemonic(&mnemonic.to_string());
    let record = build_record(&normalized, &network, default_birthday_height(&network), None)?;
    Ok(WalletCreateResponse {
        mnemonic_words: normalized.split(' ').map(String::from).collect(),
        snapshot: to_public_snapshot(&record),
    })
}

#[tauri::command]
fn wallet_finalize_create(
    app: tauri::AppHandle,
    mnemonic: String,
    network: String,
    birthday_height: Option<u32>,
    draft_id: Option<String>,
    password: String,
    wallet_name: Option<String>,
)-> Result<WalletOpResponse, String> {
    let _ = draft_id;
    let _ = password;
    let _ = &wallet_name;
    let normalized = normalize_mnemonic(&mnemonic);
    let words = normalized.split(' ').count();
    if words != 24 {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Invalid seed phrase: expected 24 words.".to_string()),
        });
    }
    if Mnemonic::parse_in_normalized(Language::English, &normalized).is_err() {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Invalid seed phrase: checksum or words are incorrect.".to_string()),
        });
    }
    let path = wallet_file(&app)?;
    let record = build_record(
        &normalized,
        &network,
        birthday_height.unwrap_or_else(|| default_birthday_height(&network)),
        wallet_name.as_deref(),
    )?;
    write_wallet(&path, &record)?;
    Ok(WalletOpResponse {
        ok: true,
        snapshot: Some(to_public_snapshot(&record)),
        error: None,
    })
}

#[tauri::command]
fn wallet_restore(
    app: tauri::AppHandle,
    mnemonic: String,
    network: String,
    birthday_height: Option<u32>,
    draft_id: Option<String>,
    password: String,
    wallet_name: Option<String>,
)-> Result<WalletOpResponse, String> {
    let _ = draft_id;
    let _ = password;
    let _ = &wallet_name;
    let normalized = normalize_mnemonic(&mnemonic);
    let words = normalized.split(' ').count();
    if words != 24 {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Invalid seed phrase: expected 24 words.".to_string()),
        });
    }
    if Mnemonic::parse_in_normalized(Language::English, &normalized).is_err() {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Invalid seed phrase: checksum or words are incorrect.".to_string()),
        });
    }
    let path = wallet_file(&app)?;
    let record = build_record(
        &normalized,
        &network,
        birthday_height.unwrap_or_else(|| default_birthday_height(&network)),
        wallet_name.as_deref(),
    )?;
    write_wallet(&path, &record)?;
    let snapshot = to_public_snapshot(&record);
    Ok(WalletOpResponse {
        ok: true,
        snapshot: Some(snapshot),
        error: None,
    })
}

#[tauri::command]
fn wallet_get_state(app: tauri::AppHandle) -> Result<WalletOpResponse, String> {
    let path = wallet_file(&app)?;
    let snapshot = read_wallet(&path)?.map(|record| to_public_snapshot(&record));
    Ok(WalletOpResponse {
        ok: snapshot.is_some(),
        snapshot,
        error: None,
    })
}

#[tauri::command]
fn wallet_reset(app: tauri::AppHandle) -> Result<WalletOpResponse, String> {
    let path = wallet_file(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("wallet delete failed: {}", e))?;
    }
    Ok(WalletOpResponse {
        ok: true,
        snapshot: None,
        error: None,
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            wallet_create,
            wallet_finalize_create,
            wallet_restore,
            wallet_get_state,
            wallet_reset
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}
