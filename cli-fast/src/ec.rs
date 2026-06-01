// Инкрементальная EC-арифметика secp256k1 с batch inversion.
// Поле F_p, p = 2^256 - 2^32 - 977. Аффинные координаты.
//
// Идея: точки k+1, k+2, ... = P+G, P+2G, ... где iG предвычислены.
// dx_i = x(iG) - x(P) известны до вычисления → batch-инвертируем разом.

use crypto_bigint::modular::runtime_mod::{DynResidue, DynResidueParams};
use crypto_bigint::{U256, Integer, Encoding};
use std::sync::OnceLock;

pub type Fe = DynResidue<{ U256::LIMBS }>;

// secp256k1 field prime
const P_HEX: &str = "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F";
// Генератор G
const GX_HEX: &str = "79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798";
const GY_HEX: &str = "483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8";

static PARAMS: OnceLock<DynResidueParams<{ U256::LIMBS }>> = OnceLock::new();

pub fn params() -> &'static DynResidueParams<{ U256::LIMBS }> {
    PARAMS.get_or_init(|| {
        let p = U256::from_be_hex(P_HEX);
        DynResidueParams::new(&p)
    })
}

#[inline]
pub fn fe_from_be(bytes: &[u8; 32]) -> Fe {
    DynResidue::new(&U256::from_be_slice(bytes), *params())
}
#[inline]
pub fn fe_one() -> Fe {
    DynResidue::one(*params())
}
#[inline]
pub fn fe_to_be(fe: &Fe) -> [u8; 32] {
    fe.retrieve().to_be_bytes()
}

pub fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[derive(Clone)]
pub struct AffinePoint {
    pub x: Fe,
    pub y: Fe,
}

/// Batch inversion (Montgomery trick): N обращений → 1 обращение + 3N умножений.
/// Нулевые входы (не должны встречаться в норме) заменяются единицей.
pub fn batch_invert(elems: &[Fe]) -> Vec<Fe> {
    let n = elems.len();
    if n == 0 {
        return Vec::new();
    }
    let one = fe_one();
    // префиксные произведения
    let mut prefix = Vec::with_capacity(n);
    let mut acc = one;
    for e in elems {
        acc = acc.mul(e);
        prefix.push(acc);
    }
    // обращение полного произведения
    let (mut inv, _ok) = acc.invert();
    let mut out = vec![one; n];
    for i in (0..n).rev() {
        let prev = if i == 0 { one } else { prefix[i - 1] };
        out[i] = inv.mul(&prev);
        inv = inv.mul(&elems[i]);
    }
    out
}

/// Предвычислить таблицу iG для i=1..=n (через k256, один раз при старте).
pub fn precompute_ig_table(n: usize) -> Vec<AffinePoint> {
    use k256::elliptic_curve::sec1::ToEncodedPoint;
    use k256::ProjectivePoint;

    let mut table = Vec::with_capacity(n);
    let mut acc = ProjectivePoint::GENERATOR;
    for _ in 0..n {
        let ep = acc.to_affine().to_encoded_point(false);
        let b = ep.as_bytes(); // 0x04 || x(32) || y(32)
        let mut x = [0u8; 32];
        let mut y = [0u8; 32];
        x.copy_from_slice(&b[1..33]);
        y.copy_from_slice(&b[33..65]);
        table.push(AffinePoint {
            x: fe_from_be(&x),
            y: fe_from_be(&y),
        });
        acc += ProjectivePoint::GENERATOR;
    }
    table
}

/// Стартовая точка k*G через k256 (одно EC-умножение).
/// Возвращает affine (x,y) или None для невалидного ключа.
pub fn point_from_scalar_be(priv_be: &[u8; 32]) -> Option<AffinePoint> {
    use k256::elliptic_curve::sec1::ToEncodedPoint;
    let sk = k256::SecretKey::from_slice(priv_be).ok()?;
    let ep = sk.public_key().to_encoded_point(false);
    let b = ep.as_bytes();
    if b.len() != 65 {
        return None;
    }
    let mut x = [0u8; 32];
    let mut y = [0u8; 32];
    x.copy_from_slice(&b[1..33]);
    y.copy_from_slice(&b[33..65]);
    Some(AffinePoint {
        x: fe_from_be(&x),
        y: fe_from_be(&y),
    })
}

/// Вычислить P + iG для всех i из таблицы (P фиксирован).
/// Возвращает Vec affine точек той же длины, что table.
pub fn add_point_batch(p: &AffinePoint, table: &[AffinePoint]) -> Vec<AffinePoint> {
    let n = table.len();
    // dx_i = x(iG) - x(P)
    let dxs: Vec<Fe> = table.iter().map(|q| q.x.sub(&p.x)).collect();
    let inv_dxs = batch_invert(&dxs);

    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let q = &table[i];
        // lambda = (y_q - y_p) / (x_q - x_p)
        let lambda = q.y.sub(&p.y).mul(&inv_dxs[i]);
        // x3 = lambda^2 - x_p - x_q
        let x3 = lambda.square().sub(&p.x).sub(&q.x);
        // y3 = lambda*(x_p - x3) - y_p
        let y3 = lambda.mul(&p.x.sub(&x3)).sub(&p.y);
        out.push(AffinePoint { x: x3, y: y3 });
    }
    out
}

/// Сжатый публичный ключ (33 байта) из affine точки.
#[inline]
pub fn compressed_pubkey(pt: &AffinePoint) -> [u8; 33] {
    let mut out = [0u8; 33];
    let y = pt.y.retrieve();
    out[0] = if bool::from(y.is_odd()) { 0x03 } else { 0x02 };
    out[1..].copy_from_slice(&fe_to_be(&pt.x));
    out
}

/// Несжатый публичный ключ (65 байт).
#[inline]
pub fn uncompressed_pubkey(pt: &AffinePoint) -> [u8; 65] {
    let mut out = [0u8; 65];
    out[0] = 0x04;
    out[1..33].copy_from_slice(&fe_to_be(&pt.x));
    out[33..].copy_from_slice(&fe_to_be(&pt.y));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use k256::elliptic_curve::sec1::ToEncodedPoint;
    use k256::ProjectivePoint;

    fn key_be(n: u64) -> [u8; 32] {
        let mut k = [0u8; 32];
        k[24..].copy_from_slice(&n.to_be_bytes());
        k
    }

    // Эталонный (k+i)*G через k256 → compressed pubkey
    fn ref_compressed(k: u64) -> Vec<u8> {
        let sk = k256::SecretKey::from_slice(&key_be(k)).unwrap();
        sk.public_key().to_encoded_point(true).as_bytes().to_vec()
    }

    #[test]
    fn test_field_roundtrip() {
        let gx = fe_from_be(&hex32(GX_HEX));
        assert_eq!(&fe_to_be(&gx)[..], &hex32(GX_HEX)[..]);
    }

    #[test]
    fn test_start_point_key1() {
        // 1*G → x должен равняться Gx
        let p = point_from_scalar_be(&key_be(1)).unwrap();
        assert_eq!(fe_to_be(&p.x), hex32(GX_HEX));
        assert_eq!(fe_to_be(&p.y), hex32(GY_HEX));
    }

    #[test]
    fn test_incremental_matches_k256() {
        // P = 1000*G, далее P+G..P+8G сверяем с k256 (1001..1008)*G
        let start = 1000u64;
        let n = 8;
        let p = point_from_scalar_be(&key_be(start)).unwrap();
        let table = precompute_ig_table(n);
        let pts = add_point_batch(&p, &table);
        for i in 0..n {
            let got = compressed_pubkey(&pts[i]).to_vec();
            let want = ref_compressed(start + (i as u64) + 1);
            assert_eq!(got, want, "mismatch at i={}", i);
        }
    }

    #[test]
    fn test_incremental_large() {
        // Проверка вокруг тестового ключа 0x1abcd
        let start = 0x1abc0u64;
        let n = 32;
        let p = point_from_scalar_be(&key_be(start)).unwrap();
        let table = precompute_ig_table(n);
        let pts = add_point_batch(&p, &table);
        for i in 0..n {
            let got = compressed_pubkey(&pts[i]).to_vec();
            let want = ref_compressed(start + (i as u64) + 1);
            assert_eq!(got, want, "mismatch at i={}, key={:x}", i, start + i as u64 + 1);
        }
    }

    fn hex32(s: &str) -> [u8; 32] {
        let mut out = [0u8; 32];
        for i in 0..32 {
            out[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
        }
        out
    }
}
