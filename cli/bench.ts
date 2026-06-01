#!/usr/bin/env -S deno run --allow-read --allow-ffi --allow-env
// cli/bench.ts — CLI puzzle search benchmark (CPU WASM + GPU WebGPU).
// Fully standalone, does not touch browser code.
//
// Usage:
//   deno run --allow-read --allow-ffi --allow-env cli/bench.ts
//   deno run --allow-read --allow-ffi --allow-env cli/bench.ts --count 50000 --cpu-only
//   deno run --allow-read --allow-ffi --allow-env cli/bench.ts --gpu-only

const ROOT = new URL("..", import.meta.url).pathname;
const WASM_PATH = `${ROOT}public/wasm/btc_wasm_bg.wasm`;

// ── CLI args ──
const args = Deno.args;
const COUNT = parseInt(args.find((a: string) => a.startsWith('--count='))?.split('=')[1] || '20000');
const GPU_ONLY = args.includes('--gpu-only');
const CPU_ONLY = args.includes('--cpu-only');

// ── Load WASM via manual glue (minimal, no browser APIs needed) ──
let wasmInst: WebAssembly.Instance;
let wasmMem: Uint8Array;
const td = new TextDecoder();
const te = new TextEncoder();

function getMem() {
  if (!wasmMem || wasmMem.buffer !== (wasmInst.exports as any).memory.buffer) {
    wasmMem = new Uint8Array((wasmInst.exports as any).memory.buffer);
  }
  return wasmMem;
}
function passStr(s: string): [number, number] {
  const buf = te.encode(s);
  const ptr = (wasmInst.exports as any).__wbindgen_malloc(buf.length, 1) >>> 0;
  getMem().subarray(ptr, ptr + buf.length).set(buf);
  return [ptr, buf.length];
}
function readStr(ptr: number, len: number) {
  return td.decode(getMem().subarray(ptr, ptr + len));
}

async function initWasm() {
  const buf = await Deno.readFile(WASM_PATH);
  const imports = {
    "./btc_wasm_bg.js": {
      __wbg___wbindgen_throw_1506f2235d1bdba0: (_a: number, _b: number) => { throw new Error('wasm panic'); },
      __wbg_error_a6fa202b58aa1cd3: (a: number, b: number) => {
        console.error('wasm:', readStr(a, b));
        (wasmInst.exports as any).__wbindgen_free(a, b, 1);
      },
      __wbg_new_227d7c05414eb861: () => new Error(),
      __wbg_stack_3b0d974bbf31e44f: (_arg0: number, _arg1: number) => { /* minimal stub */ },
      __wbindgen_init_externref_table: () => {
        const table = (wasmInst.exports as any).__wbindgen_externrefs;
        const off = table.grow(4);
        table.set(0, undefined); table.set(off, undefined);
        table.set(off+1, null); table.set(off+2, true); table.set(off+3, false);
      },
    }
  };
  wasmInst = (await WebAssembly.instantiate(buf, imports as any)).instance;
  (wasmInst.exports as any).__wbindgen_start?.();

  return {
    generate_single_address(keyHex: string, compressed: boolean) {
      const [p, l] = passStr(keyHex);
      const ret = (wasmInst.exports as any).generate_single_address(p, l, compressed);
      const s = readStr(ret[0], ret[1]);
      return s;
    },
    check_keys_batch(target: string, start: string, end: string, count: number) {
      const [tp, tl] = passStr(target);
      const [sp, sl] = passStr(start);
      const [ep, el] = passStr(end);
      const ret = (wasmInst.exports as any).check_keys_batch(tp, tl, sp, sl, ep, el, count >>> 0);
      return readStr(ret[0], ret[1]);
    }
  };
}

// ── WASM CPU benchmark ──
async function benchCpu(wb: any, count: number) {
  const pad = (n: number | bigint) => BigInt(n).toString(16).padStart(64, '0');
  const startHex = pad(1);
  const endHex = pad(count);

  // per-key
  const tPerKey = performance.now();
  for (let i = 0; i < count; i++) {
    wb.generate_single_address(pad(i + 1), true);
  }
  const perKeyMs = performance.now() - tPerKey;

  // batch
  const burn = '1BitcoinEaterAddressDontSendf59kuE';
  const tBatch = performance.now();
  const json = wb.check_keys_batch(burn, startHex, endHex, count);
  const res = JSON.parse(json);
  const batchMs = performance.now() - tBatch;

  return {
    perKey: { ms: Math.round(perKeyMs), keysPerSec: Math.round(count / (perKeyMs / 1000)) },
    batch: { ms: Math.round(batchMs), keysPerSec: Math.round(count / (batchMs / 1000)), checked: res.checked }
  };
}

// ── GPU WebGPU benchmark ──
async function benchGpu(count: number) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { error: 'No GPU adapter' };
  const device = await adapter.requestDevice();
  let info: any = { description: 'GPU', architecture: '?' };
  try { info = await adapter.requestAdapterInfo(); } catch(_) { /* Deno may not have this yet */ }

  const shader = device.createShaderModule({ code: /* wgsl */ `
    fn rr(x: u32, n: u32) -> u32 { return (x >> n) | (x << (32u - n)); }
    @group(0) @binding(0) var<storage, read> input: array<u32>;
    @group(0) @binding(1) var<storage, read_write> output: array<u32>;
    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let idx = gid.x; let base = idx * 9u;
      var msg: array<u32,16>;
      for (var i = 0u; i < 8u; i++) { msg[i] = input[base + i]; }
      msg[8] = (input[base + 8u] & 0xFFu) | 0x80000000u;
      for (var i = 9u; i < 15u; i++) { msg[i] = 0u; }
      msg[15] = 0x00000108u;
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
      for (var i = 0u; i < 16u; i++) { w[i] = msg[i]; }
      for (var i = 16u; i < 64u; i++) {
        let s0 = rr(w[i-15u],7u) ^ rr(w[i-15u],18u) ^ (w[i-15u] >> 3u);
        let s1 = rr(w[i-2u],17u) ^ rr(w[i-2u],19u) ^ (w[i-2u] >> 10u);
        w[i] = w[i-16u] + s0 + w[i-7u] + s1;
      }
      var a=h[0]; var b=h[1]; var c=h[2]; var d=h[3]; var e2=h[4]; var f=h[5]; var g=h[6]; var Hv=h[7];
      for (var i = 0u; i < 64u; i++) {
        let S1 = rr(e2,6u) ^ rr(e2,11u) ^ rr(e2,25u);
        let ch = (e2 & f) ^ (~e2 & g);
        let t1 = Hv + S1 + ch + K[i] + w[i];
        let S0 = rr(a,2u) ^ rr(a,13u) ^ rr(a,22u);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        Hv=g; g=f; f=e2; e2=d+t1; d=c; c=b; b=a; a=t1+S0+maj;
      }
      h[0]+=a; h[1]+=b; h[2]+=c; h[3]+=d; h[4]+=e2; h[5]+=f; h[6]+=g; h[7]+=Hv;
      let ob = idx * 8u;
      for (var i = 0u; i < 8u; i++) { output[ob + i] = h[i]; }
    }
  `});

  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: shader, entryPoint: 'main' } });
  const inU32 = new Uint32Array(count * 9);
  for (let i = 0; i < count * 9; i++) inU32[i] = (i * 2654435761 + 1) >>> 0;
  const outU32 = new Uint32Array(count * 8);

  const inBuf = device.createBuffer({ size: inU32.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
  new Uint32Array(inBuf.getMappedRange()).set(inU32);
  inBuf.unmap();
  const outBuf = device.createBuffer({ size: outU32.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readBuf = device.createBuffer({ size: outU32.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

  const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }
  ]});

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bg);
  pass.dispatchWorkgroups(Math.ceil(count / 64));
  pass.end();
  encoder.copyBufferToBuffer(outBuf, 0, readBuf, 0, outU32.byteLength);

  const t0 = performance.now();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const gpuMs = performance.now() - t0;

  await readBuf.mapAsync(GPUMapMode.READ);
  readBuf.getMappedRange();
  readBuf.unmap();
  inBuf.destroy(); outBuf.destroy(); readBuf.destroy();

  return {
    name: info?.description || info?.device || 'GPU',
    arch: info?.architecture || '?',
    count, ms: Math.round(gpuMs),
    keysPerSec: Math.round(count / (gpuMs / 1000)),
    note: 'SHA-256 only. Full GPU port needs secp256k1 scalar mult in WGSL.'
  };
}

// ── Main ──
async function main() {
  console.log('═══ BitKee CLI Benchmark ═══');
  console.log(`  Keys: ${COUNT.toLocaleString()}`);
  console.log();

  if (!GPU_ONLY) {
    console.log('── CPU (WASM) ──');
    console.log('  Loading WASM...');
    const wb = await initWasm();
    const cpu = await benchCpu(wb, COUNT);
    console.log(`  Per-key (old):  ${cpu.perKey.keysPerSec.toLocaleString()} keys/s  (${cpu.perKey.ms}ms)`);
    console.log(`  Batch  (new):   ${cpu.batch.keysPerSec.toLocaleString()} keys/s  (${cpu.batch.ms}ms, checked ${cpu.batch.checked})`);
    console.log();
  }

  if (!CPU_ONLY) {
    console.log('── GPU (WebGPU) ──');
    try {
      const gpu = await benchGpu(COUNT);
      if ((gpu as any).error) { console.log(`  ${(gpu as any).error}`); }
      else {
        console.log(`  Device:      ${gpu.name} (${gpu.arch})`);
        console.log(`  SHA-256:     ${gpu.keysPerSec.toLocaleString()} keys/s  (${gpu.ms}ms)`);
        console.log(`  ${gpu.note}`);
      }
    } catch (e: any) { console.log(`  Error: ${e.message}`); }
    console.log();
  }

  console.log('── Notes ──');
  console.log('  GPU test = SHA-256 only (~10% of full key→address pipeline).');
  console.log('  Real GPU boost needs secp256k1 scalar×point in WGSL.');
  console.log('  For Ubuntu+Radeon: run same script — WebGPU uses Vulkan backend.');
}

main();
