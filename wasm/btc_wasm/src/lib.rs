use wasm_bindgen::prelude::*;
use k256::{SecretKey, elliptic_curve::sec1::ToEncodedPoint};
use sha2::{Sha256, Digest};
use ripemd::Ripemd160;
use serde::Serialize;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

/// Initialize panic hook for better error messages
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Address data structure returned to JS
#[derive(Serialize)]
pub struct AddressData {
    pub private_key: String,
    pub address_uncompressed: String,
    pub address_compressed: String,
}

/// Hash160 = RIPEMD160(SHA256(data))
fn hash160(data: &[u8]) -> [u8; 20] {
    let sha256_hash = Sha256::digest(data);
    let ripemd_hash = Ripemd160::digest(&sha256_hash);
    let mut result = [0u8; 20];
    result.copy_from_slice(&ripemd_hash);
    result
}

/// Convert public key hash to Bitcoin address (Base58Check)
fn pubkey_hash_to_address(hash: &[u8; 20]) -> String {
    // Version byte 0x00 for mainnet
    let mut payload = vec![0x00];
    payload.extend_from_slice(hash);

    // Double SHA256 for checksum
    let checksum = Sha256::digest(&Sha256::digest(&payload));
    payload.extend_from_slice(&checksum[..4]);

    bs58::encode(payload).into_string()
}

/// Generate Bitcoin address from private key bytes
fn generate_address(private_key_bytes: &[u8; 32], compressed: bool) -> String {
    let secret_key = match SecretKey::from_slice(private_key_bytes) {
        Ok(sk) => sk,
        Err(_) => return String::from("invalid_key"),
    };

    let public_key = secret_key.public_key();
    let encoded_point = public_key.to_encoded_point(compressed);
    let pubkey_bytes = encoded_point.as_bytes();

    let pubkey_hash = hash160(pubkey_bytes);
    pubkey_hash_to_address(&pubkey_hash)
}

/// Parse hex string to bytes
fn hex_to_bytes(hex: &str) -> Option<[u8; 32]> {
    if hex.len() != 64 {
        return None;
    }

    let mut bytes = [0u8; 32];
    for i in 0..32 {
        bytes[i] = u8::from_str_radix(&hex[i*2..i*2+2], 16).ok()?;
    }
    Some(bytes)
}

/// Bytes to hex string
fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Add two 256-bit numbers (big-endian bytes)
fn add_to_key(key: &mut [u8; 32], value: u64) {
    let mut carry = value as u128;
    for i in (0..32).rev() {
        let sum = key[i] as u128 + (carry & 0xff);
        key[i] = (sum & 0xff) as u8;
        carry = (carry >> 8) + (sum >> 8);
    }
}

/// Generate a batch of addresses starting from a private key
/// Returns JSON array of address objects
#[wasm_bindgen]
pub fn generate_addresses_batch(start_key_hex: &str, count: u32) -> JsValue {
    let mut results: Vec<AddressData> = Vec::with_capacity(count as usize);

    let mut current_key = match hex_to_bytes(start_key_hex) {
        Some(k) => k,
        None => return JsValue::NULL,
    };

    for i in 0..count {
        if i > 0 {
            add_to_key(&mut current_key, 1);
        }

        let addr_uncompressed = generate_address(&current_key, false);
        let addr_compressed = generate_address(&current_key, true);

        results.push(AddressData {
            private_key: bytes_to_hex(&current_key),
            address_uncompressed: addr_uncompressed,
            address_compressed: addr_compressed,
        });
    }

    serde_wasm_bindgen::to_value(&results).unwrap_or(JsValue::NULL)
}

/// Generate a single address (for testing)
#[wasm_bindgen]
pub fn generate_single_address(private_key_hex: &str, compressed: bool) -> String {
    match hex_to_bytes(private_key_hex) {
        Some(key) => generate_address(&key, compressed),
        None => String::from("invalid_key"),
    }
}

/// Benchmark function - generate N addresses and return time
#[wasm_bindgen]
pub fn benchmark(count: u32) -> f64 {
    let start = js_sys::Date::now();

    let start_key = [0u8; 32];
    let mut current_key = start_key;
    current_key[31] = 1; // Start from key = 1

    for _ in 0..count {
        let _ = generate_address(&current_key, false);
        let _ = generate_address(&current_key, true);
        add_to_key(&mut current_key, 1);
    }

    js_sys::Date::now() - start
}

/// Result of puzzle search iteration
#[derive(Serialize)]
pub struct PuzzleSearchResult {
    pub found: bool,
    pub private_key_hex: Option<String>,
    pub private_key_wif: Option<String>,
    pub address_found: Option<String>,
    pub keys_checked: u32,
}

/// Generate random key within range [start, end]
fn generate_random_key_in_range(range_start: &[u8; 32], range_end: &[u8; 32]) -> [u8; 32] {
    use getrandom::getrandom;

    // Calculate range size
    let mut range_size = [0u8; 32];
    let mut borrow = 0u16;
    for i in (0..32).rev() {
        let diff = range_end[i] as i16 - range_start[i] as i16 - borrow as i16;
        if diff < 0 {
            range_size[i] = (diff + 256) as u8;
            borrow = 1;
        } else {
            range_size[i] = diff as u8;
            borrow = 0;
        }
    }

    // Generate random bytes
    let mut random_bytes = [0u8; 32];
    let _ = getrandom(&mut random_bytes);

    // Modulo range_size (simplified: just AND with range_size for similar bit length)
    // This is not perfectly uniform but fast and good enough
    for i in 0..32 {
        random_bytes[i] &= range_size[i] | (range_size[i].wrapping_sub(1));
    }

    // Add to range_start
    let mut result = *range_start;
    let mut carry = 0u16;
    for i in (0..32).rev() {
        let sum = result[i] as u16 + random_bytes[i] as u16 + carry;
        result[i] = (sum & 0xff) as u8;
        carry = sum >> 8;
    }

    result
}

/// Convert private key to WIF format
fn private_key_to_wif(key: &[u8; 32], compressed: bool) -> String {
    let mut payload = vec![0x80]; // Mainnet prefix
    payload.extend_from_slice(key);
    if compressed {
        payload.push(0x01);
    }

    // Double SHA256 for checksum
    let checksum = Sha256::digest(&Sha256::digest(&payload));
    payload.extend_from_slice(&checksum[..4]);

    bs58::encode(payload).into_string()
}

/// Puzzle search - runs entirely in WASM for maximum speed
/// Returns when found or after `iterations` checks
#[wasm_bindgen]
pub fn puzzle_search(
    target_address: &str,
    range_start_hex: &str,
    range_end_hex: &str,
    iterations: u32,
) -> JsValue {
    let range_start = match hex_to_bytes(range_start_hex) {
        Some(k) => k,
        None => return serde_wasm_bindgen::to_value(&PuzzleSearchResult {
            found: false,
            private_key_hex: None,
            private_key_wif: None,
            address_found: None,
            keys_checked: 0,
        }).unwrap_or(JsValue::NULL),
    };

    let range_end = match hex_to_bytes(range_end_hex) {
        Some(k) => k,
        None => return serde_wasm_bindgen::to_value(&PuzzleSearchResult {
            found: false,
            private_key_hex: None,
            private_key_wif: None,
            address_found: None,
            keys_checked: 0,
        }).unwrap_or(JsValue::NULL),
    };

    for _ in 0..iterations {
        let key = generate_random_key_in_range(&range_start, &range_end);

        // Check compressed address (most puzzle addresses are compressed)
        let addr_compressed = generate_address(&key, true);
        if addr_compressed == target_address {
            return serde_wasm_bindgen::to_value(&PuzzleSearchResult {
                found: true,
                private_key_hex: Some(bytes_to_hex(&key)),
                private_key_wif: Some(private_key_to_wif(&key, true)),
                address_found: Some(addr_compressed),
                keys_checked: iterations,
            }).unwrap_or(JsValue::NULL);
        }

        // Also check uncompressed (in case target is uncompressed)
        let addr_uncompressed = generate_address(&key, false);
        if addr_uncompressed == target_address {
            return serde_wasm_bindgen::to_value(&PuzzleSearchResult {
                found: true,
                private_key_hex: Some(bytes_to_hex(&key)),
                private_key_wif: Some(private_key_to_wif(&key, false)),
                address_found: Some(addr_uncompressed),
                keys_checked: iterations,
            }).unwrap_or(JsValue::NULL);
        }
    }

    serde_wasm_bindgen::to_value(&PuzzleSearchResult {
        found: false,
        private_key_hex: None,
        private_key_wif: None,
        address_found: None,
        keys_checked: iterations,
    }).unwrap_or(JsValue::NULL)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_known_address() {
        // Test vector: private key = 1
        let key = hex_to_bytes("0000000000000000000000000000000000000000000000000000000000000001").unwrap();
        let addr = generate_address(&key, false);
        assert_eq!(addr, "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH");
    }
}
