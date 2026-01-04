// workerFactory.js - Creates address generation worker with WASM support

let wasmSupported = null;

// Check if WASM worker is available and working
async function checkWasmSupport() {
  if (wasmSupported !== null) return wasmSupported;

  try {
    // Test WASM instantiation
    const response = await fetch('/wasm/btc_wasm_bg.wasm');
    if (!response.ok) {
      wasmSupported = false;
      return false;
    }

    // Basic WebAssembly support check
    if (typeof WebAssembly !== 'object') {
      wasmSupported = false;
      return false;
    }

    wasmSupported = true;
    return true;
  } catch (error) {
    console.warn('WASM not supported:', error);
    wasmSupported = false;
    return false;
  }
}

// Create the appropriate worker
export async function createAddressWorker() {
  const useWasm = await checkWasmSupport();

  if (useWasm) {
    console.log('[WorkerFactory] Using WASM worker');
    // WASM worker is a plain script, not a module
    return new Worker('/wasm/wasmWorker.js');
  } else {
    console.log('[WorkerFactory] Using JS worker (fallback)');
    return new Worker(new URL('../addressWorker.js', import.meta.url), { type: 'module' });
  }
}

// Force create JS worker (for comparison/fallback)
export function createJSWorker() {
  return new Worker(new URL('../addressWorker.js', import.meta.url), { type: 'module' });
}

// Force create WASM worker (for testing)
export function createWasmWorker() {
  return new Worker('/wasm/wasmWorker.js');
}

export { checkWasmSupport };
