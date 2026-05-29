// wasmWorker.js - WASM-based address generation worker
// Loads the wasm-bindgen-generated glue (btc_wasm.js, built with `--target no-modules`)
// via importScripts and drives it. The glue defines a global `wasm_bindgen` init function
// with the exported functions attached: generate_single_address, check_keys_batch.
// See wasm/btc_wasm/BUILD.md for how to rebuild btc_wasm_bg.wasm + btc_wasm.js.

/* global wasm_bindgen, importScripts */

let wasmReady = false;
let wasmInitPromise = null;

// Load WASM via the generated glue.
// Singleton: concurrent callers (eager init on load + the first onmessage) share one promise,
// so importScripts runs at most once — re-running it would re-execute `let wasm_bindgen = ...`
// and throw "Identifier 'wasm_bindgen' has already been declared".
function initWasm() {
  if (wasmReady) return Promise.resolve(true);
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      // btc_wasm.js defines a global `wasm_bindgen` init function (no-modules build).
      if (typeof wasm_bindgen === 'undefined') {
        importScripts('/wasm/btc_wasm.js');
      }
      // Initialize the module. The wasm path must be passed explicitly — `document.currentScript`
      // (the glue's auto-detection) is unavailable inside a worker.
      await wasm_bindgen({ module_or_path: '/wasm/btc_wasm_bg.wasm' });

      wasmReady = true;
      console.log('[WASM Worker] Module loaded successfully');
      return true;
    } catch (error) {
      console.error('[WASM Worker] Failed to load:', error);
      wasmInitPromise = null; // allow a later retry
      return false;
    }
  })();

  return wasmInitPromise;
}

// Generate a single address using WASM (used by the normal manual/auto generation path).
function generateSingleAddress(privateKeyHex, compressed) {
  return wasm_bindgen.generate_single_address(privateKeyHex, compressed);
}

// Check a batch of CONSECUTIVE keys entirely inside WASM — one JS↔WASM round-trip per batch
// instead of per key. Returns the parsed result object:
//   { found, key, wif, address, checked, next_key, done }
function checkKeysBatch(targetAddress, startHex, endHex, iterations) {
  const json = wasm_bindgen.check_keys_batch(targetAddress, startHex, endHex, iterations >>> 0);
  return JSON.parse(json);
}

// Generate batch of addresses
async function generateBatch(startKeyHex, count) {
  const addresses = [];

  for (let i = 0; i < count; i++) {
    // Calculate current key
    const currentKey = addToKey(startKeyHex, i);

    const uncompressed = generateSingleAddress(currentKey, false);
    const compressed = generateSingleAddress(currentKey, true);

    if (uncompressed !== 'invalid_key' && compressed !== 'invalid_key') {
      // Generate WIF for uncompressed key
      const wif = await privateKeyToWIF(currentKey, false);

      addresses.push({
        publicKey: uncompressed,
        compressedPublicKey: compressed,
        privateKeyWIFUncompressed: wif
      });
    } else {
      addresses.push(null);
    }
  }

  return addresses;
}

// Add value to hex key
function addToKey(hexKey, value) {
  // Simple big number addition for hex strings
  const bytes = hexToBytes(hexKey);
  let carry = BigInt(value);

  for (let i = 31; i >= 0 && carry > 0n; i--) {
    const sum = BigInt(bytes[i]) + (carry & 0xFFn);
    bytes[i] = Number(sum & 0xFFn);
    carry = (carry >> 8n) + (sum >> 8n);
  }

  return bytesToHex(bytes);
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Convert private key hex to WIF (Wallet Import Format)
async function privateKeyToWIF(privateKeyHex, compressed = false) {
  const privateKeyBytes = hexToBytes(privateKeyHex);

  // Version byte 0x80 for mainnet
  const payload = new Uint8Array(compressed ? 34 : 33);
  payload[0] = 0x80;
  payload.set(privateKeyBytes, 1);

  if (compressed) {
    payload[33] = 0x01;
  }

  // Double SHA256 for checksum
  const hash1 = await crypto.subtle.digest('SHA-256', payload);
  const hash2 = await crypto.subtle.digest('SHA-256', hash1);
  const checksum = new Uint8Array(hash2).slice(0, 4);

  // Combine payload + checksum
  const fullPayload = new Uint8Array(payload.length + 4);
  fullPayload.set(payload);
  fullPayload.set(checksum, payload.length);

  // Base58 encode
  return base58Encode(fullPayload);
}

// Base58 encoding
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
  // Count leading zeros
  let leadingZeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    leadingZeros++;
  }

  // Convert to BigInt
  let num = 0n;
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }

  // Convert to base58
  let result = '';
  while (num > 0n) {
    const remainder = num % 58n;
    result = BASE58_ALPHABET[Number(remainder)] + result;
    num = num / 58n;
  }

  // Add leading '1's for leading zeros
  return '1'.repeat(leadingZeros) + result;
}

// Position to private key
function positionToPrivateKey(position) {
  // MAX_PRIVATE_KEY = FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140
  // Simplified calculation using BigInt
  const MAX_KEY = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140');
  const scale = BigInt(Math.round(position * 1e10));
  const targetKey = (MAX_KEY * scale) / BigInt(1e10);

  if (targetKey === 0n) {
    return '0000000000000000000000000000000000000000000000000000000000000001';
  }

  return targetKey.toString(16).padStart(64, '0');
}

// Generate random key in range (for fallback mode)
function generateRandomKeyInRange(rangeStart, rangeEnd) {
  const start = BigInt('0x' + rangeStart);
  const end = BigInt('0x' + rangeEnd);
  const range = end - start + 1n; // +1 to include both boundaries

  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);

  let randomBigInt = 0n;
  for (let i = 0; i < randomBytes.length; i++) {
    randomBigInt = (randomBigInt << 8n) | BigInt(randomBytes[i]);
  }

  const randomInRange = start + (randomBigInt % range);
  return randomInRange.toString(16).padStart(64, '0');
}

// Puzzle search state
let puzzleSearchRunning = false;
let puzzleSearchStats = { keysChecked: 0, startTime: 0, found: false, result: null };
let puzzleThrottleMs = 0; // Реальная пауза между батчами (управляется главным потоком)

// Continuous puzzle search - runs until stopped or found.
// mode: 'sequential' | 'random'
// rangeStartHex/rangeEndHex — границы поиска для этого воркера (уже разрезанные главным потоком).
//
// Весь внутренний цикл проверки ключей выполняется ВНУТРИ WASM (check_keys_batch): один
// JS↔WASM round-trip на БАТЧ вместо одного на каждый ключ. Это и даёт основной прирост скорости.
async function runPuzzleSearch(targetAddress, rangeStartHex, rangeEndHex, mode, throttleMs, batchSize) {
  puzzleSearchRunning = true;
  puzzleSearchStats = { keysChecked: 0, startTime: Date.now(), found: false, result: null };
  puzzleThrottleMs = typeof throttleMs === 'number' ? throttleMs : 0;

  // Один батч проверяется атомарно внутри WASM, поэтому stop срабатывает между батчами.
  // Держим батч умеренным (~сотни мс макс) ради отзывчивости stop/throttle.
  const BATCH_SIZE = batchSize && batchSize > 0 ? batchSize : 1000;
  const REPORT_INTERVAL = 1000;
  let lastReportTime = Date.now();

  // Pad границы до 64 символов (puzzles.js хранит короткие hex)
  const startHex = rangeStartHex.padStart(64, '0');
  const endHex = rangeEndHex.padStart(64, '0');
  const startBig = BigInt('0x' + startHex);
  const endBig = BigInt('0x' + endHex);
  const rangeSize = endBig - startBig + 1n;

  // Для sequential — текущая позиция; для random — пересчитывается каждый батч.
  let currentKey = startHex;
  let sequentialDone = false;

  console.log('[WASM] Starting puzzle search:', { targetAddress, mode, throttleMs: puzzleThrottleMs, startHex, endHex, BATCH_SIZE });

  const emitFound = (r) => {
    puzzleSearchStats.found = true;
    puzzleSearchStats.result = {
      found: true,
      private_key_hex: r.key,
      private_key_wif: r.wif,
      address_found: r.address,
      keys_checked: puzzleSearchStats.keysChecked
    };
    puzzleSearchRunning = false;
    self.postMessage({ puzzleResult: puzzleSearchStats.result });
  };

  while (puzzleSearchRunning && !puzzleSearchStats.found && !sequentialDone) {
    let res;
    if (mode === 'sequential') {
      // Проверяем BATCH_SIZE последовательных ключей от текущей позиции, не выходя за endHex.
      res = checkKeysBatch(targetAddress, currentKey, endHex, BATCH_SIZE);
      puzzleSearchStats.keysChecked += res.checked;
      if (res.found) { emitFound(res); return; }
      currentKey = res.next_key;
      if (res.done) sequentialDone = true;
    } else {
      // random: случайный старт сегмента (корректная JS-генерация ключа в диапазоне) →
      // проверяем сегмент из BATCH_SIZE последовательных ключей, не выходя за endHex.
      const segStart = generateRandomKeyInRange(startHex, endHex);
      let segEndBig = BigInt('0x' + segStart) + BigInt(BATCH_SIZE - 1);
      if (segEndBig > endBig) segEndBig = endBig;
      const segEnd = segEndBig.toString(16).padStart(64, '0');
      res = checkKeysBatch(targetAddress, segStart, segEnd, BATCH_SIZE);
      puzzleSearchStats.keysChecked += res.checked;
      if (res.found) { emitFound(res); return; }
    }

    // Отправляем статистику каждую секунду
    const now = Date.now();
    if (now - lastReportTime >= REPORT_INTERVAL) {
      const elapsed = (now - puzzleSearchStats.startTime) / 1000;
      const speed = elapsed > 0 ? Math.round(puzzleSearchStats.keysChecked / elapsed) : 0;

      // Для sequential — посчитать % прогресса по этому воркеру
      let progress = null;
      if (mode === 'sequential') {
        const done = BigInt('0x' + currentKey) - startBig;
        // 4 знака после запятой — для маленьких процентов
        const promille = Number((done * 1000000n) / (rangeSize === 0n ? 1n : rangeSize));
        progress = promille / 10000; // %
      }

      self.postMessage({
        puzzleStats: {
          keysChecked: puzzleSearchStats.keysChecked,
          speed: speed,
          running: puzzleSearchRunning,
          progress: progress
        }
      });
      lastReportTime = now;
    }

    // Реальная пауза между батчами — это и есть «дроссель» CPU.
    // 0 ms всё равно отдаёт цикл event loop, поэтому stop/throttle-команды успевают прийти.
    await new Promise(r => setTimeout(r, puzzleThrottleMs > 0 ? puzzleThrottleMs : 0));
  }

  // Финальный отчёт (особенно важен когда sequential дошёл до конца своего диапазона)
  if (sequentialDone) {
    self.postMessage({
      puzzleStats: {
        keysChecked: puzzleSearchStats.keysChecked,
        speed: 0,
        running: false,
        progress: 100,
        done: true
      }
    });
  }

  console.log('[WASM] Puzzle search stopped. Total checked:', puzzleSearchStats.keysChecked);
}

// Stop puzzle search
function stopPuzzleSearch() {
  puzzleSearchRunning = false;
  console.log('[WASM] Stopping puzzle search...');
}

// Message handler
self.onmessage = async function(e) {
  const { position, privateKeyHex, addressesToGenerate, requestId, puzzleSearch, puzzleStop, puzzleUpdate } = e.data;

  // Stop puzzle search command
  if (puzzleStop) {
    stopPuzzleSearch();
    return;
  }

  // Hot-update throttle while running (intensity / pause-when-hidden)
  if (puzzleUpdate) {
    if (typeof puzzleUpdate.throttleMs === 'number') {
      puzzleThrottleMs = puzzleUpdate.throttleMs;
    }
    return;
  }

  // Initialize WASM if not done
  if (!wasmReady) {
    const success = await initWasm();
    if (!success) {
      // Fall back - send empty result
      self.postMessage({ addresses: [], requestId, error: 'WASM not available' });
      return;
    }
  }

  // Puzzle search mode - runs continuously until stopped or found
  if (puzzleSearch) {
    const { targetAddress, rangeStart, rangeEnd, mode, throttleMs, batchSize } = puzzleSearch;
    runPuzzleSearch(
      targetAddress,
      rangeStart,
      rangeEnd,
      mode || 'random',
      typeof throttleMs === 'number' ? throttleMs : 0,
      batchSize
    );
    return;
  }

  // Normal batch address generation mode
  const count = addressesToGenerate || 128;
  let startKey;

  if (privateKeyHex) {
    startKey = privateKeyHex;
  } else {
    startKey = positionToPrivateKey(position);
  }

  const addresses = await generateBatch(startKey, count);

  self.postMessage({ addresses, requestId });
};

// Initialize on load
initWasm();
