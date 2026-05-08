// Tauri desktop shell: in release, load bundled frontend assets directly.
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use argon2::Argon2;
use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use bip39::{Language, Mnemonic};
use rand::RngCore;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use secrecy::SecretVec;
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{LazyLock, Mutex};
use std::time::Instant;
use tauri::Manager;
use tauri::Emitter;
use zcash_client_backend::data_api::wallet::{
    ConfirmationsPolicy, SpendingKeys, TargetHeight, create_proposed_transactions,
    propose_standard_transfer_to_address,
};
use zcash_client_backend::data_api::chain::{BlockCache, BlockSource};
use zcash_client_backend::data_api::{Account as WalletAccount, AccountBirthday, AccountSource, InputSource, WalletRead, WalletWrite};
use zcash_client_backend::fees::StandardFeeRule;
use zcash_client_backend::proto::compact_formats::CompactBlock;
use zcash_client_backend::proto::service::{self, compact_tx_streamer_client::CompactTxStreamerClient};
use zcash_client_backend::sync;
use zcash_client_backend::wallet::OvkPolicy;
use zcash_client_sqlite::util::SystemClock;
use zcash_client_sqlite::wallet::init::init_wallet_db;
use zcash_client_sqlite::WalletDb;
use zcash_keys::address::Address as ZcashPoolAddress;
use zcash_keys::keys::{
    ReceiverRequirement, UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedSpendingKey,
};
use zcash_proofs::prover::LocalTxProver;
use zcash_protocol::ShieldedProtocol;
use zcash_protocol::consensus::{BlockHeight, MAIN_NETWORK, TEST_NETWORK};
use zcash_protocol::memo::Memo;
use zcash_protocol::value::Zatoshis;
use zcash_protocol::TxId;
use zip32::AccountId;

/// Serializes `start_sync` chain scans so two runs never open/write the same wallet DB concurrently
/// (SQLite busy → UI freeze / sync errors).
static LIGHTWALLETD_SYNC_LOCK: LazyLock<tokio::sync::Mutex<()>> =
    LazyLock::new(|| tokio::sync::Mutex::new(()));

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WalletRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mnemonic: Option<String>,
    #[serde(default)]
    mnemonic_ciphertext_b64: String,
    #[serde(default)]
    mnemonic_salt_b64: String,
    #[serde(default)]
    mnemonic_nonce_b64: String,
    network: String,
    #[serde(default)]
    wallet_name: String,
    wallet_fingerprint: String,
    unified_address: String,
    #[serde(default)]
    orchard_unified_address: String,
    #[serde(default)]
    sapling_unified_address: String,
    #[serde(default)]
    unified_orchard_transparent_address: String,
    #[serde(default)]
    unified_sapling_transparent_address: String,
    #[serde(default)]
    unified_all_address: String,
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
    #[serde(default)]
    orchard_unified_address: String,
    #[serde(default)]
    sapling_unified_address: String,
    #[serde(default)]
    unified_orchard_transparent_address: String,
    #[serde(default)]
    unified_sapling_transparent_address: String,
    #[serde(default)]
    unified_all_address: String,
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

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct WalletStore {
    #[serde(default)]
    app_password_hash_b64: String,
    #[serde(default)]
    app_password_salt_b64: String,
    active_wallet_fingerprint: Option<String>,
    wallets: Vec<WalletRecord>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WalletListResponse {
    wallets: Vec<WalletSnapshot>,
    active_wallet_fingerprint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppLockStateResponse {
    configured: bool,
    locked: bool,
    has_wallets: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MarketPriceResponse {
    zec_usd_price: f64,
    price_change_24h: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WalletBackupExport {
    wallet_fingerprint: String,
    wallet_name: String,
    network: String,
    mnemonic: String,
}

#[derive(Default)]
struct AppSecurityState {
    unlocked_password: Mutex<Option<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BalanceInfo {
    orchard_zat: u64,
    sapling_zat: u64,
    transparent_zat: u64,
    pending_zat: u64,
    total_zat: u64,
    spendable_zat: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TxInfo {
    txid: String,
    value_zat: i64,
    timestamp: u64,
    block_height: u32,
    fee_zat: i64,
    to_address: Option<String>,
    from_address: Option<String>,
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferProposalPayload {
    to: String,
    amount_zat: u64,
    memo: Option<String>,
}

const DEFAULT_LIGHTWALLETD_ENDPOINT: &str = "http://88.99.165.25:9067";

/// Blocks per `sync::run` download/scan step. The upstream default in sample code is often 100;
/// values around 1k–2k cut lightwalletd round-trips dramatically for long historical scans.
const LIGHTWALLETD_SYNC_BATCH_SIZE: u32 = 1_500;

#[derive(Default)]
struct MemoryBlockCache {
    blocks: Mutex<Vec<CompactBlock>>,
}

#[derive(Debug)]
struct CacheError(&'static str);

impl std::fmt::Display for CacheError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for CacheError {}

impl BlockSource for MemoryBlockCache {
    type Error = CacheError;

    fn with_blocks<F, WalletErrT>(
        &self,
        from_height: Option<BlockHeight>,
        limit: Option<usize>,
        mut with_block: F,
    ) -> Result<(), zcash_client_backend::data_api::chain::error::Error<WalletErrT, Self::Error>>
    where
        F: FnMut(CompactBlock)
            -> Result<(), zcash_client_backend::data_api::chain::error::Error<WalletErrT, Self::Error>>,
    {
        let blocks = self.blocks.lock().map_err(|_| {
            zcash_client_backend::data_api::chain::error::Error::BlockSource(CacheError(
                "block cache lock poisoned",
            ))
        })?;
        let start = from_height.map(u32::from).unwrap_or(0);
        let mut emitted = 0usize;
        for block in blocks.iter().filter(|b| b.height >= u64::from(start)) {
            with_block(block.clone())?;
            emitted += 1;
            if let Some(max) = limit {
                if emitted >= max {
                    break;
                }
            }
        }
        Ok(())
    }
}

#[async_trait]
impl BlockCache for MemoryBlockCache {
    fn get_tip_height(
        &self,
        range: Option<&zcash_client_backend::data_api::scanning::ScanRange>,
    ) -> Result<Option<BlockHeight>, Self::Error> {
        let blocks = self
            .blocks
            .lock()
            .map_err(|_| CacheError("block cache lock poisoned"))?;
        let mut max_h: Option<u32> = None;
        for block in blocks.iter() {
            let h = block.height.min(u64::from(u32::MAX)) as u32;
            let bh = BlockHeight::from(h);
            let in_range = range.map(|r| r.block_range().contains(&bh)).unwrap_or(true);
            if in_range {
                max_h = Some(max_h.map(|m| m.max(h)).unwrap_or(h));
            }
        }
        Ok(max_h.map(BlockHeight::from))
    }

    async fn read(
        &self,
        range: &zcash_client_backend::data_api::scanning::ScanRange,
    ) -> Result<Vec<CompactBlock>, Self::Error> {
        let blocks = self
            .blocks
            .lock()
            .map_err(|_| CacheError("block cache lock poisoned"))?;
        Ok(blocks
            .iter()
            .filter(|b| {
                let h = BlockHeight::from(b.height.min(u64::from(u32::MAX)) as u32);
                range.block_range().contains(&h)
            })
            .cloned()
            .collect())
    }

    async fn insert(&self, mut compact_blocks: Vec<CompactBlock>) -> Result<(), Self::Error> {
        let mut blocks = self
            .blocks
            .lock()
            .map_err(|_| CacheError("block cache lock poisoned"))?;
        blocks.append(&mut compact_blocks);
        blocks.sort_by_key(|b| b.height);
        blocks.dedup_by_key(|b| b.height);
        Ok(())
    }

    async fn delete(
        &self,
        range: zcash_client_backend::data_api::scanning::ScanRange,
    ) -> Result<(), Self::Error> {
        let mut blocks = self
            .blocks
            .lock()
            .map_err(|_| CacheError("block cache lock poisoned"))?;
        blocks.retain(|b| {
            let h = BlockHeight::from(b.height.min(u64::from(u32::MAX)) as u32);
            !range.block_range().contains(&h)
        });
        Ok(())
    }
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

fn validate_password(password: &str) -> Result<(), String> {
    if password.trim().len() < 8 {
        return Err("Password must be at least 8 characters.".to_string());
    }
    Ok(())
}

fn encrypt_mnemonic(mnemonic: &str, password: &str) -> Result<(String, String, String), String> {
    validate_password(password)?;
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce);

    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut key)
        .map_err(|e| format!("password KDF failed: {}", e))?;

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("cipher init failed: {}", e))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), mnemonic.as_bytes())
        .map_err(|e| format!("seed encryption failed: {}", e))?;

    Ok((B64.encode(ciphertext), B64.encode(salt), B64.encode(nonce)))
}

fn decrypt_mnemonic(
    ciphertext_b64: &str,
    salt_b64: &str,
    nonce_b64: &str,
    password: &str,
) -> Result<String, String> {
    validate_password(password)?;
    let ciphertext = B64
        .decode(ciphertext_b64.as_bytes())
        .map_err(|e| format!("ciphertext decode failed: {}", e))?;
    let salt = B64
        .decode(salt_b64.as_bytes())
        .map_err(|e| format!("salt decode failed: {}", e))?;
    let nonce = B64
        .decode(nonce_b64.as_bytes())
        .map_err(|e| format!("nonce decode failed: {}", e))?;
    if salt.len() != 16 || nonce.len() != 12 {
        return Err("invalid wallet encryption metadata".to_string());
    }
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut key)
        .map_err(|e| format!("password KDF failed: {}", e))?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("cipher init failed: {}", e))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "Invalid wallet password.".to_string())?;
    String::from_utf8(plaintext).map_err(|e| format!("decrypted mnemonic utf8 failed: {}", e))
}

fn hash_password(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("password KDF failed: {}", e))?;
    Ok(key)
}

fn hash_password_for_store(password: &str) -> Result<(String, String), String> {
    validate_password(password)?;
    let mut salt = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    let hash = hash_password(password, &salt)?;
    Ok((B64.encode(hash), B64.encode(salt)))
}

fn verify_store_password(store: &WalletStore, password: &str) -> Result<bool, String> {
    if store.app_password_hash_b64.is_empty() || store.app_password_salt_b64.is_empty() {
        return Ok(false);
    }
    validate_password(password)?;
    let expected = B64
        .decode(store.app_password_hash_b64.as_bytes())
        .map_err(|e| format!("password hash decode failed: {}", e))?;
    let salt = B64
        .decode(store.app_password_salt_b64.as_bytes())
        .map_err(|e| format!("password salt decode failed: {}", e))?;
    if expected.len() != 32 || salt.len() != 16 {
        return Err("invalid app password metadata".to_string());
    }
    let computed = hash_password(password, &salt)?;
    Ok(expected == computed)
}

fn is_app_password_configured(store: &WalletStore) -> bool {
    !store.app_password_hash_b64.is_empty() && !store.app_password_salt_b64.is_empty()
}

fn is_app_locked(app: &tauri::AppHandle, store: &WalletStore) -> bool {
    if !is_app_password_configured(store) {
        return false;
    }
    let state = app.state::<AppSecurityState>();
    let guard = state.unlocked_password.lock();
    match guard {
        Ok(g) => g.is_none(),
        Err(_) => true,
    }
}

fn clear_unlocked_password(app: &tauri::AppHandle) {
    let state = app.state::<AppSecurityState>();
    let lock_result = state.unlocked_password.lock();
    if let Ok(mut guard) = lock_result {
        *guard = None;
    }
}

fn set_unlocked_password(app: &tauri::AppHandle, password: String) {
    let state = app.state::<AppSecurityState>();
    let lock_result = state.unlocked_password.lock();
    if let Ok(mut guard) = lock_result {
        *guard = Some(password);
    }
}

fn get_unlocked_password(app: &tauri::AppHandle) -> Option<String> {
    let state = app.state::<AppSecurityState>();
    let guard = state.unlocked_password.lock().ok()?;
    guard.clone()
}

fn ensure_app_unlocked(app: &tauri::AppHandle, store: &WalletStore) -> Result<(), String> {
    if is_app_locked(app, store) {
        return Err("App is locked. Unlock the app first.".to_string());
    }
    Ok(())
}

fn wallet_plain_mnemonic(
    app: &tauri::AppHandle,
    store: &WalletStore,
    wallet: &WalletRecord,
) -> Result<String, String> {
    if let Some(mnemonic) = &wallet.mnemonic {
        return Ok(normalize_mnemonic(mnemonic));
    }
    if wallet.mnemonic_ciphertext_b64.is_empty()
        || wallet.mnemonic_salt_b64.is_empty()
        || wallet.mnemonic_nonce_b64.is_empty()
    {
        return Err("Wallet backup data is unavailable for this wallet record.".to_string());
    }
    let password = if is_app_password_configured(store) {
        get_unlocked_password(app)
            .ok_or_else(|| "App is locked. Unlock the app first.".to_string())?
    } else {
        return Err("App password is not configured for backup export.".to_string());
    };
    decrypt_mnemonic(
        &wallet.mnemonic_ciphertext_b64,
        &wallet.mnemonic_salt_b64,
        &wallet.mnemonic_nonce_b64,
        &password,
    )
}

fn resolve_wallet_password(
    app: &tauri::AppHandle,
    store: &mut WalletStore,
    provided_password: Option<String>,
) -> Result<String, String> {
    if is_app_password_configured(store) {
        if let Some(pass) = get_unlocked_password(app) {
            return Ok(pass);
        }
        if let Some(pass) = provided_password {
            if verify_store_password(store, &pass)? {
                set_unlocked_password(app, pass.clone());
                return Ok(pass);
            }
            return Err("Invalid app password.".to_string());
        }
        return Err("App is locked. Unlock the app first.".to_string());
    }

    let pass = provided_password.ok_or_else(|| "App password is required during onboarding.".to_string())?;
    validate_password(&pass)?;
    let (hash_b64, salt_b64) = hash_password_for_store(&pass)?;
    store.app_password_hash_b64 = hash_b64;
    store.app_password_salt_b64 = salt_b64;
    set_unlocked_password(app, pass.clone());
    Ok(pass)
}

/// Addresses derived at a **single** ZIP-32 diversifier index: the same index
/// `zcash_client_sqlite::wallet::add_account` uses (`default_address(AllAvailableKeys)`).
/// All variants (shielded-first UA, orchard-only, t1, …) are built at that index so the
/// Receive screen matches the addresses the sync DB registers for transparent UTXO queries.
#[derive(Debug, Clone)]
struct DerivedWalletAddresses {
    unified_address: String,
    orchard_unified_address: String,
    sapling_unified_address: String,
    unified_orchard_transparent_address: String,
    unified_sapling_transparent_address: String,
    unified_all_address: String,
    sapling_address: String,
    transparent_address: String,
}

fn derive_real_addresses(normalized_mnemonic: &str, network: &str) -> Result<DerivedWalletAddresses, String> {
    let seed = Mnemonic::parse_in_normalized(Language::English, normalized_mnemonic)
        .map_err(|e| format!("mnemonic parse failed: {}", e))?
        .to_seed("");

    let account = AccountId::ZERO;
    if network == "testnet" {
        let usk = UnifiedSpendingKey::from_seed(&TEST_NETWORK, &seed, account)
            .map_err(|e| format!("USK derivation failed: {}", e))?;
        let ufvk = usk.to_unified_full_viewing_key();
        derive_ufvk_addresses(&ufvk, &TEST_NETWORK)
    } else {
        let usk = UnifiedSpendingKey::from_seed(&MAIN_NETWORK, &seed, account)
            .map_err(|e| format!("USK derivation failed: {}", e))?;
        let ufvk = usk.to_unified_full_viewing_key();
        derive_ufvk_addresses(&ufvk, &MAIN_NETWORK)
    }
}

fn derive_ufvk_addresses<P: zcash_protocol::consensus::Parameters + Copy>(
    ufvk: &UnifiedFullViewingKey,
    params: &P,
) -> Result<DerivedWalletAddresses, String> {
    // Must match `add_account` → `default_address(UnifiedAddressRequest::AllAvailableKeys)` or
    // transparent receivers / UTXO refresh will track different t1 than we show in `wallet.json`.
    let (_, j) = ufvk
        .default_address(UnifiedAddressRequest::AllAvailableKeys)
        .map_err(|e| format!("default unified address (AllAvailableKeys) failed: {}", e))?;

    let orchard_sapling = UnifiedAddressRequest::custom(
        ReceiverRequirement::Require,
        ReceiverRequirement::Require,
        ReceiverRequirement::Omit,
    )
    .map_err(|e| format!("unified address request (orchard + sapling) failed: {}", e))?;
    let ua_os = ufvk
        .address(j, orchard_sapling)
        .map_err(|e| format!("unified address (orchard + sapling) at wallet diversifier failed: {}", e))?;

    // Shielded-first UA (Orchard + Sapling, omit transparent) at the wallet’s diversifier index.
    let unified_address = ua_os.encode(params);
    let sapling_address = ua_os
        .sapling()
        .map(|addr| ZcashPoolAddress::Sapling(*addr).encode(params))
        .ok_or_else(|| "Sapling receiver missing at chosen diversifier.".to_string())?;

    let orchard_ua = ufvk
        .address(j, UnifiedAddressRequest::ORCHARD)
        .map_err(|e| format!("orchard-only unified address failed: {}", e))?;
    let orchard_unified_address = orchard_ua.encode(params);

    let sapling_only = UnifiedAddressRequest::custom(
        ReceiverRequirement::Omit,
        ReceiverRequirement::Require,
        ReceiverRequirement::Omit,
    )
    .map_err(|e| format!("unified address request (sapling only) failed: {}", e))?;
    let ua_sapling_only = ufvk
        .address(j, sapling_only)
        .map_err(|e| format!("sapling-only unified address failed: {}", e))?;
    let sapling_unified_address = ua_sapling_only.encode(params);

    // Orchard + transparent at same fixed diversifier index.
    let orchard_transparent = UnifiedAddressRequest::custom(
        ReceiverRequirement::Require,
        ReceiverRequirement::Omit,
        ReceiverRequirement::Require,
    )
    .map_err(|e| format!("unified address request (orchard + transparent) failed: {}", e))?;
    let ua_ot = ufvk
        .address(j, orchard_transparent)
        .map_err(|e| format!("unified address (orchard + transparent) failed: {}", e))?;
    let unified_orchard_transparent_address = ua_ot.encode(params);
    let transparent_address = ua_ot
        .transparent()
        .map(|addr| ZcashPoolAddress::Transparent(*addr).encode(params))
        .ok_or_else(|| "Transparent receiver missing at chosen diversifier.".to_string())?;

    let sapling_transparent = UnifiedAddressRequest::custom(
        ReceiverRequirement::Omit,
        ReceiverRequirement::Require,
        ReceiverRequirement::Require,
    )
    .map_err(|e| format!("unified address request (sapling + transparent) failed: {}", e))?;
    let ua_st = ufvk
        .address(j, sapling_transparent)
        .map_err(|e| format!("unified address (sapling + transparent) failed: {}", e))?;
    let unified_sapling_transparent_address = ua_st.encode(params);
    let all_receivers = UnifiedAddressRequest::custom(
        ReceiverRequirement::Require,
        ReceiverRequirement::Require,
        ReceiverRequirement::Require,
    )
    .map_err(|e| format!("unified address request (all receivers) failed: {}", e))?;
    let ua_all = ufvk
        .address(j, all_receivers)
        .map_err(|e| format!("unified address (all receivers) failed: {}", e))?;
    let unified_all_address = ua_all.encode(params);

    // Guard against accidental mismatches across requests at the same diversifier index.
    let transparent_from_ot = ua_ot
        .transparent()
        .map(|addr| ZcashPoolAddress::Transparent(*addr).encode(params))
        .ok_or_else(|| "Transparent receiver missing in Orchard+Transparent UA.".to_string())?;
    let transparent_from_st = ua_st
        .transparent()
        .map(|addr| ZcashPoolAddress::Transparent(*addr).encode(params))
        .ok_or_else(|| "Transparent receiver missing in Sapling+Transparent UA.".to_string())?;
    if transparent_address != transparent_from_ot || transparent_address != transparent_from_st {
        return Err("Transparent derivation mismatch across unified address variants.".to_string());
    }

    Ok(DerivedWalletAddresses {
        unified_address,
        orchard_unified_address,
        sapling_unified_address,
        unified_orchard_transparent_address,
        unified_sapling_transparent_address,
        unified_all_address,
        sapling_address,
        transparent_address,
    })
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
        orchard_unified_address: record.orchard_unified_address.clone(),
        sapling_unified_address: record.sapling_unified_address.clone(),
        unified_orchard_transparent_address: record.unified_orchard_transparent_address.clone(),
        unified_sapling_transparent_address: record.unified_sapling_transparent_address.clone(),
        unified_all_address: record.unified_all_address.clone(),
        sapling_address: record.sapling_address.clone(),
        transparent_address: record.transparent_address.clone(),
        created_at_ts: record.created_at_ts,
        birthday_height: record.birthday_height,
    }
}

fn build_preview_snapshot(normalized_mnemonic: &str, network: &str, birthday_height: u32) -> WalletSnapshot {
    WalletSnapshot {
        network: network.to_string(),
        wallet_name: String::new(),
        wallet_fingerprint: deterministic_hex(&format!("fp|{}", normalized_mnemonic), 16),
        unified_address: String::new(),
        orchard_unified_address: String::new(),
        sapling_unified_address: String::new(),
        unified_orchard_transparent_address: String::new(),
        unified_sapling_transparent_address: String::new(),
        unified_all_address: String::new(),
        sapling_address: String::new(),
        transparent_address: String::new(),
        created_at_ts: now_unix_ts(),
        birthday_height,
    }
}

fn build_record(
    normalized_mnemonic: &str,
    network: &str,
    birthday_height: u32,
    password: &str,
    wallet_name: Option<&str>,
) -> Result<WalletRecord, String> {
    let derived = derive_real_addresses(normalized_mnemonic, network)?;
    let (mnemonic_ciphertext_b64, mnemonic_salt_b64, mnemonic_nonce_b64) =
        encrypt_mnemonic(normalized_mnemonic, password)?;
    let fingerprint = deterministic_hex(&format!("fp|{}", normalized_mnemonic), 16);
    let resolved_name = wallet_name
        .map(|n| n.trim())
        .filter(|n| !n.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("Wallet {}", &fingerprint[0..6]));
    Ok(WalletRecord {
        mnemonic: None,
        mnemonic_ciphertext_b64,
        mnemonic_salt_b64,
        mnemonic_nonce_b64,
        network: network.to_string(),
        wallet_name: resolved_name,
        wallet_fingerprint: fingerprint,
        unified_address: derived.unified_address,
        orchard_unified_address: derived.orchard_unified_address,
        sapling_unified_address: derived.sapling_unified_address,
        unified_orchard_transparent_address: derived.unified_orchard_transparent_address,
        unified_sapling_transparent_address: derived.unified_sapling_transparent_address,
        unified_all_address: derived.unified_all_address,
        sapling_address: derived.sapling_address,
        transparent_address: derived.transparent_address,
        created_at_ts: now_unix_ts(),
        birthday_height,
    })
}

fn wallet_store_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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

fn write_wallet_store(path: &Path, store: &WalletStore) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(store).map_err(|e| format!("wallet serialize failed: {}", e))?;
    write_bytes_atomic(path, &json)
}

fn read_wallet_store(path: &Path) -> Result<WalletStore, String> {
    if !path.exists() {
        return Ok(WalletStore::default());
    }
    let raw = fs::read(path).map_err(|e| format!("wallet read failed: {}", e))?;
    if let Ok(store) = serde_json::from_slice::<WalletStore>(&raw) {
        return Ok(store);
    }
    // Legacy single-wallet migration.
    if let Ok(wallet) = serde_json::from_slice::<WalletRecord>(&raw) {
        return Ok(WalletStore {
            app_password_hash_b64: String::new(),
            app_password_salt_b64: String::new(),
            active_wallet_fingerprint: Some(wallet.wallet_fingerprint.clone()),
            wallets: vec![wallet],
        });
    }
    Err("wallet parse failed: unsupported format".to_string())
}

fn upsert_wallet(store: &mut WalletStore, record: WalletRecord) {
    let record_fingerprint = record.wallet_fingerprint.clone();
    if let Some(existing) = store
        .wallets
        .iter_mut()
        .find(|w| w.wallet_fingerprint == record_fingerprint)
    {
        *existing = record;
    } else {
        store.wallets.push(record);
    }
    // Keep the current active wallet stable unless there wasn't one yet.
    // This avoids surprising "balance became zero" UX when importing/creating another wallet.
    if store.active_wallet_fingerprint.is_none() {
        store.active_wallet_fingerprint = Some(record_fingerprint);
    }
}

fn active_wallet<'a>(store: &'a WalletStore) -> Option<&'a WalletRecord> {
    if let Some(active) = &store.active_wallet_fingerprint {
        if let Some(found) = store.wallets.iter().find(|w| &w.wallet_fingerprint == active) {
            return Some(found);
        }
    }
    store.wallets.first()
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

fn load_lightwalletd_endpoint(app: &tauri::AppHandle) -> Result<String, String> {
    let cfg_path = lightwalletd_file(app)?;
    if !cfg_path.exists() {
        return Ok(DEFAULT_LIGHTWALLETD_ENDPOINT.to_string());
    }
    let raw = fs::read(&cfg_path).map_err(|e| format!("config read failed: {}", e))?;
    let parsed: serde_json::Value =
        serde_json::from_slice(&raw).map_err(|e| format!("config parse failed: {}", e))?;
    let url = parsed
        .get("url")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_LIGHTWALLETD_ENDPOINT);
    Ok(url.to_string())
}

fn normalize_grpc_endpoint(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    if trimmed.starts_with("localhost")
        || trimmed.starts_with("127.0.0.1")
        || trimmed.contains(":9067")
    {
        return format!("http://{}", trimmed);
    }
    if trimmed.contains(":443") {
        return format!("https://{}", trimmed);
    }
    format!("https://{}", trimmed)
}

fn lightwalletd_endpoint_candidates(configured: &str, network: &str) -> Vec<String> {
    let mut out = Vec::<String>::new();
    let mut push_unique = |url: &str| {
        let normalized = normalize_grpc_endpoint(url);
        if !out.iter().any(|e| e == &normalized) {
            out.push(normalized);
        }
    };
    push_unique(configured);
    match network {
        "mainnet" => {
            push_unique("http://88.99.165.25:9067");
        }
        "testnet" => {
            push_unique("http://88.99.165.25:19067");
        }
        _ => {}
    }
    out
}

async fn select_lightwalletd_endpoint(candidates: &[String]) -> Result<String, String> {
    let mut errors = Vec::new();
    for endpoint in candidates {
        log::info!("sync endpoint probe start: {}", endpoint);
        match CompactTxStreamerClient::connect(endpoint.clone()).await {
            Ok(_) => {
                log::info!("sync endpoint probe success: {}", endpoint);
                return Ok(endpoint.clone());
            }
            Err(error) => {
                log::warn!("sync endpoint probe failed: {} => {}", endpoint, error);
                errors.push(format!("{} => {}", endpoint, error));
            }
        }
    }
    Err(format!(
        "lightwalletd connect failed for all candidates: {}",
        errors.join(" | ")
    ))
}

async fn select_lightwalletd_endpoint_with_tip(candidates: &[String]) -> Result<(String, u32), String> {
    let mut errors = Vec::new();
    for endpoint in candidates {
        log::info!("sync endpoint tip probe start: {}", endpoint);
        let mut client = match CompactTxStreamerClient::connect(endpoint.clone()).await {
            Ok(client) => client,
            Err(error) => {
                log::warn!("sync endpoint tip probe connect failed: {} => {}", endpoint, error);
                errors.push(format!("{} connect => {}", endpoint, error));
                continue;
            }
        };
        match client.get_latest_block(service::ChainSpec {}).await {
            Ok(resp) => {
                let tip = resp.into_inner().height.min(u64::from(u32::MAX)) as u32;
                log::info!("sync endpoint tip probe success: {} tip={}", endpoint, tip);
                return Ok((endpoint.clone(), tip));
            }
            Err(error) => {
                log::warn!("sync endpoint tip probe failed: {} => {}", endpoint, error);
                errors.push(format!("{} tip => {}", endpoint, error));
            }
        }
    }
    Err(format!(
        "lightwalletd tip probe failed for all candidates: {}",
        errors.join(" | ")
    ))
}

fn wallet_runtime_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {}", e))?
        .join("wallet-runtime");
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create wallet runtime dir: {}", e))?;
    Ok(dir)
}

fn wallet_data_db_path(app: &tauri::AppHandle, wallet_fingerprint: &str) -> Result<PathBuf, String> {
    let dir = wallet_runtime_dir(app)?;
    Ok(dir.join(format!("wallet-{}.db", wallet_fingerprint)))
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

async fn sync_wallet_for_network<P>(
    params: P,
    app: &tauri::AppHandle,
    wallet: &WalletRecord,
    seed_bytes: &[u8],
    endpoint: &str,
) -> Result<(), String>
where
    P: zcash_protocol::consensus::Parameters + Clone + Send + Sync + 'static,
{
    let sync_started = Instant::now();
    let candidates = lightwalletd_endpoint_candidates(endpoint, wallet.network.as_str());
    log::info!(
        "sync_wallet_for_network start: wallet={} network={} candidates={}",
        wallet.wallet_fingerprint,
        wallet.network,
        candidates.len()
    );
    let (selected_endpoint, tip_height) = select_lightwalletd_endpoint_with_tip(&candidates).await?;
    let mut client = CompactTxStreamerClient::connect(selected_endpoint.clone())
        .await
        .map_err(|e| format!("lightwalletd connect failed: {}", e))?;
    log::info!(
        "sync using lightwalletd endpoint: wallet={} endpoint={}",
        wallet.wallet_fingerprint,
        selected_endpoint
    );

    log::info!(
        "sync tip received: wallet={} tip={} birthday={}",
        wallet.wallet_fingerprint,
        tip_height,
        wallet.birthday_height
    );

    let data_db_path = wallet_data_db_path(app, &wallet.wallet_fingerprint)?;
    log::info!(
        "sync opening wallet db: wallet={} path={}",
        wallet.wallet_fingerprint,
        data_db_path.display()
    );
    let mut db_data = WalletDb::for_path(&data_db_path, params.clone(), SystemClock, rand::rngs::OsRng)
        .map_err(|e| format!("wallet db open failed: {}", e))?;
    init_wallet_db(&mut db_data, Some(SecretVec::new(seed_bytes.to_vec())))
        .map_err(|e| format!("wallet db init failed: {}", e))?;

    let account_ids = db_data
        .get_account_ids()
        .map_err(|e| format!("wallet account query failed: {}", e))?;
    if account_ids.is_empty() {
        let birthday_prior_height = wallet.birthday_height.saturating_sub(1).min(tip_height);
        log::info!(
            "sync account missing; creating account: wallet={} birthday_prior_height={}",
            wallet.wallet_fingerprint,
            birthday_prior_height
        );
        let tree_state = match client
            .get_tree_state(service::BlockId {
                height: u64::from(birthday_prior_height),
                hash: Vec::new(),
            })
            .await
        {
            Ok(resp) => resp.into_inner(),
            Err(primary_err) => {
                log::warn!(
                    "tree state missing at birthday height: wallet={} height={} err={}; retrying tip height {}",
                    wallet.wallet_fingerprint,
                    birthday_prior_height,
                    primary_err,
                    tip_height
                );
                client
                    .get_tree_state(service::BlockId {
                        height: u64::from(tip_height),
                        hash: Vec::new(),
                    })
                    .await
                    .map_err(|fallback_err| {
                        format!(
                            "tree state query failed at birthday height {} ({}) and tip {} ({})",
                            birthday_prior_height, primary_err, tip_height, fallback_err
                        )
                    })?
                    .into_inner()
            }
        };
        let birthday = AccountBirthday::from_treestate(tree_state, Some(tip_height.into()))
            .map_err(|_| "birthday creation failed from tree state".to_string())?;
        db_data
            .create_account(&wallet.wallet_name, &SecretVec::new(seed_bytes.to_vec()), &birthday, None)
            .map_err(|e| format!("wallet account creation failed: {}", e))?;
    }

    let db_cache = MemoryBlockCache::default();
    log::info!(
        "sync::run start: wallet={} tip={}",
        wallet.wallet_fingerprint,
        tip_height
    );
    sync::run(
        &mut client,
        &params,
        &db_cache,
        &mut db_data,
        LIGHTWALLETD_SYNC_BATCH_SIZE,
    )
    .await
    .map_err(|e| format!("wallet sync failed: {}", e))?;
    log::info!(
        "sync::run complete: wallet={} elapsed_ms={}",
        wallet.wallet_fingerprint,
        sync_started.elapsed().as_millis()
    );

    Ok(())
}

#[tauri::command]
fn wallet_create(
    app: tauri::AppHandle,
    network: String,
) -> Result<WalletCreateResponse, String> {
    if network != "mainnet" && network != "testnet" {
        return Err("Unsupported network. Use mainnet or testnet.".to_string());
    }
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
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
    password: Option<String>,
    wallet_name: Option<String>,
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
    let path = wallet_store_file(&app)?;
    let mut store = read_wallet_store(&path)?;
    let resolved_password = resolve_wallet_password(&app, &mut store, password)?;
    let record = build_record(
        &normalized,
        &network,
        birthday_height.unwrap_or_else(|| default_birthday_height(&network)),
        &resolved_password,
        wallet_name.as_deref(),
    )?;
    upsert_wallet(&mut store, record.clone());
    write_wallet_store(&path, &store)?;
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
    password: Option<String>,
    wallet_name: Option<String>,
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
    let path = wallet_store_file(&app)?;
    let mut store = read_wallet_store(&path)?;
    let resolved_password = resolve_wallet_password(&app, &mut store, password)?;
    let record = build_record(
        &normalized,
        &network,
        birthday_height.unwrap_or_else(|| default_birthday_height(&network)),
        &resolved_password,
        wallet_name.as_deref(),
    )?;
    upsert_wallet(&mut store, record.clone());
    write_wallet_store(&path, &store)?;
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

fn derived_addresses_match_record(record: &WalletRecord, derived: &DerivedWalletAddresses) -> bool {
    record.unified_address == derived.unified_address
        && record.orchard_unified_address == derived.orchard_unified_address
        && record.sapling_unified_address == derived.sapling_unified_address
        && record.unified_orchard_transparent_address == derived.unified_orchard_transparent_address
        && record.unified_sapling_transparent_address == derived.unified_sapling_transparent_address
        && record.unified_all_address == derived.unified_all_address
        && record.sapling_address == derived.sapling_address
        && record.transparent_address == derived.transparent_address
}

/// Re-derives receive addresses from the stored mnemonic and writes them to `wallet.json` when they
/// differ from current values. Keeps the UI / persisted snapshot aligned with `zcash_client_sqlite`
/// account addresses (and lightwalletd UTXO queries).
#[tauri::command]
fn wallet_reconcile_derived_addresses(app: tauri::AppHandle) -> Result<WalletOpResponse, String> {
    let path = wallet_store_file(&app)?;
    let mut store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let active = active_wallet(&store)
        .ok_or_else(|| "Wallet is not initialized.".to_string())?
        .clone();
    let normalized = {
        let raw = wallet_plain_mnemonic(&app, &store, &active)?;
        normalize_mnemonic(&raw)
    };
    let derived = derive_real_addresses(&normalized, &active.network)?;
    if !derived_addresses_match_record(&active, &derived) {
        let mut updated = active.clone();
        updated.unified_address = derived.unified_address.clone();
        updated.orchard_unified_address = derived.orchard_unified_address.clone();
        updated.sapling_unified_address = derived.sapling_unified_address.clone();
        updated.unified_orchard_transparent_address = derived.unified_orchard_transparent_address.clone();
        updated.unified_sapling_transparent_address = derived.unified_sapling_transparent_address.clone();
        updated.unified_all_address = derived.unified_all_address.clone();
        updated.sapling_address = derived.sapling_address.clone();
        updated.transparent_address = derived.transparent_address.clone();
        upsert_wallet(&mut store, updated);
        write_wallet_store(&path, &store)?;
    }
    let snapshot = active_wallet(&store).map(to_public_snapshot);
    Ok(WalletOpResponse {
        ok: true,
        snapshot,
        error: None,
    })
}

#[tauri::command]
fn wallet_get_state(app: tauri::AppHandle) -> Result<WalletOpResponse, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let snapshot = active_wallet(&store).map(to_public_snapshot);
    Ok(WalletOpResponse {
        ok: snapshot.is_some(),
        snapshot,
        error: None,
    })
}

#[tauri::command]
fn wallet_list(app: tauri::AppHandle) -> Result<WalletListResponse, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    Ok(WalletListResponse {
        wallets: store.wallets.iter().map(to_public_snapshot).collect(),
        active_wallet_fingerprint: store.active_wallet_fingerprint,
    })
}

#[tauri::command]
fn wallet_set_active(app: tauri::AppHandle, wallet_fingerprint: String) -> Result<WalletOpResponse, String> {
    let path = wallet_store_file(&app)?;
    let mut store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let found = store
        .wallets
        .iter()
        .any(|w| w.wallet_fingerprint == wallet_fingerprint);
    if !found {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Wallet fingerprint not found.".to_string()),
        });
    }
    store.active_wallet_fingerprint = Some(wallet_fingerprint);
    write_wallet_store(&path, &store)?;
    let snapshot = active_wallet(&store).map(to_public_snapshot);
    Ok(WalletOpResponse {
        ok: snapshot.is_some(),
        snapshot,
        error: None,
    })
}

#[tauri::command]
fn wallet_update_name(
    app: tauri::AppHandle,
    wallet_fingerprint: String,
    wallet_name: String,
) -> Result<WalletOpResponse, String> {
    let trimmed = wallet_name.trim();
    if trimmed.is_empty() {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Wallet name is required.".to_string()),
        });
    }
    let path = wallet_store_file(&app)?;
    let mut store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let mut updated = false;
    for wallet in &mut store.wallets {
        if wallet.wallet_fingerprint == wallet_fingerprint {
            wallet.wallet_name = trimmed.to_string();
            updated = true;
            break;
        }
    }
    if !updated {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Wallet fingerprint not found.".to_string()),
        });
    }
    write_wallet_store(&path, &store)?;
    let snapshot = active_wallet(&store).map(to_public_snapshot);
    Ok(WalletOpResponse {
        ok: snapshot.is_some(),
        snapshot,
        error: None,
    })
}

#[tauri::command]
fn wallet_remove(app: tauri::AppHandle, wallet_fingerprint: String) -> Result<WalletOpResponse, String> {
    let path = wallet_store_file(&app)?;
    let mut store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    if store.wallets.len() <= 1 {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Cannot remove the last wallet.".to_string()),
        });
    }
    if store.active_wallet_fingerprint.as_deref() == Some(wallet_fingerprint.as_str()) {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Cannot remove the active wallet. Switch active wallet first.".to_string()),
        });
    }
    let before = store.wallets.len();
    store
        .wallets
        .retain(|w| w.wallet_fingerprint != wallet_fingerprint);
    if store.wallets.len() == before {
        return Ok(WalletOpResponse {
            ok: false,
            snapshot: None,
            error: Some("Wallet fingerprint not found.".to_string()),
        });
    }
    write_wallet_store(&path, &store)?;
    let snapshot = active_wallet(&store).map(to_public_snapshot);
    Ok(WalletOpResponse {
        ok: snapshot.is_some(),
        snapshot,
        error: None,
    })
}

#[tauri::command]
fn wallet_export_backup(
    app: tauri::AppHandle,
    wallet_fingerprint: String,
) -> Result<WalletBackupExport, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let wallet = store
        .wallets
        .iter()
        .find(|w| w.wallet_fingerprint == wallet_fingerprint)
        .ok_or_else(|| "Wallet fingerprint not found.".to_string())?;
    let mnemonic = wallet_plain_mnemonic(&app, &store, wallet)?;
    Ok(WalletBackupExport {
        wallet_fingerprint: wallet.wallet_fingerprint.clone(),
        wallet_name: wallet.wallet_name.clone(),
        network: wallet.network.clone(),
        mnemonic,
    })
}

#[tauri::command]
fn wallet_export_all_backups(app: tauri::AppHandle) -> Result<Vec<WalletBackupExport>, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let mut exports = Vec::with_capacity(store.wallets.len());
    for wallet in &store.wallets {
        let mnemonic = wallet_plain_mnemonic(&app, &store, wallet)?;
        exports.push(WalletBackupExport {
            wallet_fingerprint: wallet.wallet_fingerprint.clone(),
            wallet_name: wallet.wallet_name.clone(),
            network: wallet.network.clone(),
            mnemonic,
        });
    }
    Ok(exports)
}

#[tauri::command]
fn app_get_lock_state(app: tauri::AppHandle) -> Result<AppLockStateResponse, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    Ok(AppLockStateResponse {
        configured: is_app_password_configured(&store),
        locked: is_app_locked(&app, &store),
        has_wallets: !store.wallets.is_empty(),
    })
}

#[tauri::command]
fn app_lock(app: tauri::AppHandle) -> Result<bool, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    if !is_app_password_configured(&store) {
        return Ok(false);
    }
    clear_unlocked_password(&app);
    Ok(true)
}

#[tauri::command]
fn app_unlock(app: tauri::AppHandle, password: String) -> Result<bool, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    if !is_app_password_configured(&store) {
        return Ok(false);
    }
    if !verify_store_password(&store, &password)? {
        return Ok(false);
    }
    set_unlocked_password(&app, password);
    Ok(true)
}

#[tauri::command]
fn wallet_reset(app: tauri::AppHandle) -> Result<WalletOpResponse, String> {
    let path = wallet_store_file(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("wallet delete failed: {}", e))?;
    }
    let draft_path = wallet_create_draft_file(&app)?;
    if draft_path.exists() {
        fs::remove_file(&draft_path).map_err(|e| format!("wallet draft delete failed: {}", e))?;
    }
    clear_unlocked_password(&app);
    Ok(WalletOpResponse {
        ok: true,
        snapshot: None,
        error: None,
    })
}

/// Reads balances from the local wallet DB populated by [`sync_wallet_for_network`] / `start_sync`.
/// Does not run a chain sync (avoids racing `start_sync` and long-blocking UI refresh).
/// Uses [`ConfirmationsPolicy::MIN`] so newly detected incoming funds appear in totals sooner; sends still use ZIP-315 defaults.
fn read_wallet_balance_from_db<P>(data_db_path: &Path, params: P) -> Result<BalanceInfo, String>
where
    P: zcash_protocol::consensus::Parameters + Copy,
{
    if !data_db_path.exists() {
        return Ok(BalanceInfo {
            orchard_zat: 0,
            sapling_zat: 0,
            transparent_zat: 0,
            pending_zat: 0,
            total_zat: 0,
            spendable_zat: 0,
        });
    }
    let db_data = WalletDb::for_path(data_db_path, params, SystemClock, rand::rngs::OsRng)
        .map_err(|e| format!("wallet db open failed: {}", e))?;
    let summary = db_data
        .get_wallet_summary(ConfirmationsPolicy::MIN)
        .map_err(|e| format!("wallet summary failed: {}", e))?;
    let mut orchard = 0u64;
    let mut sapling = 0u64;
    let mut transparent = 0u64;
    let mut pending = 0u64;
    if let Some(summary) = summary {
        for bal in summary.account_balances().values() {
            orchard = orchard.saturating_add(bal.orchard_balance().total().into_u64());
            sapling = sapling.saturating_add(bal.sapling_balance().total().into_u64());
            transparent = transparent.saturating_add(bal.unshielded_balance().total().into_u64());
            pending = pending.saturating_add(
                bal.change_pending_confirmation()
                    .into_u64()
                    .saturating_add(bal.value_pending_spendability().into_u64()),
            );
        }
    } else {
        log::warn!("get_wallet_summary returned None; using note/UTXO fallback for balance display");
        if let Some(tip) = db_data.chain_height().map_err(|e| format!("chain height query failed: {}", e))?
        {
            let target_height = TargetHeight::from(tip + 1);
            for account_id in db_data.get_account_ids().map_err(|e| format!("account ids failed: {}", e))?
            {
                match db_data.get_transparent_balances(
                    account_id,
                    target_height,
                    ConfirmationsPolicy::MIN,
                ) {
                    Ok(tb) => {
                        for (_addr, (_origin, balance)) in tb {
                            transparent = transparent.saturating_add(balance.total().into_u64());
                            pending = pending.saturating_add(
                                balance
                                    .change_pending_confirmation()
                                    .into_u64()
                                    .saturating_add(balance.value_pending_spendability().into_u64()),
                            );
                        }
                    }
                    Err(e) => {
                        log::warn!(
                            "fallback transparent balance failed account={:?} err={}",
                            account_id,
                            e
                        );
                    }
                }
                match InputSource::select_unspent_notes(
                    &db_data,
                    account_id,
                    &[ShieldedProtocol::Sapling, ShieldedProtocol::Orchard],
                    target_height,
                    &[],
                ) {
                    Ok(rn) => {
                        if let Ok(v) = rn.sapling_value() {
                            sapling = sapling.saturating_add(v.into_u64());
                        }
                        if let Ok(v) = rn.orchard_value() {
                            orchard = orchard.saturating_add(v.into_u64());
                        }
                    }
                    Err(e) => {
                        log::warn!(
                            "fallback select_unspent_notes failed account={:?} err={}",
                            account_id,
                            e
                        );
                    }
                }
            }
        }
    }
    let total = orchard.saturating_add(sapling).saturating_add(transparent);
    // Pending value (recent receives + change awaiting confirmation) should not be treated as sendable.
    let spendable = total.saturating_sub(pending);
    Ok(BalanceInfo {
        orchard_zat: orchard,
        sapling_zat: sapling,
        transparent_zat: transparent,
        pending_zat: pending,
        total_zat: total,
        spendable_zat: spendable,
    })
}

fn sqlite_transient_error(msg: &str) -> bool {
    let m = msg.to_lowercase();
    m.contains("database is locked") || m.contains("busy")
}

async fn fetch_transparent_balance_fallback(endpoint: &str, taddr: &str) -> Result<u64, String> {
    let mut client = CompactTxStreamerClient::connect(endpoint.to_string())
        .await
        .map_err(|e| format!("lightwalletd connect failed for transparent fallback: {}", e))?;
    let req = service::AddressList {
        addresses: vec![taddr.to_string()],
    };
    let balance = client
        .get_taddress_balance(req)
        .await
        .map_err(|e| format!("transparent balance rpc failed: {}", e))?
        .into_inner();
    Ok(balance.value_zat.max(0) as u64)
}

#[tauri::command]
async fn get_balance(app: tauri::AppHandle) -> Result<BalanceInfo, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let wallet = active_wallet(&store).ok_or_else(|| "Wallet is not initialized.".to_string())?;
    let data_db_path = wallet_data_db_path(&app, &wallet.wallet_fingerprint)?;
    let network = wallet.network.clone();
    for attempt in 0u32..10 {
        let res = match network.as_str() {
            "mainnet" => read_wallet_balance_from_db(&data_db_path, MAIN_NETWORK),
            "testnet" => read_wallet_balance_from_db(&data_db_path, TEST_NETWORK),
            _ => return Err("Unsupported network. Use mainnet or testnet.".to_string()),
        };
        match res {
            Ok(mut bal) => {
                if !wallet.transparent_address.trim().is_empty() {
                    let endpoint = normalize_grpc_endpoint(&load_lightwalletd_endpoint(&app)?);
                    match fetch_transparent_balance_fallback(&endpoint, wallet.transparent_address.trim()).await
                    {
                        Ok(tb) if tb > bal.transparent_zat => {
                            let previous = bal.transparent_zat;
                            bal.transparent_zat = tb;
                            log::info!(
                                "get_balance transparent fallback merged: wallet={} taddr={} previous={} merged={}",
                                wallet.wallet_fingerprint,
                                wallet.transparent_address,
                                previous,
                                tb
                            );
                        }
                        Ok(_) => {}
                        Err(e) => {
                            log::warn!(
                                "get_balance transparent fallback failed: wallet={} taddr={} err={}",
                                wallet.wallet_fingerprint,
                                wallet.transparent_address,
                                e
                            );
                        }
                    }
                }
                let pool_total = bal
                    .orchard_zat
                    .saturating_add(bal.sapling_zat)
                    .saturating_add(bal.transparent_zat);
                bal.total_zat = bal.total_zat.max(pool_total);
                bal.spendable_zat = bal.total_zat.saturating_sub(bal.pending_zat);
                log::info!(
                    "get_balance wallet={} network={} db_path={} orchard={} sapling={} transparent={} pending={} total={} spendable={}",
                    wallet.wallet_fingerprint,
                    network,
                    data_db_path.display(),
                    bal.orchard_zat,
                    bal.sapling_zat,
                    bal.transparent_zat,
                    bal.pending_zat,
                    bal.total_zat,
                    bal.spendable_zat
                );
                return Ok(bal);
            }
            Err(e) if sqlite_transient_error(&e) && attempt + 1 < 10 => {
                tokio::time::sleep(std::time::Duration::from_millis(50 + u64::from(attempt) * 35))
                    .await;
            }
            Err(e) => return Err(e),
        }
    }
    Err("wallet balance read failed after retries".to_string())
}

#[tauri::command]
fn get_unified_address(app: tauri::AppHandle) -> Result<String, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let wallet = active_wallet(&store).ok_or_else(|| "Wallet is not initialized.".to_string())?;
    Ok(wallet.unified_address.clone())
}

#[tauri::command]
fn propose_transfer(
    app: tauri::AppHandle,
    to: String,
    amount_zat: u64,
    memo: Option<String>,
) -> Result<String, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let wallet = active_wallet(&store).ok_or_else(|| "Wallet is not initialized.".to_string())?;
    let to_trimmed = to.trim();
    let decoded_ok = match wallet.network.as_str() {
        "mainnet" => zcash_keys::address::Address::decode(&MAIN_NETWORK, to_trimmed).is_some(),
        "testnet" => zcash_keys::address::Address::decode(&TEST_NETWORK, to_trimmed).is_some(),
        _ => false,
    };
    if !decoded_ok {
        return Err(
            "Invalid recipient address for this wallet network (UA, Sapling, or transparent)."
                .to_string(),
        );
    }
    if amount_zat == 0 {
        return Err("Amount must be greater than zero.".to_string());
    }
    let proposal = serde_json::json!({
        "to": to_trimmed,
        "amountZat": amount_zat,
        "memo": memo,
    });
    serde_json::to_string(&proposal).map_err(|e| format!("proposal serialize failed: {}", e))
}

#[tauri::command]
async fn execute_transfer(app: tauri::AppHandle, proposal_json: String) -> Result<String, String> {
    let proposal: TransferProposalPayload =
        serde_json::from_str(&proposal_json).map_err(|e| format!("proposal parse failed: {}", e))?;
    if proposal.amount_zat == 0 {
        return Err("Amount must be greater than zero.".to_string());
    }
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let wallet = active_wallet(&store).ok_or_else(|| "Wallet is not initialized.".to_string())?;
    let mnemonic = wallet_plain_mnemonic(&app, &store, wallet)?;
    let seed = Mnemonic::parse_in_normalized(Language::English, &mnemonic)
        .map_err(|e| format!("mnemonic parse failed: {}", e))?
        .to_seed("");
    let endpoint = normalize_grpc_endpoint(&load_lightwalletd_endpoint(&app)?);
    let endpoint_candidates = lightwalletd_endpoint_candidates(&endpoint, wallet.network.as_str());
    let selected_endpoint = select_lightwalletd_endpoint(&endpoint_candidates).await?;

    let memo_bytes = if let Some(memo) = proposal.memo.clone().filter(|m| !m.trim().is_empty()) {
        Some(
            Memo::from_str(memo.trim())
                .map_err(|e| format!("invalid memo: {}", e))?
                .encode(),
        )
    } else {
        None
    };
    log::info!(
        "execute_transfer requested: wallet={} network={} to={} amount_zat={} memo={}",
        wallet.wallet_fingerprint,
        wallet.network,
        proposal.to.trim(),
        proposal.amount_zat,
        if memo_bytes.is_some() { "yes" } else { "no" }
    );

    // Serialize sends with background sync and other send operations to avoid SQLite races.
    let _sync_guard = LIGHTWALLETD_SYNC_LOCK.lock().await;

    match wallet.network.as_str() {
        "mainnet" => {
            sync_wallet_for_network(MAIN_NETWORK, &app, wallet, &seed, &endpoint).await?;
            let data_db_path = wallet_data_db_path(&app, &wallet.wallet_fingerprint)?;
            let mut db_data = WalletDb::for_path(&data_db_path, MAIN_NETWORK, SystemClock, rand::rngs::OsRng)
                .map_err(|e| format!("wallet db open failed: {}", e))?;
            let account_id = db_data
                .get_account_ids()
                .map_err(|e| format!("wallet account query failed: {}", e))?
                .first()
                .copied()
                .ok_or_else(|| "No wallet account is initialized.".to_string())?;
            let account = db_data
                .get_account(account_id)
                .map_err(|e| format!("wallet account lookup failed: {}", e))?
                .ok_or_else(|| "Wallet account metadata is missing.".to_string())?;
            let account_index = match account.source() {
                AccountSource::Derived { derivation, .. } => derivation.account_index(),
                AccountSource::Imported { .. } => {
                    return Err("This wallet account is watch-only/imported and cannot send.".to_string())
                }
            };
            let to = zcash_keys::address::Address::decode(&MAIN_NETWORK, proposal.to.trim())
                .ok_or_else(|| "Invalid recipient address.".to_string())?;
            let amount =
                Zatoshis::from_u64(proposal.amount_zat).map_err(|e| format!("invalid amount: {}", e))?;
            let tx_proposal = match propose_standard_transfer_to_address::<_, _, std::convert::Infallible>(
                &mut db_data,
                &MAIN_NETWORK,
                StandardFeeRule::Zip317,
                account_id,
                // Match balance/read UX: allow spendability of recently detected funds when possible.
                ConfirmationsPolicy::MIN,
                &to,
                amount,
                memo_bytes,
                None,
                ShieldedProtocol::Orchard,
            ) {
                Ok(p) => p,
                Err(e) => {
                    let e_str = e.to_string();
                    if e_str.to_lowercase().contains("insufficient") && !wallet.transparent_address.trim().is_empty() {
                        if let Ok(tb) =
                            fetch_transparent_balance_fallback(&selected_endpoint, wallet.transparent_address.trim())
                                .await
                        {
                            if tb > 0 {
                                return Err(format!(
                                    "transfer proposal failed: Insufficient spendable balance in synced wallet state, but transparent address reports {} zatoshis. Funds may still be pending confirmation or not yet spendable in local wallet state.",
                                    tb
                                ));
                            }
                        }
                    }
                    return Err(format!("transfer proposal failed: {}", e));
                }
            };
            let usk = UnifiedSpendingKey::from_seed(&MAIN_NETWORK, &seed, account_index)
                .map_err(|e| format!("spending key derivation failed: {}", e))?;
            let prover = LocalTxProver::bundled();
            let txids = create_proposed_transactions::<
                _,
                _,
                std::convert::Infallible,
                _,
                std::convert::Infallible,
                _,
            >(
                &mut db_data,
                &MAIN_NETWORK,
                &prover,
                &prover,
                &SpendingKeys::from_unified_spending_key(usk),
                OvkPolicy::Sender,
                &tx_proposal,
            )
            .map_err(|e| format!("transaction creation failed: {}", e))?;
            let txid = txids.first();
            let tx = db_data
                .get_transaction(*txid)
                .map_err(|e| format!("stored transaction lookup failed: {}", e))?
                .ok_or_else(|| "Constructed transaction not found in wallet db.".to_string())?;
            let mut raw_tx = Vec::new();
            tx.write(&mut raw_tx)
                .map_err(|e| format!("transaction serialization failed: {}", e))?;
            let mut client = CompactTxStreamerClient::connect(selected_endpoint)
                .await
                .map_err(|e| format!("lightwalletd connect failed: {}", e))?;
            let send_resp = client
                .send_transaction(service::RawTransaction {
                    data: raw_tx,
                    height: 0,
                })
                .await
                .map_err(|e| format!("transaction broadcast failed: {}", e))?
                .into_inner();
            if send_resp.error_code != 0 {
                return Err(format!("broadcast rejected: {}", send_resp.error_message));
            }
            log::info!(
                "execute_transfer broadcasted: wallet={} network={} txid={}",
                wallet.wallet_fingerprint,
                wallet.network,
                txid
            );
            Ok(txid.to_string())
        }
        "testnet" => {
            sync_wallet_for_network(TEST_NETWORK, &app, wallet, &seed, &endpoint).await?;
            let data_db_path = wallet_data_db_path(&app, &wallet.wallet_fingerprint)?;
            let mut db_data = WalletDb::for_path(&data_db_path, TEST_NETWORK, SystemClock, rand::rngs::OsRng)
                .map_err(|e| format!("wallet db open failed: {}", e))?;
            let account_id = db_data
                .get_account_ids()
                .map_err(|e| format!("wallet account query failed: {}", e))?
                .first()
                .copied()
                .ok_or_else(|| "No wallet account is initialized.".to_string())?;
            let account = db_data
                .get_account(account_id)
                .map_err(|e| format!("wallet account lookup failed: {}", e))?
                .ok_or_else(|| "Wallet account metadata is missing.".to_string())?;
            let account_index = match account.source() {
                AccountSource::Derived { derivation, .. } => derivation.account_index(),
                AccountSource::Imported { .. } => {
                    return Err("This wallet account is watch-only/imported and cannot send.".to_string())
                }
            };
            let to = zcash_keys::address::Address::decode(&TEST_NETWORK, proposal.to.trim())
                .ok_or_else(|| "Invalid recipient address.".to_string())?;
            let amount =
                Zatoshis::from_u64(proposal.amount_zat).map_err(|e| format!("invalid amount: {}", e))?;
            let tx_proposal = match propose_standard_transfer_to_address::<_, _, std::convert::Infallible>(
                &mut db_data,
                &TEST_NETWORK,
                StandardFeeRule::Zip317,
                account_id,
                // Match balance/read UX: allow spendability of recently detected funds when possible.
                ConfirmationsPolicy::MIN,
                &to,
                amount,
                memo_bytes,
                None,
                ShieldedProtocol::Orchard,
            ) {
                Ok(p) => p,
                Err(e) => {
                    let e_str = e.to_string();
                    if e_str.to_lowercase().contains("insufficient") && !wallet.transparent_address.trim().is_empty() {
                        if let Ok(tb) =
                            fetch_transparent_balance_fallback(&selected_endpoint, wallet.transparent_address.trim())
                                .await
                        {
                            if tb > 0 {
                                return Err(format!(
                                    "transfer proposal failed: Insufficient spendable balance in synced wallet state, but transparent address reports {} zatoshis. Funds may still be pending confirmation or not yet spendable in local wallet state.",
                                    tb
                                ));
                            }
                        }
                    }
                    return Err(format!("transfer proposal failed: {}", e));
                }
            };
            let usk = UnifiedSpendingKey::from_seed(&TEST_NETWORK, &seed, account_index)
                .map_err(|e| format!("spending key derivation failed: {}", e))?;
            let prover = LocalTxProver::bundled();
            let txids = create_proposed_transactions::<
                _,
                _,
                std::convert::Infallible,
                _,
                std::convert::Infallible,
                _,
            >(
                &mut db_data,
                &TEST_NETWORK,
                &prover,
                &prover,
                &SpendingKeys::from_unified_spending_key(usk),
                OvkPolicy::Sender,
                &tx_proposal,
            )
            .map_err(|e| format!("transaction creation failed: {}", e))?;
            let txid = txids.first();
            let tx = db_data
                .get_transaction(*txid)
                .map_err(|e| format!("stored transaction lookup failed: {}", e))?
                .ok_or_else(|| "Constructed transaction not found in wallet db.".to_string())?;
            let mut raw_tx = Vec::new();
            tx.write(&mut raw_tx)
                .map_err(|e| format!("transaction serialization failed: {}", e))?;
            let mut client = CompactTxStreamerClient::connect(selected_endpoint)
                .await
                .map_err(|e| format!("lightwalletd connect failed: {}", e))?;
            let send_resp = client
                .send_transaction(service::RawTransaction {
                    data: raw_tx,
                    height: 0,
                })
                .await
                .map_err(|e| format!("transaction broadcast failed: {}", e))?
                .into_inner();
            if send_resp.error_code != 0 {
                return Err(format!("broadcast rejected: {}", send_resp.error_message));
            }
            log::info!(
                "execute_transfer broadcasted: wallet={} network={} txid={}",
                wallet.wallet_fingerprint,
                wallet.network,
                txid
            );
            Ok(txid.to_string())
        }
        _ => Err("Unsupported network. Use mainnet or testnet.".to_string()),
    }
}

#[tauri::command]
fn start_sync(app: tauri::AppHandle) -> Result<(), String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let active = active_wallet(&store)
        .ok_or_else(|| "Wallet is not initialized.".to_string())?
        .clone();
    let mnemonic = wallet_plain_mnemonic(&app, &store, &active)?;
    let seed = Mnemonic::parse_in_normalized(Language::English, &mnemonic)
        .map_err(|e| format!("mnemonic parse failed: {}", e))?
        .to_seed("");
    let endpoint = normalize_grpc_endpoint(&load_lightwalletd_endpoint(&app)?);
    let endpoint_candidates = lightwalletd_endpoint_candidates(&endpoint, active.network.as_str());
    log::info!(
        "start_sync requested: wallet={} network={} configured_endpoint={} candidates={}",
        active.wallet_fingerprint,
        active.network,
        endpoint,
        endpoint_candidates.len()
    );
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _sync_serial = match LIGHTWALLETD_SYNC_LOCK.try_lock() {
            Ok(guard) => guard,
            Err(_) => {
                log::info!(
                    "start_sync skipped: wallet={} network={} (sync already running)",
                    active.wallet_fingerprint,
                    active.network
                );
                let _ = app_handle.emit(
                    "sync-complete",
                    serde_json::json!({ "ok": true, "skipped": true }),
                );
                return;
            }
        };
        let sync_started = Instant::now();
        let (selected_endpoint, tip_height) =
            match select_lightwalletd_endpoint_with_tip(&endpoint_candidates).await {
                Ok(result) => result,
                Err(error) => {
                    log::error!(
                        "start_sync endpoint selection failed: wallet={} network={} error={}",
                        active.wallet_fingerprint,
                        active.network,
                        error
                    );
                    let _ = app_handle.emit(
                        "sync-complete",
                        serde_json::json!({ "ok": false, "error": format!("lightwalletd connect failed: {}", error) }),
                    );
                    return;
                }
            };
        let start_height = active.birthday_height.min(tip_height);
        log::info!(
            "start_sync tip received: wallet={} endpoint={} tip={} birthday={}",
            active.wallet_fingerprint,
            selected_endpoint,
            tip_height,
            active.birthday_height
        );
        let total = tip_height.max(start_height);
        let _ = app_handle.emit(
            "sync-progress",
            SyncProgressEvent {
                height: start_height,
                total,
            },
        );
        let sync_res = match active.network.as_str() {
            "mainnet" => sync_wallet_for_network(MAIN_NETWORK, &app_handle, &active, &seed, &selected_endpoint).await,
            "testnet" => sync_wallet_for_network(TEST_NETWORK, &app_handle, &active, &seed, &selected_endpoint).await,
            _ => Err("Unsupported network. Use mainnet or testnet.".to_string()),
        };
        if let Err(error) = sync_res {
            log::error!(
                "start_sync failed: wallet={} network={} error={}",
                active.wallet_fingerprint,
                active.network,
                error
            );
            let _ = app_handle.emit(
                "sync-complete",
                serde_json::json!({ "ok": false, "error": error }),
            );
            return;
        }
        log::info!(
            "start_sync complete: wallet={} network={} tip={} elapsed_ms={}",
            active.wallet_fingerprint,
            active.network,
            total,
            sync_started.elapsed().as_millis()
        );
        let _ = app_handle.emit("sync-progress", SyncProgressEvent { height: total, total });
        let _ = app_handle.emit("sync-complete", serde_json::json!({ "ok": true }));
    });
    Ok(())
}

#[tauri::command]
fn get_transactions(app: tauri::AppHandle, limit: u32) -> Result<Vec<TxInfo>, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let wallet = active_wallet(&store).ok_or_else(|| "Wallet is not initialized.".to_string())?;
    let data_db_path = wallet_data_db_path(&app, &wallet.wallet_fingerprint)?;
    if !data_db_path.exists() {
        return Ok(Vec::new());
    }
    let conn = rusqlite::Connection::open(&data_db_path)
        .map_err(|e| format!("wallet db open failed: {}", e))?;
    // `v_transactions` provides wallet-relative deltas and fee. We add best-effort counterparty
    // address extraction:
    // - For sends: first non-change `sent_notes.to_address`.
    // - For receives: first non-change wallet receive address from `addresses`.
    let query = "
        SELECT
            v.txid,
            v.account_balance_delta,
            COALESCE(v.block_time, 0) AS block_time,
            COALESCE(v.mined_height, 0) AS mined_height,
            COALESCE(v.memo_count, 0) AS memo_count,
            COALESCE(v.fee_paid, 0) AS fee_paid,
            (
                SELECT sn.to_address
                FROM sent_notes sn
                LEFT JOIN v_received_outputs ro ON ro.sent_note_id = sn.id
                WHERE sn.transaction_id = t.id_tx
                  AND COALESCE(ro.is_change, 0) = 0
                  AND sn.to_address IS NOT NULL
                  AND TRIM(sn.to_address) != ''
                ORDER BY sn.value DESC
                LIMIT 1
            ) AS to_address,
            (
                SELECT COALESCE(a.address, a.cached_transparent_receiver_address)
                FROM v_received_outputs ro
                JOIN addresses a ON a.id = ro.address_id
                WHERE ro.transaction_id = t.id_tx
                  AND COALESCE(ro.is_change, 0) = 0
                LIMIT 1
            ) AS received_at
        FROM v_transactions v
        JOIN transactions t ON t.txid = v.txid
        ORDER BY COALESCE(v.mined_height, 0) DESC, COALESCE(v.tx_index, 0) DESC
        LIMIT ?1
    ";
    let mut stmt = conn
        .prepare_cached(query)
        .map_err(|e| format!("transaction query prepare failed: {}", e))?;
    let tx_limit = i64::from(limit.max(1).min(500));
    let rows = stmt
        .query_map(params![tx_limit], |row| {
            let txid_bytes: Vec<u8> = row.get(0)?;
            let value_zat: i64 = row.get(1)?;
            let block_time: i64 = row.get(2)?;
            let mined_height: i64 = row.get(3)?;
            let memo_count: i64 = row.get(4)?;
            let fee_paid: i64 = row.get(5)?;
            let to_address: Option<String> = row.get(6)?;
            let received_at: Option<String> = row.get(7)?;
            let txid = if txid_bytes.len() == 32 {
                let mut raw = [0u8; 32];
                raw.copy_from_slice(&txid_bytes);
                TxId::from_bytes(raw).to_string()
            } else {
                // Defensive fallback for unexpected DB encodings.
                hex_encode(&txid_bytes)
            };
            let is_incoming = value_zat >= 0;
            let ua = wallet.unified_address.clone();
            let to_addr = if is_incoming {
                received_at.clone()
            } else {
                to_address.clone()
            };
            let from_addr = if is_incoming {
                None
            } else {
                Some(ua)
            };
            Ok(TxInfo {
                txid,
                value_zat,
                timestamp: if block_time > 0 {
                    block_time as u64
                } else {
                    now_unix_ts() as u64
                },
                block_height: if mined_height > 0 {
                    (mined_height.min(i64::from(u32::MAX))) as u32
                } else {
                    0
                },
                fee_zat: fee_paid,
                to_address: to_addr,
                from_address: from_addr,
                memo: if memo_count > 0 {
                    Some(format!("{} memo(s)", memo_count))
                } else {
                    None
                },
                is_incoming,
            })
        })
        .map_err(|e| format!("transaction query failed: {}", e))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("transaction row decode failed: {}", e))?);
    }
    Ok(out)
}

#[tauri::command]
async fn get_latest_block_height(app: tauri::AppHandle) -> Result<u32, String> {
    let path = wallet_store_file(&app)?;
    let store = read_wallet_store(&path)?;
    ensure_app_unlocked(&app, &store)?;
    let active = active_wallet(&store).ok_or_else(|| "Wallet is not initialized.".to_string())?;
    let endpoint = normalize_grpc_endpoint(&load_lightwalletd_endpoint(&app)?);
    let endpoint_candidates = lightwalletd_endpoint_candidates(&endpoint, active.network.as_str());
    let (selected_endpoint, tip_height) = select_lightwalletd_endpoint_with_tip(&endpoint_candidates).await?;
    log::info!(
        "get_latest_block_height wallet={} network={} endpoint={} tip={}",
        active.wallet_fingerprint,
        active.network,
        selected_endpoint,
        tip_height
    );
    Ok(tip_height)
}

#[tauri::command]
fn set_lightwalletd_server(app: tauri::AppHandle, url: String) -> Result<bool, String> {
    let normalized = normalize_grpc_endpoint(&url);
    if !(normalized.starts_with("http://") || normalized.starts_with("https://")) {
        return Err("Invalid lightwalletd URL. Expected http(s) endpoint.".to_string());
    }
    let cfg_path = lightwalletd_file(&app)?;
    let data = serde_json::json!({ "url": normalized });
    let bytes =
        serde_json::to_vec_pretty(&data).map_err(|e| format!("config serialize failed: {}", e))?;
    fs::write(cfg_path, bytes).map_err(|e| format!("config write failed: {}", e))?;
    Ok(true)
}

#[tauri::command]
async fn get_market_price() -> Result<MarketPriceResponse, String> {
    // Prefer native HTTP in production because some webviews/AppImages get blocked calling
    // CoinGecko directly (CORS / UA / network policies).
    #[derive(Deserialize)]
    struct GeckoResp {
        zcash: Option<GeckoZcash>,
    }
    #[derive(Deserialize)]
    struct GeckoZcash {
        usd: Option<f64>,
        usd_24h_change: Option<f64>,
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("http client init failed: {}", e))?;

    // 1) CoinGecko (primary)
    if let Ok(resp) = client
        .get("https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_change=true")
        .header("accept", "application/json")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<GeckoResp>().await {
                if let Some(z) = json.zcash {
                    if let Some(usd) = z.usd.filter(|v| v.is_finite() && *v > 0.0) {
                        return Ok(MarketPriceResponse {
                            zec_usd_price: usd,
                            price_change_24h: z.usd_24h_change.unwrap_or(0.0),
                        });
                    }
                }
            }
        }
    }

    // 2) CoinPaprika (fallback)
    #[derive(Deserialize)]
    struct PaprikaResp {
        quotes: Option<PaprikaQuotes>,
    }
    #[derive(Deserialize)]
    struct PaprikaQuotes {
        #[serde(rename = "USD")]
        usd: Option<PaprikaUsd>,
    }
    #[derive(Deserialize)]
    struct PaprikaUsd {
        price: Option<f64>,
        percent_change_24h: Option<f64>,
    }

    let resp = client
        .get("https://api.coinpaprika.com/v1/tickers/zec-zcash")
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("price fetch failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("price fetch failed: http {}", resp.status()));
    }
    let json = resp
        .json::<PaprikaResp>()
        .await
        .map_err(|e| format!("price parse failed: {}", e))?;
    let usd_quote = json
        .quotes
        .and_then(|q| q.usd)
        .ok_or_else(|| "price unavailable from providers".to_string())?;
    let usd = usd_quote
        .price
        .filter(|v| v.is_finite() && *v > 0.0)
        .ok_or_else(|| "price unavailable from providers".to_string())?;
    let change = usd_quote.percent_change_24h.unwrap_or(0.0);
    Ok(MarketPriceResponse {
        zec_usd_price: usd,
        price_change_24h: change,
    })
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppSecurityState::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                match tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")) {
                    Ok(icon) => {
                        if let Err(err) = window.set_icon(icon) {
                            log::warn!("failed to apply custom window icon: {}", err);
                        }
                    }
                    Err(err) => {
                        log::warn!("failed to load custom window icon bytes: {}", err);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            wallet_create,
            wallet_finalize_create,
            wallet_restore,
            wallet_reconcile_derived_addresses,
            wallet_get_state,
            wallet_list,
            wallet_set_active,
            wallet_update_name,
            wallet_remove,
            wallet_export_backup,
            wallet_export_all_backups,
            app_get_lock_state,
            app_lock,
            app_unlock,
            wallet_reset,
            get_balance,
            get_unified_address,
            propose_transfer,
            execute_transfer,
            start_sync,
            get_transactions,
            get_latest_block_height,
            get_market_price,
            set_lightwalletd_server
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}
