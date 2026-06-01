// Core Bitcoin crypto — портировано из wasm/btc_wasm/src/lib.rs
// Без wasm-bindgen, чисто нативные функции.

use k256::{elliptic_curve::sec1::ToEncodedPoint, SecretKey};
use ripemd::Ripemd160;
use sha2::{Digest, Sha256};

/// Hash160 = RIPEMD160(SHA256(data))
pub fn hash160(data: &[u8]) -> [u8; 20] {
    let sha256_hash = Sha256::digest(data);
    let ripemd_hash = Ripemd160::digest(&sha256_hash);
    let mut result = [0u8; 20];
    result.copy_from_slice(&ripemd_hash);
    result
}

/// Convert public key hash to Bitcoin address (Base58Check, version 0x00)
pub fn pubkey_hash_to_address(hash: &[u8; 20]) -> String {
    let mut payload = vec![0x00];
    payload.extend_from_slice(hash);
    let checksum = Sha256::digest(&Sha256::digest(&payload));
    payload.extend_from_slice(&checksum[..4]);
    bs58::encode(payload).into_string()
}

/// Compute BOTH compressed and uncompressed P2PKH addresses for a private key.
/// Returns None for invalid key (out of curve order).
pub fn generate_addresses_both(private_key_bytes: &[u8; 32]) -> Option<(String, String)> {
    let secret_key = SecretKey::from_slice(private_key_bytes).ok()?;
    let public_key = secret_key.public_key(); // один scalar*point multiplication

    let comp = public_key.to_encoded_point(true);
    let uncomp = public_key.to_encoded_point(false);

    let comp_addr = pubkey_hash_to_address(&hash160(comp.as_bytes()));
    let uncomp_addr = pubkey_hash_to_address(&hash160(uncomp.as_bytes()));
    Some((comp_addr, uncomp_addr))
}

/// Parse hex string (64 chars) to 32 bytes
pub fn hex_to_bytes(hex: &str) -> Option<[u8; 32]> {
    let hex = hex.trim();
    if hex.len() != 64 {
        return None;
    }
    let mut bytes = [0u8; 32];
    for i in 0..32 {
        bytes[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(bytes)
}

/// 32 bytes to hex string
pub fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Add a value to a 256-bit big-endian key, in place (wrapping at 2^256)
pub fn add_to_key(key: &mut [u8; 32], value: u64) {
    let mut carry = value as u128;
    for i in (0..32).rev() {
        let sum = key[i] as u128 + (carry & 0xff);
        key[i] = (sum & 0xff) as u8;
        carry = (carry >> 8) + (sum >> 8);
    }
}

/// Compare two 256-bit big-endian numbers
pub fn cmp_be(a: &[u8; 32], b: &[u8; 32]) -> std::cmp::Ordering {
    for i in 0..32 {
        if a[i] != b[i] {
            return a[i].cmp(&b[i]);
        }
    }
    std::cmp::Ordering::Equal
}

/// Convert private key to WIF format
pub fn private_key_to_wif(key: &[u8; 32], compressed: bool) -> String {
    let mut payload = vec![0x80]; // Mainnet prefix
    payload.extend_from_slice(key);
    if compressed {
        payload.push(0x01);
    }
    let checksum = Sha256::digest(&Sha256::digest(&payload));
    payload.extend_from_slice(&checksum[..4]);
    bs58::encode(payload).into_string()
}

/// Check a batch of CONSECUTIVE keys starting at `start_key_hex`, for up to
/// `iterations` keys or until `end_key_hex` (inclusive).
///
/// Returns JSON-like result struct.
pub struct CheckResult {
    pub found: bool,
    pub key_hex: Option<String>,
    pub key_wif: Option<String>,
    pub address: Option<String>,
    pub checked: u32,
    pub next_key_hex: Option<String>,
    pub done: bool,
    pub error: Option<String>,
}

pub fn check_keys_batch(
    target_address: &str,
    start_key_hex: &str,
    end_key_hex: &str,
    iterations: u32,
) -> CheckResult {
    let start = match hex_to_bytes(start_key_hex) {
        Some(k) => k,
        None => {
            return CheckResult {
                found: false,
                key_hex: None,
                key_wif: None,
                address: None,
                checked: 0,
                next_key_hex: None,
                done: true,
                error: Some("invalid start_key".into()),
            }
        }
    };
    let end = match hex_to_bytes(end_key_hex) {
        Some(k) => k,
        None => {
            return CheckResult {
                found: false,
                key_hex: None,
                key_wif: None,
                address: None,
                checked: 0,
                next_key_hex: None,
                done: true,
                error: Some("invalid end_key".into()),
            }
        }
    };

    let mut current = start;
    let mut checked: u32 = 0;

    while checked < iterations {
        if cmp_be(&current, &end) == std::cmp::Ordering::Greater {
            return CheckResult {
                found: false,
                key_hex: None,
                key_wif: None,
                address: None,
                checked,
                next_key_hex: Some(bytes_to_hex(&current)),
                done: true,
                error: None,
            };
        }

        if let Some((addr_comp, addr_uncomp)) = generate_addresses_both(&current) {
            if addr_comp == target_address {
                return CheckResult {
                    found: true,
                    key_hex: Some(bytes_to_hex(&current)),
                    key_wif: Some(private_key_to_wif(&current, true)),
                    address: Some(addr_comp),
                    checked: checked + 1,
                    next_key_hex: None,
                    done: false,
                    error: None,
                };
            }
            if addr_uncomp == target_address {
                return CheckResult {
                    found: true,
                    key_hex: Some(bytes_to_hex(&current)),
                    key_wif: Some(private_key_to_wif(&current, false)),
                    address: Some(addr_uncomp),
                    checked: checked + 1,
                    next_key_hex: None,
                    done: false,
                    error: None,
                };
            }
        }

        checked += 1;

        if cmp_be(&current, &end) == std::cmp::Ordering::Equal {
            return CheckResult {
                found: false,
                key_hex: None,
                key_wif: None,
                address: None,
                checked,
                next_key_hex: Some(bytes_to_hex(&end)),
                done: true,
                error: None,
            };
        }

        add_to_key(&mut current, 1);
    }

    // Batch budget exhausted
    CheckResult {
        found: false,
        key_hex: None,
        key_wif: None,
        address: None,
        checked,
        next_key_hex: Some(bytes_to_hex(&current)),
        done: false,
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_known_address() {
        let key = hex_to_bytes(
            "0000000000000000000000000000000000000000000000000000000000000001",
        )
        .unwrap();
        assert_eq!(
            generate_addresses_both(&key).unwrap().0,
            "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH"
        );
    }

    #[test]
    fn test_batch_finds_key() {
        let key5 = hex_to_bytes(
            "0000000000000000000000000000000000000000000000000000000000000005",
        )
        .unwrap();
        let targets = generate_addresses_both(&key5).unwrap();

        let result = check_keys_batch(
            &targets.0,
            "0000000000000000000000000000000000000000000000000000000000000001",
            "000000000000000000000000000000000000000000000000000000000000000a",
            100,
        );
        assert!(result.found);
        assert_eq!(result.checked, 5);
    }
}
