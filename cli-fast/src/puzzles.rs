// Полный список пазлов — синхронизирован с веб-версией (src/data/puzzles.js).

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
    // Тестовый
    Puzzle { id: 0,  name: "🧪 Test Puzzle (ключ 0x1abcd)", address: "187NV15KwFeijFa4EHCXyTFJA9Hvdjo4y8", range_start: "10000", range_end: "1ffff", reward: 0.0, bits: 17 },
    // Мелкие решённые (находятся за секунды)
    Puzzle { id: 10, name: "Puzzle #10 (решён)", address: "1LeBZP5QCwwgXRtmVUvTVrraqPUokyLHqe", range_start: "200",  range_end: "3ff",  reward: 0.0, bits: 10 },
    Puzzle { id: 13, name: "Puzzle #13 (решён)", address: "1Pie8JkxBT6MGPz9Nvi3fsPkr2D8q3GBc1", range_start: "1000", range_end: "1fff", reward: 0.0, bits: 13 },
    Puzzle { id: 15, name: "Puzzle #15 (решён)", address: "1QCbW9HWnwQWiQqVo5exhAnmfqKRrCRsvW", range_start: "4000", range_end: "7fff", reward: 0.0, bits: 15 },
    Puzzle { id: 16, name: "Puzzle #16 (решён)", address: "1BDyrQ6WoF8VN3g9SAS1iKZcPzFfnDVieY", range_start: "8000", range_end: "ffff", reward: 0.0, bits: 16 },
    // Большие решённые (для наблюдения процесса — перебором не найти)
    Puzzle { id: 66, name: "Puzzle #66 (решён)", address: "13zb1hQbWVsc2S7ZTZnP2G4undNNpdh5so", range_start: "20000000000000000", range_end: "3ffffffffffffffff", reward: 0.0, bits: 66 },
    Puzzle { id: 67, name: "Puzzle #67 (решён)", address: "1BY8GQbnueYofwSuFAT3USAhGjPrkxDdW9", range_start: "40000000000000000", range_end: "7ffffffffffffffff", reward: 0.0, bits: 67 },
    Puzzle { id: 68, name: "Puzzle #68 (решён)", address: "1MVDYgVaSN6iKKEsbzRUAYFrYJadLYZvvZ", range_start: "80000000000000000", range_end: "fffffffffffffffff", reward: 0.0, bits: 68 },
    Puzzle { id: 69, name: "Puzzle #69 (решён)", address: "19vkiEajfhuZ8bs8Zu2jgmC6oqZbWqhxhG", range_start: "100000000000000000", range_end: "1fffffffffffffffff", reward: 0.0, bits: 69 },
    Puzzle { id: 70, name: "Puzzle #70 (решён)", address: "19YZECXj3SxEZMoUeJ1yiPsw8xANe7M7QR", range_start: "200000000000000000", range_end: "3fffffffffffffffff", reward: 0.0, bits: 70 },
    // Нерешённые — с наградой
    Puzzle { id: 71, name: "Puzzle #71", address: "1PWo3JeB9jrGwfHDNpdGK54CRas7fsVzXU", range_start: "400000000000000000", range_end: "7fffffffffffffffff", reward: 7.10, bits: 71 },
    Puzzle { id: 72, name: "Puzzle #72", address: "1JTK7s9YVYywfm5XUH7RNhHJH1LshCaRFR", range_start: "800000000000000000", range_end: "ffffffffffffffffff", reward: 7.20, bits: 72 },
    Puzzle { id: 73, name: "Puzzle #73", address: "12VVRNPi4SJqUTsp6FmqDqY5sGosDtysn4", range_start: "1000000000000000000", range_end: "1ffffffffffffffffff", reward: 7.30, bits: 73 },
    Puzzle { id: 74, name: "Puzzle #74", address: "1FWGcVDK3JGzCC3WtkYetULPszMaK2Jksv", range_start: "2000000000000000000", range_end: "3ffffffffffffffffff", reward: 7.40, bits: 74 },
    Puzzle { id: 75, name: "Puzzle #75 (решён)", address: "1J36UjUByGroXcCvmj13U6uwaVv9caEeAt", range_start: "4000000000000000000", range_end: "7ffffffffffffffffff", reward: 0.0, bits: 75 },
];
