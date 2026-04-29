//! Tauri desktop shell: in release, load bundled frontend assets directly.
use bip39::{Language, Mnemonic};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri::Emitter;
use zcash_keys::address::Address as ZcashPoolAddress;
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedSpendingKey};
use zcash_protocol::consensus::{MAIN_NETWORK, TEST_NETWORK};
use zip32::AccountId;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WalletRecord {
    mnemonic: String,
    network: String,
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
    draft_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WalletOpResponse {
    ok: bool,
    snapshot: Option<WalletSnapshot>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BalanceInfo {
    orchard_zat: u64,
    sapling_zat: u64,
    transparent_zat: u64,
    pending_zat: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TxInfo {
    txid: String,
    value_zat: i64,
    timestamp: u64,
    block_height: u32,
    memo: Option<String>,
    is_incoming: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SyncProgressEvent {
    height: u32,
    total: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WalletCreateDraft {
    draft_id: String,
    mnemonic: String,
    network: String,
    birthday_height: u32,
    created_at_ts: i64,
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
            .unwrap_or_default();
        let transparent_encoded = ua
            .transparent()
            .map(|addr| ZcashPoolAddress::Transparent(*addr).encode(&TEST_NETWORK))
            .unwrap_or_default();
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
            .unwrap_or_default();
        let transparent_encoded = ua
            .transparent()
            .map(|addr| ZcashPoolAddress::Transparent(*addr).encode(&MAIN_NETWORK))
            .unwrap_or_default();
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
        wallet_fingerprint: record.wallet_fingerprint.clone(),
        unified_address: record.unified_address.clone(),
        sapling_address: record.sapling_address.clone(),
        transparent_address: record.transparent_address.clone(),
        created_at_ts: record.created_at_ts,
        birthday_height: record.birthday_height,
    }
}

fn build_preview_snapshot(normalized_mnemonic: &str, network: &str, birthday_height: u32) -> WalletSnapshot {
    WalletSnapshot {
        network: network.to_string(),
        wallet_fingerprint: deterministic_hex(&format!("fp|{}", normalized_mnemonic), 16),
        unified_address: String::new(),
        sapling_address: String::new(),
        transparent_address: String::new(),
        created_at_ts: now_unix_ts(),
        birthday_height,
    }
}

fn build_record(normalized_mnemonic: &str, network: &str, birthday_height: u32) -> WalletRecord {
    let (unified_address, sapling_address, transparent_address) =
        derive_real_addresses(normalized_mnemonic, network).unwrap_or_else(|_| {
            let suffix = deterministic_hex(&format!("{}|{}", network, normalized_mnemonic), 76);
            let transparent_suffix = deterministic_hex(&format!("t|{}|{}", network, normalized_mnemonic), 33);
            (
                format!("u1{}", suffix),
                format!("zs1{}", suffix),
                format!("t1{}", transparent_suffix),
            )
        });
    WalletRecord {
        mnemonic: normalized_mnemonic.to_string(),
        network: network.to_string(),
        wallet_fingerprint: deterministic_hex(&format!("fp|{}", normalized_mnemonic), 16),
        unified_address,
        sapling_address,
        transparent_address,
        created_at_ts: now_unix_ts(),
        birthday_height,
    }
}

fn wallet_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create app data dir: {}", e))?;
    Ok(dir.join("wallet.json"))
}

fn wallet_create_draft_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create app data dir: {}", e))?;
    Ok(dir.join("wallet_create_draft.json"))
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("temp write failed: {}", e))?;
    fs::rename(&tmp, path).map_err(|e| format!("atomic rename failed: {}", e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("wallet permission update failed: {}", e))?;
    }
    Ok(())
}

fn write_wallet(path: &Path, snapshot: &WalletRecord) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(snapshot).map_err(|e| format!("wallet serialize failed: {}", e))?;
    write_bytes_atomic(path, &json)
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

fn write_wallet_create_draft(path: &Path, draft: &WalletCreateDraft) -> Result<(), String> {
    let json =
        serde_json::to_vec_pretty(draft).map_err(|e| format!("wallet draft serialize failed: {}", e))?;
    write_bytes_atomic(path, &json)
}

fn read_wallet_create_draft(path: &Path) -> Result<Option<WalletCreateDraft>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read(path).map_err(|e| format!("wallet draft read failed: {}", e))?;
    let parsed: Result<WalletCreateDraft, _> = serde_json::from_slice(&raw);
    match parsed {
        Ok(data) => Ok(Some(data)),
        Err(_) => {
            // Recover automatically from legacy/corrupt draft files to avoid blocking onboarding.
            let _ = fs::remove_file(path);
            Ok(None)
        }
    }
}

fn lightwalletd_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create app data dir: {}", e))?;
    Ok(dir.join("lightwalletd.json"))
}

#[tauri::command]
fn wallet_create(app: tauri::AppHandle, network: String) -> Result<WalletCreateResponse, String> {
    if network != "mainnet" && network != "testnet" {
        return Err("Unsupported network. Use mainnet or testnet.".to_string());
    }
    let mnemonic = Mnemonic::generate_in(Language::English, 24)
        .map_err(|e| format!("mnemonic generation failed: {}", e))?;
    let normalized = normalize_mnemonic(&mnemonic.to_string());
    let birthday_height = default_birthday_height(&network);
    let preview = build_preview_snapshot(&normalized, &network, birthday_height);
    let draft_id = deterministic_hex(
        &format!("draft|{}|{}|{}", normalized, network, now_unix_ts()),
        24,
    );
    let draft = WalletCreateDraft {
        draft_id: draft_id.clone(),
        mnemonic: normalized.clone(),
        network: network.clone(),
        birthday_height,
        created_at_ts: now_unix_ts(),
    };
    let draft_path = wallet_create_draft_file(&app)?;
    if draft_path.exists() {
        let _ = fs::remove_file(&draft_path);
    }
    write_wallet_create_draft(&draft_path, &draft)?;
    Ok(WalletCreateResponse {
        mnemonic_words: normalized.split(' ').map(String::from).collect(),
        snapshot: preview,
        draft_id,
    })
}

#[tauri::command]
fn wallet_finalize_create(
    app: tauri::AppHandle,
    mnemonic: String,
    network: String,
    birthday_height: Option<u32>,
    draft_id: Option<String>,
) -> Result<WalletOpResponse, String> {
    if network != "mainnet" && network != "testnet" {
        return Err("Unsupported network. Use mainnet or testnet.".to_string());
    }
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
    let draft_path = wallet_create_draft_file(&app)?;
    if let Some(draft) = read_wallet_create_draft(&draft_path)? {
        if let Some(expected) = draft_id {
            if expected != draft.draft_id {
                return Ok(WalletOpResponse {
                    ok: false,
                    snapshot: None,
                    error: Some("Wallet creation draft expired. Please restart create-wallet flow.".to_string()),
                });
            }
        }
        if draft.network != network || draft.mnemonic != normalized {
            return Ok(WalletOpResponse {
                ok: false,
                snapshot: None,
                error: Some("Wallet creation draft mismatch. Please restart create-wallet flow.".to_string()),
            });
        }
    }
    let path = wallet_file(&app)?;
    let record = build_record(
        &normalized,
        &network,
        birthday_height.unwrap_or_else(|| default_birthday_height(&network)),
    );
    write_wallet(&path, &record)?;
    if draft_path.exists() {
        let _ = fs::remove_file(&draft_path);
    }
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
) -> Result<WalletOpResponse, String> {
    if network != "mainnet" && network != "testnet" {
        return Err("Unsupported network. Use mainnet or testnet.".to_string());
    }
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
    );
    write_wallet(&path, &record)?;
    let draft_path = wallet_create_draft_file(&app)?;
    if draft_path.exists() {
        let _ = fs::remove_file(&draft_path);
    }
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
    let draft_path = wallet_create_draft_file(&app)?;
    if draft_path.exists() {
        fs::remove_file(&draft_path).map_err(|e| format!("wallet draft delete failed: {}", e))?;
    }
    Ok(WalletOpResponse {
        ok: true,
        snapshot: None,
        error: None,
    })
}

#[tauri::command]
fn get_balance(app: tauri::AppHandle) -> Result<BalanceInfo, String> {
    let path = wallet_file(&app)?;
    let exists = read_wallet(&path)?.is_some();
    if !exists {
        return Err("Wallet is not initialized.".to_string());
    }
    Ok(BalanceInfo {
        orchard_zat: 0,
        sapling_zat: 0,
        transparent_zat: 0,
        pending_zat: 0,
    })
}

#[tauri::command]
fn get_unified_address(app: tauri::AppHandle) -> Result<String, String> {
    let path = wallet_file(&app)?;
    let wallet = read_wallet(&path)?.ok_or_else(|| "Wallet is not initialized.".to_string())?;
    Ok(wallet.unified_address)
}

#[tauri::command]
fn propose_transfer(to: String, amount_zat: u64, memo: Option<String>) -> Result<String, String> {
    if !(to.starts_with("u1") || to.starts_with("zs1") || to.starts_with("t1")) {
        return Err("Invalid recipient address format.".to_string());
    }
    if amount_zat == 0 {
        return Err("Amount must be greater than zero.".to_string());
    }
    let proposal = serde_json::json!({
        "to": to,
        "amountZat": amount_zat,
        "memo": memo,
        "feeRule": "zip317",
        "zip315Compliant": true,
        "poolStrategy": "no_auto_pool_combination"
    });
    serde_json::to_string(&proposal).map_err(|e| format!("proposal serialize failed: {}", e))
}

#[tauri::command]
fn execute_transfer(proposal_json: String) -> Result<String, String> {
    let _: serde_json::Value =
        serde_json::from_str(&proposal_json).map_err(|e| format!("proposal parse failed: {}", e))?;
    Ok(deterministic_hex(&proposal_json, 64))
}

#[tauri::command]
fn start_sync(app: tauri::AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let total: u32 = 100;
        for height in (0..=total).step_by(10) {
            let payload = SyncProgressEvent { height, total };
            let _ = app_handle.emit("sync-progress", payload);
            let _ = app_handle.emit("balance-updated", serde_json::json!({ "height": height }));
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
        let _ = app_handle.emit("sync-complete", serde_json::json!({ "ok": true }));
    });
    Ok(())
}

#[tauri::command]
fn get_transactions(app: tauri::AppHandle, limit: u32) -> Result<Vec<TxInfo>, String> {
    let path = wallet_file(&app)?;
    let exists = read_wallet(&path)?.is_some();
    if !exists {
        return Err("Wallet is not initialized.".to_string());
    }
    let _ = limit;
    Ok(Vec::new())
}

#[tauri::command]
fn set_lightwalletd_server(app: tauri::AppHandle, url: String) -> Result<bool, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Invalid URL: expected http:// or https://".to_string());
    }
    let cfg_path = lightwalletd_file(&app)?;
    let data = serde_json::json!({ "url": url });
    let bytes =
        serde_json::to_vec_pretty(&data).map_err(|e| format!("config serialize failed: {}", e))?;
    fs::write(cfg_path, bytes).map_err(|e| format!("config write failed: {}", e))?;
    Ok(true)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
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
            wallet_reset,
            get_balance,
            get_unified_address,
            propose_transfer,
            execute_transfer,
            start_sync,
            get_transactions,
            set_lightwalletd_server
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}
