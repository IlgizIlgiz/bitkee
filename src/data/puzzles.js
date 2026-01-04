// Bitcoin Puzzle Challenge Data
// https://privatekeys.pw/puzzles/bitcoin-puzzle-tx
//
// These are real Bitcoin addresses with known private key ranges.
// Someone deposited BTC as a challenge - find the key, claim the reward.
// Updated: January 2026

export const BITCOIN_PUZZLES = [
  // SOLVED PUZZLES (kept for reference, marked as solved)
  {
    id: 66,
    name: "Puzzle #66",
    address: "13zb1hQbWVsc2S7ZTZnP2G4undNNpdh5so",
    rangeStart: "20000000000000000",
    rangeEnd: "3ffffffffffffffff",
    reward: 0,
    bits: 66,
    rangeSize: "36893488147419103232", // 2^65
    solved: true,
    solvedDate: "2024-09-12"
  },
  {
    id: 67,
    name: "Puzzle #67",
    address: "1BY8GQbnueYofwSuFAT3USAhGjPrkxDdW9",
    rangeStart: "40000000000000000",
    rangeEnd: "7ffffffffffffffff",
    reward: 0,
    bits: 67,
    rangeSize: "73786976294838206464", // 2^66
    solved: true,
    solvedDate: "2025-02-21"
  },
  {
    id: 68,
    name: "Puzzle #68",
    address: "1MVDYgVaSN6iKKEsbzRUAYFrYJadLYZvvZ",
    rangeStart: "80000000000000000",
    rangeEnd: "fffffffffffffffff",
    reward: 0,
    bits: 68,
    rangeSize: "147573952589676412928", // 2^67
    solved: true,
    solvedDate: "2025-04-06"
  },
  {
    id: 69,
    name: "Puzzle #69",
    address: "19vkiEajfhuZ8bs8Zu2jgmC6oqZbWqhxhG",
    rangeStart: "100000000000000000",
    rangeEnd: "1fffffffffffffffff",
    reward: 0,
    bits: 69,
    rangeSize: "295147905179352825856", // 2^68
    solved: true,
    solvedDate: "2025-04-30"
  },
  {
    id: 70,
    name: "Puzzle #70",
    address: "19YZECXj3SxEZMoUeJ1yiPsw8xANe7M7QR",
    rangeStart: "200000000000000000",
    rangeEnd: "3fffffffffffffffff",
    reward: 0,
    bits: 70,
    rangeSize: "590295810358705651712", // 2^69
    solved: true,
    solvedDate: "pre-2023"
  },

  // UNSOLVED PUZZLES - these have real BTC!
  {
    id: 71,
    name: "Puzzle #71",
    address: "1PWo3JeB9jrGwfHDNpdGK54CRas7fsVzXU",
    rangeStart: "400000000000000000",
    rangeEnd: "7fffffffffffffffff",
    reward: 7.10, // ~7.1 BTC verified via blockchain.info
    bits: 71,
    rangeSize: "1180591620717411303424", // 2^70
    solved: false
  },
  {
    id: 72,
    name: "Puzzle #72",
    address: "1JTK7s9YVYywfm5XUH7RNhHJH1LshCaRFR",
    rangeStart: "800000000000000000",
    rangeEnd: "ffffffffffffffffff",
    reward: 7.20, // ~7.2 BTC verified via blockchain.info
    bits: 72,
    rangeSize: "2361183241434822606848", // 2^71
    solved: false
  },
  {
    id: 73,
    name: "Puzzle #73",
    address: "12VVRNPi4SJqUTsp6FmqDqY5sGosDtysn4", // FIXED: was incorrect
    rangeStart: "1000000000000000000",
    rangeEnd: "1ffffffffffffffffff",
    reward: 7.30, // ~7.3 BTC verified via blockchain.info
    bits: 73,
    rangeSize: "4722366482869645213696", // 2^72
    solved: false
  },
  {
    id: 74,
    name: "Puzzle #74",
    address: "1FWGcVDK3JGzCC3WtkYetULPszMaK2Jksv",
    rangeStart: "2000000000000000000",
    rangeEnd: "3ffffffffffffffffff",
    reward: 7.40, // ~7.4 BTC verified via blockchain.info
    bits: 74,
    rangeSize: "9444732965739290427392", // 2^73
    solved: false
  },
  {
    id: 75,
    name: "Puzzle #75",
    address: "1J36UjUByGroXcCvmj13U6uwaVv9caEeAt",
    rangeStart: "4000000000000000000",
    rangeEnd: "7ffffffffffffffffff",
    reward: 0,
    bits: 75,
    rangeSize: "18889465931478580854784", // 2^74
    solved: true,
    solvedDate: "pre-2023"
  }
];

// Default puzzle - first unsolved one
export const DEFAULT_PUZZLE_ID = 71;

// Get puzzle by ID
export const getPuzzleById = (id) => {
  return BITCOIN_PUZZLES.find(p => p.id === id);
};

// Get only unsolved puzzles
export const getUnsolvedPuzzles = () => {
  return BITCOIN_PUZZLES.filter(p => !p.solved);
};

// Format large number with commas
export const formatRangeSize = (size) => {
  return BigInt(size).toLocaleString('en-US');
};

// Calculate search progress percentage
export const calculateProgress = (checked, rangeSize) => {
  if (!checked || !rangeSize) return 0;
  const percentage = (BigInt(checked) * BigInt(10000000000)) / BigInt(rangeSize);
  return Number(percentage) / 100000000; // Return as percentage with 8 decimal places
};
