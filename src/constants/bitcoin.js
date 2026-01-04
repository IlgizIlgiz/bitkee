import BN from 'bn.js';

// Максимальное значение приватного ключа (секунды порядка)
export const MAX_PRIVATE_KEY = "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140";

// Максимальное значение как BN
export const MAX_PRIVATE_KEY_BN = new BN(MAX_PRIVATE_KEY, 16);

// Количество адресов, генерируемых за раз
export const ADDRESSES_PER_BATCH = 128;

// Known patterns for AI (now handled by translations)
export const KNOWN_PATTERNS = {
  sequential: "searchPatterns.sequential",
  repeating: "searchPatterns.repeating",
  date_based: "searchPatterns.dateBased",
  word_based: "searchPatterns.wordBased",
  early_mining: "searchPatterns.earlyMining",
  mt_gox_leak: "searchPatterns.mtGoxLeak",
  brain_wallet: "searchPatterns.brainWallet"
};

// Временные периоды для анализа
export const TIME_PERIODS = {
  "2009-2010": { start: 0, end: 0.001, description: "Ранние годы, Сатоши" },
  "2011-2012": { start: 0.1, end: 0.2, description: "Период Mt.Gox" },
  "2013-2014": { start: 0.3, end: 0.4, description: "Первый пузырь" },
  "2015-2016": { start: 0.6, end: 0.7, description: "После крахов" },
  "2017-2020": { start: 0.8, end: 0.9, description: "Современный период" }
}; 