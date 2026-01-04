// wasmWorker.js - WASM-based address generation worker
// This worker loads and runs the WASM module directly

let wasm = null;
let wasmReady = false;

// Text encoding/decoding utilities
const textDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
const textEncoder = new TextEncoder();
let cachedMemory = null;

function getMemory() {
  if (cachedMemory === null || cachedMemory.buffer !== wasm.memory.buffer) {
    cachedMemory = new Uint8Array(wasm.memory.buffer);
  }
  return cachedMemory;
}

function getStringFromWasm(ptr, len) {
  return textDecoder.decode(getMemory().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

function passStringToWasm(arg) {
  const buf = textEncoder.encode(arg);
  const ptr = wasm.__wbindgen_malloc(buf.length, 1) >>> 0;
  getMemory().subarray(ptr, ptr + buf.length).set(buf);
  WASM_VECTOR_LEN = buf.length;
  return ptr;
}

// WASM imports
function createImports() {
  const imports = { wbg: {} };

  imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
    throw new Error(getStringFromWasm(arg0, arg1));
  };

  imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
    console.error(getStringFromWasm(arg0, arg1));
    wasm.__wbindgen_free(arg0, arg1, 1);
  };

  imports.wbg.__wbg_new_1ba21ce319a06297 = function() {
    return {};
  };

  imports.wbg.__wbg_new_25f239778d6112b9 = function() {
    return [];
  };

  imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
    return new Error();
  };

  imports.wbg.__wbg_now_69d776cd24f5215b = function() {
    return Date.now();
  };

  imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
    arg0[arg1] = arg2;
  };

  imports.wbg.__wbg_set_7df433eea03a5c14 = function(arg0, arg1, arg2) {
    arg0[arg1 >>> 0] = arg2;
  };

  imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
    const ret = arg1.stack;
    const ptr = passStringToWasm(ret);
    const len = WASM_VECTOR_LEN;
    const view = new DataView(wasm.memory.buffer);
    view.setInt32(arg0 + 4, len, true);
    view.setInt32(arg0, ptr, true);
  };

  imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
    return getStringFromWasm(arg0, arg1);
  };

  imports.wbg.__wbindgen_init_externref_table = function() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
  };

  return imports;
}

// Load WASM
async function initWasm() {
  if (wasmReady) return true;

  try {
    const response = await fetch('/wasm/btc_wasm_bg.wasm');
    const wasmBytes = await response.arrayBuffer();
    const imports = createImports();
    const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
    wasm = instance.exports;
    cachedMemory = null;

    // Initialize externref table
    if (wasm.__wbindgen_externrefs) {
      wasm.__wbindgen_init_externref_table?.();
    }

    // Call WASM start function
    wasm.__wbindgen_start?.();

    wasmReady = true;
    console.log('[WASM Worker] Module loaded successfully');
    return true;
  } catch (error) {
    console.error('[WASM Worker] Failed to load:', error);
    return false;
  }
}

// Generate single address using WASM
function generateSingleAddress(privateKeyHex, compressed) {
  const ptr = passStringToWasm(privateKeyHex);
  const len = WASM_VECTOR_LEN;
  const ret = wasm.generate_single_address(ptr, len, compressed);
  const result = getStringFromWasm(ret[0], ret[1]);
  wasm.__wbindgen_free(ret[0], ret[1], 1);
  return result;
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

// Continuous puzzle search - runs until stopped or found
async function runPuzzleSearch(targetAddress, rangeStartHex, rangeEndHex) {
  puzzleSearchRunning = true;
  puzzleSearchStats = { keysChecked: 0, startTime: Date.now(), found: false, result: null };

  const BATCH_SIZE = 500; // Увеличен для производительности
  const REPORT_INTERVAL = 1000; // Отправляем статистику каждую секунду
  let lastReportTime = Date.now();

  console.log('[WASM] Starting continuous puzzle search for:', targetAddress);

  while (puzzleSearchRunning && !puzzleSearchStats.found) {
    // Проверяем батч ключей
    for (let i = 0; i < BATCH_SIZE && puzzleSearchRunning; i++) {
      const randomKey = generateRandomKeyInRange(rangeStartHex, rangeEndHex);

      // Проверяем compressed адрес (большинство puzzle адресов compressed)
      const addrCompressed = generateSingleAddress(randomKey, true);

      if (addrCompressed === targetAddress) {
        const wif = await privateKeyToWIF(randomKey, true);
        puzzleSearchStats.found = true;
        puzzleSearchStats.result = {
          found: true,
          private_key_hex: randomKey,
          private_key_wif: wif,
          address_found: addrCompressed,
          keys_checked: puzzleSearchStats.keysChecked + i + 1
        };
        puzzleSearchRunning = false;

        // Отправляем результат
        self.postMessage({ puzzleResult: puzzleSearchStats.result });
        return;
      }

      // Также проверяем uncompressed
      const addrUncompressed = generateSingleAddress(randomKey, false);
      if (addrUncompressed === targetAddress) {
        const wif = await privateKeyToWIF(randomKey, false);
        puzzleSearchStats.found = true;
        puzzleSearchStats.result = {
          found: true,
          private_key_hex: randomKey,
          private_key_wif: wif,
          address_found: addrUncompressed,
          keys_checked: puzzleSearchStats.keysChecked + i + 1
        };
        puzzleSearchRunning = false;

        self.postMessage({ puzzleResult: puzzleSearchStats.result });
        return;
      }
    }

    puzzleSearchStats.keysChecked += BATCH_SIZE;

    // Отправляем статистику каждую секунду
    const now = Date.now();
    if (now - lastReportTime >= REPORT_INTERVAL) {
      const elapsed = (now - puzzleSearchStats.startTime) / 1000;
      const speed = Math.round(puzzleSearchStats.keysChecked / elapsed);

      self.postMessage({
        puzzleStats: {
          keysChecked: puzzleSearchStats.keysChecked,
          speed: speed,
          running: puzzleSearchRunning
        }
      });
      lastReportTime = now;
    }

    // Даём браузеру "вздохнуть" каждые 500 ключей (для приёма stop команд)
    await new Promise(r => setTimeout(r, 0));
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
  const { position, privateKeyHex, addressesToGenerate, requestId, puzzleSearch, puzzleStop } = e.data;

  // Stop puzzle search command
  if (puzzleStop) {
    stopPuzzleSearch();
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
    const { targetAddress, rangeStart, rangeEnd } = puzzleSearch;
    // Запускаем непрерывный поиск (не ждём результата - он придёт через postMessage)
    runPuzzleSearch(targetAddress, rangeStart, rangeEnd);
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
