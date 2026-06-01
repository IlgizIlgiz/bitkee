// Подмножество пазлов для быстрого солвера. Адреса сверены с основным проектом.

#[derive(Clone)]
pub struct Puzzle {
    pub id: u32,
    pub name: &'static str,
    pub address: &'static str,
    pub range_start: &'static str, // hex без 0x
    pub range_end: &'static str,
    pub reward: f64,
    pub bits: u32,
}

pub static PUZZLES: &[Puzzle] = &[
    Puzzle { id: 0,  name: "🧪 Test Puzzle (ключ 0x1abcd)", address: "187NV15KwFeijFa4EHCXyTFJA9Hvdjo4y8", range_start: "10000", range_end: "1ffff", reward: 0.0, bits: 17 },
    Puzzle { id: 10, name: "Puzzle #10 (решён)", address: "1LeBZP5QCwwgXRtmVUvTVrraqPUokyLHqe", range_start: "200",  range_end: "3ff",  reward: 0.0, bits: 10 },
    Puzzle { id: 13, name: "Puzzle #13 (решён)", address: "1Pie8JkxBT6MGPz9Nvi3fsPkr2D8q3GBc1", range_start: "1000", range_end: "1fff", reward: 0.0, bits: 13 },
    Puzzle { id: 15, name: "Puzzle #15 (решён)", address: "1QCbW9HWnwQWiQqVo5exhAnmfqKRrCRsvW", range_start: "4000", range_end: "7fff", reward: 0.0, bits: 15 },
    Puzzle { id: 16, name: "Puzzle #16 (решён)", address: "1BDyrQ6WoF8VN3g9SAS1iKZcPzFfnDVieY", range_start: "8000", range_end: "ffff", reward: 0.0, bits: 16 },
    Puzzle { id: 71, name: "Puzzle #71", address: "1PWo3JeB9jrGwfHDNpdGK54CRas7fsVzXU", range_start: "400000000000000000", range_end: "7fffffffffffffffff", reward: 7.10, bits: 71 },
];
