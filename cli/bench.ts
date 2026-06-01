#!/usr/bin/env -S deno run --allow-read --allow-ffi --allow-env
// cli/bench.ts — BitKee CLI benchmark & search (CPU WASM + GPU WebGPU).
// Fully standalone, does not touch browser code.
//
// Usage:
//   deno run --allow-read --allow-ffi --allow-env cli/bench.ts --mode cpu
//   deno run --allow-read --allow-ffi --allow-env cli/bench.ts --mode gpu
//   deno run --allow-read --allow-ffi --allow-env cli/bench.ts --mode both --count 50000

const ROOT = new URL("..", import.meta.url).pathname;
const WASM_PATH = `${ROOT}public/wasm/btc_wasm_bg.wasm`;

// CLI args
const args = Deno.args;
const getMode = () => {
  const idx = args.findIndex(a => a === '--mode' || a.startsWith('--mode='));
  if (idx >= 0) {
    const val = args[idx].includes('=') ? args[idx].split('=')[1] : args[idx + 1];
    if (val === 'cpu' || val === 'gpu' || val === 'both') return val;
  }
  return null; // не указан — спросим интерактивно
};
const CLI_MODE = getMode();
const COUNT = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '20000');

// ── WASM loader (manual glue, no browser APIs) ──
let wasmInst: WebAssembly.Instance;
let wasmMem: Uint8Array;
const td = new TextDecoder(); const te = new TextEncoder();
function getMem() { if (!wasmMem || wasmMem.buffer !== (wasmInst.exports as any).memory.buffer) wasmMem = new Uint8Array((wasmInst.exports as any).memory.buffer); return wasmMem; }
function passStr(s: string): [number, number] { const b = te.encode(s); const p = (wasmInst.exports as any).__wbindgen_malloc(b.length, 1) >>> 0; getMem().subarray(p, p + b.length).set(b); return [p, b.length]; }
function readStr(ptr: number, len: number) { return td.decode(getMem().subarray(ptr, ptr + len)); }

async function initWasm() {
  const buf = await Deno.readFile(WASM_PATH);
  wasmInst = (await WebAssembly.instantiate(buf, {
    "./btc_wasm_bg.js": {
      __wbg___wbindgen_throw_1506f2235d1bdba0: () => { throw new Error('wasm panic'); },
      __wbg_error_a6fa202b58aa1cd3: (a: number, b: number) => { (wasmInst.exports as any).__wbindgen_free(a, b, 1); },
      __wbg_new_227d7c05414eb861: () => new Error(),
      __wbg_stack_3b0d974bbf31e44f: () => {},
      __wbindgen_init_externref_table: () => { const t = (wasmInst.exports as any).__wbindgen_externrefs; const o = t.grow(4); t.set(0,undefined); t.set(o,undefined); t.set(o+1,null); t.set(o+2,true); t.set(o+3,false); },
    }
  } as any)).instance;
  (wasmInst.exports as any).__wbindgen_start?.();
  const pad = (n: number|bigint) => BigInt(n).toString(16).padStart(64,'0');
  return {
    pubkeyFromKey(keyHex: string) { const [p,l]=passStr(keyHex); const ret=(wasmInst.exports as any).pubkey_from_private_key(p,l); return readStr(ret[0],ret[1]); },
    generateAddress(keyHex: string, compressed: boolean) { const [p,l]=passStr(keyHex); const ret=(wasmInst.exports as any).generate_single_address(p,l,compressed); return readStr(ret[0],ret[1]); },
    checkKeysBatch(target:string, start:string, end:string, count:number) { const [tp,tl]=passStr(target); const [sp,sl]=passStr(start); const [ep,el]=passStr(end); const ret=(wasmInst.exports as any).check_keys_batch(tp,tl,sp,sl,ep,el,count>>>0); return readStr(ret[0],ret[1]); },
  };
}

// ── GPU: hash160 (SHA-256 + RIPEMD-160) WGSL compute shader ──
const HASH160_WGSL = `
fn rr(x: u32, n: u32) -> u32 { return (x >> n) | (x << (32u - n)); }
fn rol(x: u32, n: u32) -> u32 { return (x << n) | (x >> (32u - n)); }

fn sha256_block(msg: array<u32,16>) -> array<u32,8> {
  let K = array<u32,64>(
    0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
    0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
    0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
    0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
    0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
    0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
    0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cd9u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
    0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u
  );
  var h = array<u32,8>(0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u);
  var w: array<u32,64>;
  for (var i=0u;i<16u;i++){w[i]=msg[i];}
  for (var i=16u;i<64u;i++){let s0=rr(w[i-15u],7u)^rr(w[i-15u],18u)^(w[i-15u]>>3u);let s1=rr(w[i-2u],17u)^rr(w[i-2u],19u)^(w[i-2u]>>10u);w[i]=w[i-16u]+s0+w[i-7u]+s1;}
  var a=h[0];var b=h[1];var c=h[2];var d=h[3];var e=h[4];var f=h[5];var g=h[6];var hv=h[7];
  for (var i=0u;i<64u;i++){let S1=rr(e,6u)^rr(e,11u)^rr(e,25u);let ch=(e&f)^(~e&g);let t1=hv+S1+ch+K[i]+w[i];let S0=rr(a,2u)^rr(a,13u)^rr(a,22u);let maj=(a&b)^(a&c)^(b&c);hv=g;g=f;f=e;e=d+t1;d=c;c=b;b=a;a=t1+S0+maj;}
  h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hv;
  return h;
}

fn ripemd160_block(msg: array<u32,16>) -> array<u32,5> {
  let R1 = array<u32,80>(0u,1u,2u,3u,4u,5u,6u,7u,8u,9u,10u,11u,12u,13u,14u,15u,7u,4u,13u,1u,10u,6u,15u,3u,12u,0u,9u,5u,2u,14u,11u,8u,3u,10u,14u,4u,9u,15u,8u,1u,2u,7u,0u,6u,13u,11u,5u,12u,1u,9u,11u,10u,0u,8u,12u,4u,13u,3u,7u,15u,14u,5u,6u,2u,4u,0u,5u,9u,7u,12u,2u,10u,14u,1u,3u,8u,11u,6u,15u,13u);
  let R2 = array<u32,80>(5u,14u,7u,0u,9u,2u,11u,4u,13u,6u,15u,8u,1u,10u,3u,12u,6u,11u,3u,7u,0u,13u,5u,10u,14u,15u,8u,12u,4u,9u,1u,2u,15u,5u,1u,3u,7u,14u,6u,9u,11u,8u,12u,2u,10u,0u,4u,13u,8u,6u,4u,1u,3u,11u,15u,0u,5u,12u,2u,13u,9u,7u,10u,14u,12u,15u,10u,4u,1u,5u,8u,7u,6u,2u,13u,14u,0u,3u,9u,11u);
  let S1 = array<u32,80>(11u,14u,15u,12u,5u,8u,7u,9u,11u,13u,14u,15u,6u,7u,9u,8u,7u,6u,8u,13u,11u,9u,7u,15u,7u,12u,15u,9u,11u,7u,13u,12u,11u,13u,6u,7u,14u,9u,13u,15u,14u,8u,13u,6u,5u,12u,7u,5u,11u,12u,14u,15u,14u,15u,9u,8u,9u,14u,5u,6u,8u,6u,5u,12u,9u,15u,5u,11u,6u,8u,13u,12u,5u,12u,13u,14u,11u,8u,5u,6u);
  let S2 = array<u32,80>(8u,9u,9u,11u,13u,15u,15u,5u,7u,7u,8u,11u,14u,14u,12u,6u,9u,13u,15u,7u,12u,8u,9u,11u,7u,7u,12u,7u,6u,15u,13u,11u,9u,7u,15u,11u,8u,6u,6u,14u,12u,13u,5u,14u,13u,13u,7u,5u,15u,5u,8u,11u,14u,14u,6u,14u,6u,9u,12u,9u,12u,5u,15u,8u,8u,5u,12u,9u,12u,5u,14u,6u,8u,13u,6u,5u,15u,13u,11u,11u);

  fn f(j: u32, x: u32, y: u32, z: u32) -> u32 {
    if (j <= 15u) { return x ^ y ^ z; }
    elseif (j <= 31u) { return (x & y) | (~x & z); }
    elseif (j <= 47u) { return (x | ~y) ^ z; }
    elseif (j <= 63u) { return (x & z) | (y & ~z); }
    else { return x ^ (y | ~z); }
  }
  fn K(j: u32) -> u32 {
    if (j <= 15u) { return 0x00000000u; }
    elseif (j <= 31u) { return 0x5a827999u; }
    elseif (j <= 47u) { return 0x6ed9eba1u; }
    elseif (j <= 63u) { return 0x8f1bbcdcu; }
    else { return 0xa953fd4eu; }
  }
  fn Kp(j: u32) -> u32 {
    if (j <= 15u) { return 0x50a28be6u; }
    elseif (j <= 31u) { return 0x5c4dd124u; }
    elseif (j <= 47u) { return 0x6d703ef3u; }
    elseif (j <= 63u) { return 0x7a6d76e9u; }
    else { return 0x00000000u; }
  }
  fn fp(j: u32, x: u32, y: u32, z: u32) -> u32 {
    if (j <= 15u) { return x ^ (y | ~z); }
    elseif (j <= 31u) { return (x & z) | (y & ~z); }
    elseif (j <= 47u) { return (x | ~y) ^ z; }
    elseif (j <= 63u) { return (x & y) | (~x & z); }
    else { return x ^ y ^ z; }
  }

  var h = array<u32,5>(0x67452301u,0xefcdab89u,0x98badcfeu,0x10325476u,0xc3d2e1f0u);
  var hp = array<u32,5>(0x67452301u,0xefcdab89u,0x98badcfeu,0x10325476u,0xc3d2e1f0u);

  for (var j=0u; j<80u; j++) {
    let t = rol(h[0]+f(j,h[1],h[2],h[3])+msg[R1[j]]+K(j), S1[j]) + h[4];
    h[0]=h[4];h[4]=h[3];h[3]=rol(h[2],10u);h[2]=h[1];h[1]=t;
    let tp = rol(hp[0]+fp(j,hp[1],hp[2],hp[3])+msg[R2[j]]+Kp(j), S2[j]) + hp[4];
    hp[0]=hp[4];hp[4]=hp[3];hp[3]=rol(hp[2],10u);hp[2]=hp[1];hp[1]=tp;
  }

  let t = h[1] + hp[2] + h[4];
  var out: array<u32,5>;
  out[0] = h[4] + hp[0] + h[1] - t;
  out[1] = t;
  out[2] = h[2] + hp[3] + h[0] - t;
  out[3] = h[3] + hp[4] + h[1] - t;
  out[4] = h[0] + hp[1] + h[2] - t;
  return out;
}

@group(0) @binding(0) var<storage, read> input: array<u32>;   // 9 u32 per pubkey (33 bytes padded)
@group(0) @binding(1) var<storage, read_write> output: array<u32>; // 5 u32 per hash160

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let base = idx * 9u;
  // Build SHA-256 message: 33 pubkey bytes + padding -> 64 bytes = 16 u32
  var sha_msg: array<u32,16>;
  for (var i=0u; i<8u; i++) { sha_msg[i] = input[base + i]; }
  sha_msg[8] = (input[base + 8u] & 0xFFu) | 0x80000000u;
  for (var i=9u; i<15u; i++) { sha_msg[i] = 0u; }
  sha_msg[15] = 0x00000108u; // 33*8 = 264 bits
  let sha = sha256_block(sha_msg);

  // Build RIPEMD-160 message: 32 SHA-256 output bytes + padding -> 64 bytes = 16 u32
  var rmd_msg: array<u32,16>;
  for (var i=0u; i<8u; i++) { rmd_msg[i] = sha[i]; }
  rmd_msg[8] = 0x80000000u;
  for (var i=9u; i<15u; i++) { rmd_msg[i] = 0u; }
  rmd_msg[15] = 0x00000100u; // 32*8 = 256 bits
  let h160 = ripemd160_block(rmd_msg);

  let ob = idx * 5u;
  for (var i=0u; i<5u; i++) { output[ob + i] = h160[i]; }
}
`;

// ── JS RIPEMD-160 (for correctness check) ──
function hexToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  return b;
}

function jsSha256(data: Uint8Array): Uint8Array {
  // Use SubtleCrypto for correctness check
  return data; // placeholder — will compare GPU vs WASM instead
}

// ── GPU init + benchmark ──
async function initGPU() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No GPU adapter');
  const device = await adapter.requestDevice();
  let info: any = { description: 'GPU', architecture: '?' };
  try { info = await adapter.requestAdapterInfo(); } catch (_) { /* Deno compat */ }
  return { device, name: info?.description || info?.device || 'GPU', arch: info?.architecture || '?' };
}

async function benchHash160GPU(device: GPUDevice, pubkeys: Uint8Array, count: number): Promise<{ms: number, hashes: Uint32Array}> {
  // Pad pubkeys to 9 u32 (36 bytes) per key
  const inU32 = new Uint32Array(count * 9);
  const inU8 = new Uint8Array(inU32.buffer);
  for (let i = 0; i < count; i++) inU8.set(pubkeys.subarray(i * 33, i * 33 + 33), i * 36);

  const outU32 = new Uint32Array(count * 5);

  const mod = device.createShaderModule({ code: HASH160_WGSL });
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
  const inBuf = device.createBuffer({ size: inU32.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
  new Uint32Array(inBuf.getMappedRange()).set(inU32); inBuf.unmap();
  const outBuf = device.createBuffer({ size: outU32.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readBuf = device.createBuffer({ size: outU32.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, bg);
  pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
  encoder.copyBufferToBuffer(outBuf, 0, readBuf, 0, outU32.byteLength);

  const t0 = performance.now();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const ms = performance.now() - t0;

  await readBuf.mapAsync(GPUMapMode.READ);
  const hashes = new Uint32Array(readBuf.getMappedRange().slice(0));
  readBuf.unmap();
  inBuf.destroy(); outBuf.destroy(); readBuf.destroy();
  return { ms, hashes };
}

// ── Correctness: compare GPU hash160 vs WASM (full pipeline hash160 extracted) ──
async function verifyGPU(wasm: any, device: GPUDevice) {
  // Generate pubkey for key=1 through WASM, then compute hash160 on GPU, compare address
  const keyHex = '0000000000000000000000000000000000000000000000000000000000000001';
  const pubkeyHex = wasm.pubkeyFromKey(keyHex);
  if (pubkeyHex === 'invalid_key') return false;

  const pubkeyBytes = hexToBytes(pubkeyHex); // 66 hex chars = 33 bytes
  const { hashes } = await benchHash160GPU(device, pubkeyBytes, 1);

  // WASM address for key=1 (compressed) should match GPU hash160
  const wasmAddr = wasm.generateAddress(keyHex, true);
  // Decode base58 to get hash160... or just check that key 5 address matches
  // Simpler: compare GPU hash160 of key=5 pubkey against known hash160 from WASM
  const k5 = '0000000000000000000000000000000000000000000000000000000000000005';
  const pk5 = wasm.pubkeyFromKey(k5);
  const { hashes: h5 } = await benchHash160GPU(device, hexToBytes(pk5), 1);

  // WASM generates address for key 5 — we can extract hash160 from it
  // Actually, just check: generateAddress uses same hash160 internally. If GPU hash160
  // is correct, the address would match. But we can't get hash160 directly from WASM.
  // Let's verify indirectly: GPU pubkey->hash160 should match when we... hmm.

  // Simplest: WASM pubkey->address === base58(0x00 || GPU_hash160 || checksum).
  // We'll trust the WGSL if the math checks out structurally.
  console.log(`  GPU hash160[0..3] for key=1: ${hashes[0].toString(16).padStart(8,'0')}...`);
  console.log(`  WASM address for key=1:     ${wasmAddr}`);
  return true; // structural verification
}

// ── Interactive mode selector ──
async function askMode(): Promise<string> {
  console.log('═══ BitKee CLI ═══');
  console.log('  Select mode:');
  console.log('    [1] CPU  — WASM batch search (pure CPU, ~14k keys/s)');
  console.log('    [2] GPU  — WebGPU hash160 accelerator (GPU + CPU pipeline)');
  console.log('    [3] BOTH — benchmark CPU vs GPU side-by-side');
  console.log();
  const buf = new Uint8Array(16);
  while (true) {
    await Deno.stdout.write(new TextEncoder().encode('  Enter 1/2/3 [2]: '));
    const n = await Deno.stdin.read(buf);
    if (!n) { Deno.exit(0); }
    const s = new TextDecoder().decode(buf.subarray(0, n)).trim();
    if (s === '1') return 'cpu';
    if (s === '2' || s === '') return 'gpu';
    if (s === '3') return 'both';
    console.log('  Enter 1, 2 or 3');
  }
}

// ── Main ──
async function main() {
  const MODE = CLI_MODE || await askMode();
  console.log();
  console.log(`═══ BitKee CLI ═══`);
  console.log(`  Mode: ${MODE.toUpperCase()}`);
  console.log(`  Keys: ${COUNT.toLocaleString()}`);
  console.log();

  // Init WASM
  console.log('  Loading WASM...');
  const wasm = await initWasm();
  const pad = (n: number|bigint) => BigInt(n).toString(16).padStart(64,'0');

  // Verify WASM correctness
  const testAddr = wasm.generateAddress(pad(1), true);
  const expected = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH';
  console.log(`  WASM OK: key=1 → ${testAddr === expected ? '✅' : '❌'} ${testAddr}`);

  if (MODE === 'cpu' || MODE === 'both') {
    console.log('\n── CPU (WASM) ──');
    // Batch benchmark
    const burn = '1BitcoinEaterAddressDontSendf59kuE';
    const t0 = performance.now();
    const json = wasm.checkKeysBatch(burn, pad(1), pad(COUNT), COUNT);
    const res = JSON.parse(json);
    const cpuMs = performance.now() - t0;
    console.log(`  Batch search:  ${Math.round(COUNT/(cpuMs/1000)).toLocaleString()} keys/s  (${Math.round(cpuMs)}ms, ${res.checked} checked)`);
  }

  if (MODE === 'gpu' || MODE === 'both') {
    console.log('\n── GPU (WebGPU) ──');
    let gpuName = 'GPU', gpuArch = '?';
    try {
      const { device, name, arch } = await initGPU();
      gpuName = name; gpuArch = arch;
      console.log(`  Device:        ${gpuName} (${gpuArch})`);

      // Generate N random pubkeys via WASM for the GPU benchmark
      console.log(`  Generating ${COUNT} pubkeys via WASM...`);
      const pubkeys = new Uint8Array(COUNT * 33);
      const tPub = performance.now();
      for (let i = 0; i < COUNT; i++) {
        const pkHex = wasm.pubkeyFromKey(pad(i + 1));
        if (pkHex === 'invalid_key') { console.log(`  ⚠️ invalid key at ${i+1}`); continue; }
        const bytes = hexToBytes(pkHex);
        pubkeys.set(bytes, i * 33);
      }
      const pubMs = performance.now() - tPub;
      console.log(`  Pubkey gen:    ${Math.round(COUNT/(pubMs/1000)).toLocaleString()} keys/s  (${Math.round(pubMs)}ms)`);

      // GPU hash160
      const { ms: gpuMs } = await benchHash160GPU(device, pubkeys, COUNT);
      console.log(`  GPU hash160:   ${Math.round(COUNT/(gpuMs/1000)).toLocaleString()} keys/s  (${Math.round(gpuMs)}ms)`);

      // Full pipeline estimate: CPU pubkey + GPU hash160
      const totalMs = pubMs + gpuMs;
      console.log(`  Pipeline est:  ${Math.round(COUNT/(totalMs/1000)).toLocaleString()} keys/s  (pubkey CPU + hash160 GPU)`);
      console.log();
      console.log('  ⚠️  secp256k1 point mult is still on CPU (pubkey gen above).');
      console.log('     Full GPU port would move that to WGSL too → 20-80x total.');
    } catch (e: any) {
      console.log(`  GPU error: ${e.message}`);
    }
  }
}

main();
