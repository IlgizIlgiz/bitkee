# Сборка WASM-модуля `btc_wasm`

Бинарь `public/wasm/btc_wasm_bg.wasm` собирается из этого крейта вручную и коммитится в репозиторий.
Здесь — воспроизводимые команды сборки.

## Требования (однократно)

```bash
# 1. Rust toolchain (rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
source "$HOME/.cargo/env"

# 2. WASM-таргет
rustup target add wasm32-unknown-unknown

# 3. wasm-bindgen-cli — ВЕРСИЯ ДОЛЖНА ТОЧНО СОВПАДАТЬ с crate `wasm-bindgen` в Cargo.lock!
#    Узнать версию: grep -A1 'name = "wasm-bindgen"' Cargo.lock
cargo install wasm-bindgen-cli --version 0.2.122
```

Текущая зафиксированная версия: **wasm-bindgen 0.2.122** (Rust 1.96.0).
При обновлении crate `wasm-bindgen` обязательно переустановить CLI той же версии.

## Сборка

```bash
source "$HOME/.cargo/env"
cd wasm/btc_wasm

# 1. Скомпилировать в wasm32 (release: opt-level=3 + lto)
cargo build --release --target wasm32-unknown-unknown

# 2. Прогнать wasm-bindgen. Воркер грузит wasm как обычный скрипт (не ESM),
#    поэтому используем --target no-modules.
wasm-bindgen target/wasm32-unknown-unknown/release/btc_wasm.wasm \
    --out-dir /tmp/btc_wasm_out --target no-modules

# 3. Скопировать бинарь в public/
cp /tmp/btc_wasm_out/btc_wasm_bg.wasm ../../public/wasm/btc_wasm_bg.wasm
# (опц.) обновить референс-glue:
cp /tmp/btc_wasm_out/btc_wasm.js     ../../public/wasm/btc_wasm.js
```

## Тесты

```bash
source "$HOME/.cargo/env"
cd wasm/btc_wasm
cargo test            # нативные тесты (на хосте, без wasm)
```

## Архитектура загрузки (важно)

`public/wasm/wasmWorker.js` использует СВОЙ минимальный ручной glue (`createImports()`,
`passStringToWasm`, `getStringFromWasm`), а НЕ сгенерированный `btc_wasm.js`. Поэтому:

- Функции экспортируются как `String -> String` (см. `generate_single_address`, `check_keys_batch`),
  чтобы ручной glue оставался простым.
- После пересборки сверять имена импортов нового бинаря с `createImports()` в воркере
  (имена с хеш-суффиксами могут меняться между версиями wasm-bindgen).
- Сгенерированный `btc_wasm.js` держим как РЕФЕРЕНС ABI (и как План Б: при необходимости можно
  перейти на него через `importScripts`).
