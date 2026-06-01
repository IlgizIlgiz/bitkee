// Bitcoin Puzzle definitions — портировано из src/data/puzzles.js

#[derive(Clone, Debug)]
pub struct Puzzle {
    pub id: u32,
    pub name: &'static str,
    pub address: &'static str,
    pub range_start: &'static str, // hex без 0x, может быть коротким
    pub range_end: &'static str,   // hex без 0x
    pub reward: f64,
    pub bits: u32,
    pub solved: bool,
    pub is_test: bool,
}

impl Puzzle {
    /// Паддит hex-границы до 64 символов
    pub fn range_start_padded(&self) -> String {
        format!("{:0>64}", self.range_start)
    }
    pub fn range_end_padded(&self) -> String {
        format!("{:0>64}", self.range_end)
    }
}

/// Все пазлы
pub static BITCOIN_PUZZLES: &[Puzzle] = &[
    // --- Test Puzzle ---
    Puzzle {
        id: 0,
        name: "🧪 Test Puzzle (проверка — без баланса)",
        address: "187NV15KwFeijFa4EHCXyTFJA9Hvdjo4y8",
        range_start: "10000",
        range_end: "1ffff",
        reward: 0.0,
        bits: 17,
        solved: false,
        is_test: true,
    },
    // --- Small solved (для демонстрации) ---
    Puzzle {
        id: 10,
        name: "Puzzle #10 (решён, 2016)",
        address: "1LeBZP5QCwwgXRtmVUvTVrraqPUokyLHqe",
        range_start: "200",
        range_end: "3ff",
        reward: 0.0,
        bits: 10,
        solved: true,
        is_test: false,
    },
    Puzzle {
        id: 13,
        name: "Puzzle #13 (решён, 2016)",
        address: "1Pie8JkxBT6MGPz9Nvi3fsPkr2D8q3GBc1",
        range_start: "1000",
        range_end: "1fff",
        reward: 0.0,
        bits: 13,
        solved: true,
        is_test: false,
    },
    Puzzle {
        id: 15,
        name: "Puzzle #15 (решён, 2016)",
        address: "1QCbW9HWnwQWiQqVo5exhAnmfqKRrCRsvW",
        range_start: "4000",
        range_end: "7fff",
        reward: 0.0,
        bits: 15,
        solved: true,
        is_test: false,
    },
    Puzzle {
        id: 16,
        name: "Puzzle #16 (решён, 2016)",
        address: "1BDyrQ6WoF8VN3g9SAS1iKZcPzFfnDVieY",
        range_start: "8000",
        range_end: "ffff",
        reward: 0.0,
        bits: 16,
        solved: true,
        is_test: false,
    },
    // --- Solved larger puzzles ---
    Puzzle {
        id: 66,
        name: "Puzzle #66 (решён, 2024-09-12)",
        address: "13zb1hQbWVsc2S7ZTZnP2G4undNNpdh5so",
        range_start: "20000000000000000",
        range_end: "3ffffffffffffffff",
        reward: 0.0,
        bits: 66,
        solved: true,
        is_test: false,
    },
    Puzzle {
        id: 67,
        name: "Puzzle #67 (решён, 2025-02-21)",
        address: "1BY8GQbnueYofwSuFAT3USAhGjPrkxDdW9",
        range_start: "40000000000000000",
        range_end: "7ffffffffffffffff",
        reward: 0.0,
        bits: 67,
        solved: true,
        is_test: false,
    },
    Puzzle {
        id: 68,
        name: "Puzzle #68 (решён, 2025-04-06)",
        address: "1MVDYgVaSN6iKKEsbzRUAYFrYJadLYZvvZ",
        range_start: "80000000000000000",
        range_end: "fffffffffffffffff",
        reward: 0.0,
        bits: 68,
        solved: true,
        is_test: false,
    },
    Puzzle {
        id: 69,
        name: "Puzzle #69 (решён, 2025-04-30)",
        address: "19vkiEajfhuZ8bs8Zu2jgmC6oqZbWqhxhG",
        range_start: "100000000000000000",
        range_end: "1fffffffffffffffff",
        reward: 0.0,
        bits: 69,
        solved: true,
        is_test: false,
    },
    Puzzle {
        id: 70,
        name: "Puzzle #70 (решён, до 2023)",
        address: "19YZECXj3SxEZMoUeJ1yiPsw8xANe7M7QR",
        range_start: "200000000000000000",
        range_end: "3fffffffffffffffff",
        reward: 0.0,
        bits: 70,
        solved: true,
        is_test: false,
    },
    // ===== НЕРЕШЁННЫЕ — С РЕАЛЬНЫМ BTC =====
    Puzzle {
        id: 71,
        name: "Puzzle #71 ⚡ 7.10 BTC",
        address: "1PWo3JeB9jrGwfHDNpdGK54CRas7fsVzXU",
        range_start: "400000000000000000",
        range_end: "7fffffffffffffffff",
        reward: 7.10,
        bits: 71,
        solved: false,
        is_test: false,
    },
    Puzzle {
        id: 72,
        name: "Puzzle #72 ⚡ 7.20 BTC",
        address: "1JTK7s9YVYywfm5XUH7RNhHJH1LshCaRFR",
        range_start: "800000000000000000",
        range_end: "ffffffffffffffffff",
        reward: 7.20,
        bits: 72,
        solved: false,
        is_test: false,
    },
    Puzzle {
        id: 73,
        name: "Puzzle #73 ⚡ 7.30 BTC",
        address: "12VVRNPi4SJqUTsp6FmqDqY5sGosDtysn4",
        range_start: "1000000000000000000",
        range_end: "1ffffffffffffffffff",
        reward: 7.30,
        bits: 73,
        solved: false,
        is_test: false,
    },
    Puzzle {
        id: 74,
        name: "Puzzle #74 ⚡ 7.40 BTC",
        address: "1FWGcVDK3JGzCC3WtkYetULPszMaK2Jksv",
        range_start: "2000000000000000000",
        range_end: "3ffffffffffffffffff",
        reward: 7.40,
        bits: 74,
        solved: false,
        is_test: false,
    },
    Puzzle {
        id: 75,
        name: "Puzzle #75 (решён, до 2023)",
        address: "1J36UjUByGroXcCvmj13U6uwaVv9caEeAt",
        range_start: "4000000000000000000",
        range_end: "7ffffffffffffffffff",
        reward: 0.0,
        bits: 75,
        solved: true,
        is_test: false,
    },
];

/// Получить нерешённые пазлы (и Test Puzzle тоже)
pub fn get_searchable_puzzles() -> Vec<&'static Puzzle> {
    BITCOIN_PUZZLES
        .iter()
        .filter(|p| !p.solved || p.is_test)
        .collect()
}
