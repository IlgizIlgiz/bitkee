// gpu_worker.js — Experimental WebGPU benchmark.
// Measures GPU compute throughput vs CPU/WASM on SHA-256 (the heavy part of hash160).
// Does NOT modify existing code — opt-in experiment, run from browser console:
//   const w = new Worker('/wasm/gpu_worker.js');
//   w.onmessage = e => console.log('RESULT', e.data);
//   w.postMessage({ cmd:'bench', count:20000 });

let device = null;

async function initGPU() {
  if (device) return true;
  try {
    const adapter = await self.navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No adapter');
    device = await adapter.requestDevice();
    const info = await adapter.requestAdapterInfo();
    console.log('[GPU]', info.description || info.device || 'GPU', '| arch:', info.architecture || '?');
    return true;
  } catch (e) {
    console.error('[GPU] init failed:', e.message || e);
    return false;
  }
}

// ── WGSL: SHA-256 on 33-byte pubkeys (single 64-byte block each) ──
// Каждый workgroup item обрабатывает ОДИН публичный ключ (33 байта).
// Вход: 9 u32 на ключ (36 байт, последние 3 байта не используются)
// Выход: 8 u32 = SHA-256 хеш (32 байта)
const SHA256_WGSL = /* wgsl */ `
fn rr(x: u32, n: u32) -> u32 { return (x >> n) | (x << (32u - n)); }

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let base = idx * 9u;

  // Build 64-byte message block: 33 pubkey bytes + padding
  var msg: array<u32,16>;
  for (var i = 0u; i < 8u; i++) { msg[i] = input[base + i]; }
  msg[8] = (input[base + 8u] & 0xFFu) | 0x80000000u;
  for (var i = 9u; i < 15u; i++) { msg[i] = 0u; }
  msg[15] = 0x00000108u; // 33*8 = 264 bits, big-endian

  // SHA-256 constants
  let K = array<u32,64>(
    0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,
    0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
    0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,
    0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
    0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,
    0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
    0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,
    0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
    0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,
    0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
    0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,
    0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
    0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,
    0x391c0cd9u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
    0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,
    0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u
  );

  // Init hash state
  var h: array<u32,8>;
  h[0] = 0x6a09e667u; h[1] = 0xbb67ae85u; h[2] = 0x3c6ef372u; h[3] = 0xa54ff53au;
  h[4] = 0x510e527fu; h[5] = 0x9b05688cu; h[6] = 0x1f83d9abu; h[7] = 0x5be0cd19u;

  // W[0..15] = msg
  var w: array<u32,64>;
  for (var i = 0u; i < 16u; i++) { w[i] = msg[i]; }
  for (var i = 16u; i < 64u; i++) {
    let s0 = rr(w[i-15u],7u) ^ rr(w[i-15u],18u) ^ (w[i-15u] >> 3u);
    let s1 = rr(w[i-2u],17u) ^ rr(w[i-2u],19u) ^ (w[i-2u] >> 10u);
    w[i] = w[i-16u] + s0 + w[i-7u] + s1;
  }

  var a = h[0]; var b = h[1]; var c = h[2]; var d = h[3];
  var e = h[4]; var f = h[5]; var g = h[6]; var H = h[7];

  for (var i = 0u; i < 64u; i++) {
    let S1 = rr(e,6u) ^ rr(e,11u) ^ rr(e,25u);
    let ch = (e & f) ^ (~e & g);
    let t1 = H + S1 + ch + K[i] + w[i];
    let S0 = rr(a,2u) ^ rr(a,13u) ^ rr(a,22u);
    let maj = (a & b) ^ (a & c) ^ (b & c);
    H = g; g = f; f = e; e = d + t1;
    d = c; c = b; b = a; a = t1 + (S0 + maj);
  }

  h[0] += a; h[1] += b; h[2] += c; h[3] += d;
  h[4] += e; h[5] += f; h[6] += g; h[7] += H;

  let out_base = idx * 8u;
  for (var i = 0u; i < 8u; i++) { output[out_base + i] = h[i]; }
}
`;

// ── SHA-256 on CPU (чистый JS, для сравнения) ──
function sha256_js(data) {
  // data = Uint8Array(33) — compressed pubkey
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cd9,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  // Build message block: 33 bytes + padding → 64 bytes = 16 u32
  const msg = new Uint32Array(16);
  const mv = new DataView(msg.buffer);
  for (let i = 0; i < 33; i++) mv.setUint8(i, data[i]);
  mv.setUint8(33, 0x80); // padding
  mv.setUint32(60, 0x00000108, false); // 264 bits big-endian → little-endian in DataView?
  // Actually DataView.setUint32 with false = big-endian. But SHA-256 expects big-endian u32.
  // The msg array is built via DataView big-endian → u32 are correct.
  // Re-init message correctly:
  const M = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    M[i] = mv.getUint32(i * 4, false); // big-endian read
  }

  let h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let i = 0; i < 16; i++) w[i] = M[i];
  for (let i = 16; i < 64; i++) {
    const s0 = rr(w[i-15],7) ^ rr(w[i-15],18) ^ (w[i-15] >>> 3);
    const s1 = rr(w[i-2],17) ^ rr(w[i-2],19) ^ (w[i-2] >>> 10);
    w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
  }
  let a = h[0], b = h[1], cc = h[2], d = h[3], e = h[4], f = h[5], g = h[6], H = h[7];
  for (let i = 0; i < 64; i++) {
    const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (H + S1 + ch + K[i] + w[i]) >>> 0;
    const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
    const maj = (a & b) ^ (a & cc) ^ (b & cc);
    H = g; g = f; f = e; e = (d + t1) >>> 0;
    d = cc; cc = b; b = a; a = (t1 + S0 + maj) >>> 0;
  }
  h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + cc) >>> 0; h[3] = (h[3] + d) >>> 0;
  h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + H) >>> 0;
  return h;
}

// ── Benchmark ──
self.onmessage = async function (e) {
  const { cmd, count } = e.data;
  if (cmd !== 'bench') return;

  const N = Math.min(count || 10000, 100000);

  // ── GPU init ──
  if (!(await initGPU())) {
    self.postMessage({ error: 'WebGPU not available in this browser' });
    return;
  }

  const adapter = await self.navigator.gpu.requestAdapter();
  const info = await adapter.requestAdapterInfo();
  const gpuName = info.description || info.device || 'GPU';

  // ── Prepare test data: N random 33-byte "pubkeys" ──
  const pubkeys = new Uint8Array(N * 33);
  crypto.getRandomValues(pubkeys);
  const inU32 = new Uint32Array(N * 9);
  const inU8 = new Uint8Array(inU32.buffer);
  for (let i = 0; i < N; i++) {
    inU8.set(pubkeys.subarray(i * 33, i * 33 + 33), i * 36);
    inU8[i * 36] = (inU8[i * 36] & 0x01) ? 0x03 : 0x02; // valid prefix
  }

  // ── GPU benchmark ──
  const outU32 = new Uint32Array(N * 8);
  const mod = device.createShaderModule({ code: SHA256_WGSL });
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });

  const inBuf = device.createBuffer({ size: inU32.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
  new Uint32Array(inBuf.getMappedRange()).set(inU32);
  inBuf.unmap();

  const outBuf = device.createBuffer({ size: outU32.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readBuf = device.createBuffer({ size: outU32.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

  const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bg);
  pass.dispatchWorkgroups(Math.ceil(N / 64));
  pass.end();
  encoder.copyBufferToBuffer(outBuf, 0, readBuf, 0, outU32.byteLength);

  const tGpu0 = performance.now();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const gpuMs = performance.now() - tGpu0;

  // Verify: read back and check a few hashes against JS SHA-256
  await readBuf.mapAsync(GPUMapMode.READ);
  const gpuOut = new Uint32Array(readBuf.getMappedRange().slice(0));
  readBuf.unmap();

  let correct = true;
  for (let i = 0; i < Math.min(N, 5); i++) {
    const jsHash = sha256_js(pubkeys.subarray(i * 33, i * 33 + 33));
    let match = true;
    for (let j = 0; j < 8; j++) {
      if (gpuOut[i * 8 + j] !== jsHash[j]) { match = false; break; }
    }
    if (!match) { correct = false; break; }
  }

  // Cleanup GPU buffers
  inBuf.destroy(); outBuf.destroy(); readBuf.destroy();

  // ── CPU/JS benchmark ──
  const tCpu0 = performance.now();
  for (let i = 0; i < N; i++) {
    sha256_js(pubkeys.subarray(i * 33, i * 33 + 33));
  }
  const cpuMs = performance.now() - tCpu0;

  // ── WASM (btc_wasm) benchmark: key → full address ──
  // (для сравнения с реальным пазл-поиском)
  importScripts('/wasm/btc_wasm.js');
  await wasm_bindgen({ module_or_path: '/wasm/btc_wasm_bg.wasm' });
  const pad = (n) => n.toString(16).padStart(64, '0');
  const tWasm0 = performance.now();
  for (let i = 0; i < N; i++) {
    wasm_bindgen.generate_single_address(pad(i + 1), true);
  }
  const wasmMs = performance.now() - tWasm0;

  // ── WASM batch benchmark (check_keys_batch) ──
  const startHex = (1n).toString(16).padStart(64, '0');
  const endHex = (BigInt(N)).toString(16).padStart(64, '0');
  const tBatch0 = performance.now();
  JSON.parse(wasm_bindgen.check_keys_batch('1BitcoinEaterAddressDontSendf59kuE', startHex, endHex, N));
  const batchMs = performance.now() - tBatch0;

  self.postMessage({
    gpuName,
    count: N,
    correctness: correct,
    gpu: { ms: Math.round(gpuMs), keysPerSec: Math.round(N / (gpuMs / 1000)), what: 'SHA-256 only (hash160 step1)' },
    cpuJS: { ms: Math.round(cpuMs), keysPerSec: Math.round(N / (cpuMs / 1000)), what: 'SHA-256 JS (single-thread)' },
    wasmFull: { ms: Math.round(wasmMs), keysPerSec: Math.round(N / (wasmMs / 1000)), what: 'key→address WASM (secp256k1+hash160+base58)' },
    wasmBatch: { ms: Math.round(batchMs), keysPerSec: Math.round(N / (batchMs / 1000)), what: 'WASM batch (check_keys_batch)' },
    interpretation: `GPU SHA-256 vs JS SHA-256: ${(cpuMs / gpuMs).toFixed(1)}x. GPU hash160-only est. keys/s (2x SHA-256): ${Math.round(N / (gpuMs * 2 / 1000))}. WASM batch (current): ${Math.round(N / (batchMs / 1000))} keys/s. GPU would help most if secp256k1 also moves to GPU (currently ~90% of time).`
  });
};

self.navigator?.gpu
  ? console.log('[GPU Worker] WebGPU supported. Ready.')
  : console.warn('[GPU Worker] WebGPU NOT supported in this browser.');
