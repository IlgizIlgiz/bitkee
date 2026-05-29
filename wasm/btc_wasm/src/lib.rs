use wasm_bindgen::prelude::*;
use k256::{SecretKey, elliptic_curve::sec1::ToEncodedPoint};
use sha2::{Sha256, Digest};
use ripemd::Ripemd160;

/// Initialize panic hook for better error messages
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
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

/// Compute BOTH the compressed and uncompressed P2PKH addresses for a private key,
/// deriving the public-key point only ONCE. The point multiplication dominates cost, so
/// sharing it across both encodings roughly halves the per-key work vs calling
/// `generate_address` twice. Returns None for an invalid key (out of curve order).
fn generate_addresses_both(private_key_bytes: &[u8; 32]) -> Option<(String, String)> {
    let secret_key = SecretKey::from_slice(private_key_bytes).ok()?;
    let public_key = secret_key.public_key(); // single scalar*point multiplication

    let comp = public_key.to_encoded_point(true);
    let uncomp = public_key.to_encoded_point(false);

    let comp_addr = pubkey_hash_to_address(&hash160(comp.as_bytes()));
    let uncomp_addr = pubkey_hash_to_address(&hash160(uncomp.as_bytes()));
    Some((comp_addr, uncomp_addr))
}

/// Parse hex string to bytes
fn hex_to_bytes(hex: &str) -> Option<[u8; 32]> {
    if hex.len() != 64 {
        return None;
    }

    let mut bytes = [0u8; 32];
    for i in 0..32 {
        bytes[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(bytes)
}

/// Bytes to hex string
fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Add a value to a 256-bit big-endian key, in place (wrapping at 2^256)
fn add_to_key(key: &mut [u8; 32], value: u64) {
    let mut carry = value as u128;
    for i in (0..32).rev() {
        let sum = key[i] as u128 + (carry & 0xff);
        key[i] = (sum & 0xff) as u8;
        carry = (carry >> 8) + (sum >> 8);
    }
}

/// Compare two 256-bit big-endian numbers
fn cmp_be(a: &[u8; 32], b: &[u8; 32]) -> core::cmp::Ordering {
    for i in 0..32 {
        if a[i] != b[i] {
            return a[i].cmp(&b[i]);
        }
    }
    core::cmp::Ordering::Equal
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

/// Generate a single address from a hex private key.
/// Used by the normal address-generation worker path (manual/auto modes).
#[wasm_bindgen]
pub fn generate_single_address(private_key_hex: &str, compressed: bool) -> String {
    match hex_to_bytes(private_key_hex) {
        Some(key) => generate_address(&key, compressed),
        None => String::from("invalid_key"),
    }
}

const ERR_JSON: &str = r#"{"found":false,"error":"invalid_input","checked":0,"done":true}"#;

/// Check a batch of CONSECUTIVE keys starting at `start_key_hex`, for up to
/// `iterations` keys or until `end_key_hex` (inclusive) — whichever comes first.
///
/// One call replaces what used to be `iterations` separate JS→WASM string round-trips
/// (`generate_single_address` per key). The whole inner loop now runs inside WASM.
///
/// Covers both puzzle-search modes:
///  - sequential: the worker passes its current position as `start_key_hex`.
///  - random:     the worker passes a random segment start (from `crypto.getRandomValues`
///                via the existing, correct JS `generateRandomKeyInRange`), so no RNG is
///                needed inside Rust at all.
///
/// Returns a JSON string (kept as `String` so the worker's minimal hand-written glue
/// works without serde marshalling):
///   found: {"found":true,"key":"<hex>","wif":"<wif>","address":"<addr>","checked":N,"done":false}
///   miss:  {"found":false,"key":null,"wif":null,"address":null,"checked":N,"next_key":"<hex>","done":bool}
///   error: {"found":false,"error":"invalid_input","checked":0,"done":true}
#[wasm_bindgen]
pub fn check_keys_batch(
    target_address: &str,
    start_key_hex: &str,
    end_key_hex: &str,
    iterations: u32,
) -> String {
    let start = match hex_to_bytes(start_key_hex) {
        Some(k) => k,
        None => return String::from(ERR_JSON),
    };
    let end = match hex_to_bytes(end_key_hex) {
        Some(k) => k,
        None => return String::from(ERR_JSON),
    };

    let mut current = start;
    let mut checked: u32 = 0;

    while checked < iterations {
        // Past the end of the range — nothing more to check here.
        if cmp_be(&current, &end) == core::cmp::Ordering::Greater {
            return format!(
                r#"{{"found":false,"key":null,"wif":null,"address":null,"checked":{},"next_key":"{}","done":true}}"#,
                checked,
                bytes_to_hex(&current)
            );
        }

        // Derive both address forms from a single point multiplication.
        // (None = key out of curve order — can't match any target, just skip it.)
        if let Some((addr_compressed, addr_uncompressed)) = generate_addresses_both(&current) {
            // Most puzzle addresses are compressed — check that variant first.
            if addr_compressed == target_address {
                return format!(
                    r#"{{"found":true,"key":"{}","wif":"{}","address":"{}","checked":{},"done":false}}"#,
                    bytes_to_hex(&current),
                    private_key_to_wif(&current, true),
                    addr_compressed,
                    checked + 1
                );
            }
            if addr_uncompressed == target_address {
                return format!(
                    r#"{{"found":true,"key":"{}","wif":"{}","address":"{}","checked":{},"done":false}}"#,
                    bytes_to_hex(&current),
                    private_key_to_wif(&current, false),
                    addr_uncompressed,
                    checked + 1
                );
            }
        }

        checked += 1;

        // Reached the inclusive end exactly — range fully scanned.
        if cmp_be(&current, &end) == core::cmp::Ordering::Equal {
            return format!(
                r#"{{"found":false,"key":null,"wif":null,"address":null,"checked":{},"next_key":"{}","done":true}}"#,
                checked,
                bytes_to_hex(&end)
            );
        }

        add_to_key(&mut current, 1);
    }

    // Batch budget exhausted before reaching the end — report where to resume.
    format!(
        r#"{{"found":false,"key":null,"wif":null,"address":null,"checked":{},"next_key":"{}","done":false}}"#,
        checked,
        bytes_to_hex(&current)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hexkey(s: &str) -> [u8; 32] {
        hex_to_bytes(s).unwrap()
    }

    const K01: &str = "0000000000000000000000000000000000000000000000000000000000000001";
    const K0A: &str = "000000000000000000000000000000000000000000000000000000000000000a";

    #[test]
    fn test_known_address() {
        // Test vector: private key = 1 (canonical secp256k1 generator point).
        let key = hexkey(K01);
        // Uncompressed P2PKH address
        assert_eq!(generate_address(&key, false), "1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm");
        // Compressed P2PKH address
        assert_eq!(generate_address(&key, true), "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH");
    }

    #[test]
    fn test_add_to_key_carry() {
        let mut key = hexkey("00000000000000000000000000000000000000000000000000000000000000ff");
        add_to_key(&mut key, 1);
        assert_eq!(
            bytes_to_hex(&key),
            "0000000000000000000000000000000000000000000000000000000000000100"
        );
    }

    #[test]
    fn test_cmp_be() {
        let a = hexkey("0000000000000000000000000000000000000000000000000000000000000005");
        let b = hexkey(K0A);
        assert_eq!(cmp_be(&a, &b), core::cmp::Ordering::Less);
        assert_eq!(cmp_be(&b, &a), core::cmp::Ordering::Greater);
        assert_eq!(cmp_be(&a, &a), core::cmp::Ordering::Equal);
    }

    #[test]
    fn test_batch_finds_key() {
        // target = compressed address of key 0x05, search range [01..0a]
        let key5 = hexkey("0000000000000000000000000000000000000000000000000000000000000005");
        let target = generate_address(&key5, true);

        let json = check_keys_batch(&target, K01, K0A, 10);

        assert!(json.contains(r#""found":true"#), "json={}", json);
        assert!(
            json.contains(r#""key":"0000000000000000000000000000000000000000000000000000000000000005""#),
            "json={}",
            json
        );
        // WIF must match the canonical encoding
        let expected_wif = private_key_to_wif(&key5, true);
        assert!(json.contains(&format!(r#""wif":"{}""#, expected_wif)), "json={}", json);
        // keys 1..5 inspected → checked == 5
        assert!(json.contains(r#""checked":5"#), "json={}", json);
    }

    #[test]
    fn test_batch_not_found_done() {
        // A burn address that no key in [01..0a] maps to.
        let json = check_keys_batch("1BitcoinEaterAddressDontSendf59kuE", K01, K0A, 100);
        assert!(json.contains(r#""found":false"#), "json={}", json);
        assert!(json.contains(r#""done":true"#), "json={}", json);
        // Range is 10 keys (01..0a inclusive)
        assert!(json.contains(r#""checked":10"#), "json={}", json);
    }

    #[test]
    fn test_batch_resume_next_key() {
        // iterations < range size: check 01,02,03 then resume at 04
        let json = check_keys_batch("1BitcoinEaterAddressDontSendf59kuE", K01, K0A, 3);
        assert!(json.contains(r#""checked":3"#), "json={}", json);
        assert!(json.contains(r#""done":false"#), "json={}", json);
        assert!(
            json.contains(r#""next_key":"0000000000000000000000000000000000000000000000000000000000000004""#),
            "json={}",
            json
        );
    }
}
