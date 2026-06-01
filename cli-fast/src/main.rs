mod ec;
mod puzzles;

use num_bigint::BigUint;
use num_traits::{Num, Zero};
use rand::Rng;
use ripemd::Ripemd160;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

// Размер батча = размер таблицы iG. Чем больше — тем эффективнее batch inversion,
// но больше памяти на таблицу и хуже отзывчивость stop.
const BATCH: usize = 2048;

#[derive(Clone, Copy, Debug, PartialEq)]
enum Mode {
    Sequential,
    Random,
}

struct Shared {
    found: AtomicBool,
    checked: AtomicU64,
    result: Mutex<Option<Found>>,
}

#[derive(Clone)]
struct Found {
    key_hex: String,
    wif: String,
    address: String,
}

// ── hashing / addresses ──
fn hash160(data: &[u8]) -> [u8; 20] {
    let sha = Sha256::digest(data);
    let rmd = Ripemd160::digest(&sha);
    let mut out = [0u8; 20];
    out.copy_from_slice(&rmd);
    out
}

fn address_to_h160(addr: &str) -> Option<[u8; 20]> {
    let raw = bs58::decode(addr).into_vec().ok()?;
    if raw.len() != 25 || raw[0] != 0x00 {
        return None;
    }
    let mut h = [0u8; 20];
    h.copy_from_slice(&raw[1..21]);
    Some(h)
}

fn private_key_to_wif(key_be: &[u8; 32], compressed: bool) -> String {
    let mut payload = vec![0x80u8];
    payload.extend_from_slice(key_be);
    if compressed {
        payload.push(0x01);
    }
    let checksum = Sha256::digest(&Sha256::digest(&payload));
    payload.extend_from_slice(&checksum[..4]);
    bs58::encode(payload).into_string()
}

fn biguint_to_be32(n: &BigUint) -> [u8; 32] {
    let bytes = n.to_bytes_be();
    let mut out = [0u8; 32];
    let off = 32usize.saturating_sub(bytes.len());
    out[off..].copy_from_slice(&bytes);
    out
}

// ── worker ──
fn worker(
    target_h160: [u8; 20],
    range_start: BigUint,
    range_end: BigUint,
    seg_start: BigUint, // откуда начинать этому потоку (sequential)
    seg_end: BigUint,   // докуда (sequential); для random игнор
    mode: Mode,
    table: Arc<Vec<ec::AffinePoint>>,
    state: Arc<Shared>,
) {
    let batch_big = BigUint::from(BATCH as u64);
    let mut rng = rand::thread_rng();

    // текущая стартовая позиция k (точка p = k*G), точки батча = k+1..k+BATCH
    let mut k = seg_start.clone();

    // первая стартовая точка (одно EC-умножение через k256)
    let mut p = match ec::point_from_scalar_be(&biguint_to_be32(&k)) {
        Some(pt) => pt,
        None => return,
    };

    // для random: сколько батчей подряд идём от одного random-старта, прежде чем прыгнуть
    let random_segment_batches: u64 = 4096; // ~8.4M ключей на сегмент
    let mut batches_in_segment: u64 = 0;

    while !state.found.load(Ordering::Relaxed) {
        // вычислить P+1G..P+BATCH (ключи k+1..k+BATCH) через batch inversion
        let pts = ec::add_point_batch(&p, &table);

        for (j, pt) in pts.iter().enumerate() {
            let cpk = ec::compressed_pubkey(pt);
            if hash160(&cpk) == target_h160 {
                // ключ = k + j + 1
                let found_key = &k + BigUint::from((j as u64) + 1);
                let kb = biguint_to_be32(&found_key);
                let mut res = state.result.lock().unwrap();
                if res.is_none() {
                    *res = Some(Found {
                        key_hex: ec::bytes_to_hex(&kb),
                        wif: private_key_to_wif(&kb, true),
                        address: addr_from_h160(&target_h160),
                    });
                    state.found.store(true, Ordering::Relaxed);
                }
                return;
            }
        }
        state.checked.fetch_add(BATCH as u64, Ordering::Relaxed);

        // сдвиг на следующий батч: P = последняя точка (k+BATCH), k += BATCH
        p = pts[BATCH - 1].clone();
        k += &batch_big;
        batches_in_segment += 1;

        match mode {
            Mode::Sequential => {
                if k >= seg_end {
                    break; // этот поток прошёл свой кусок
                }
            }
            Mode::Random => {
                // диапазон огромный — периодически прыгаем на новый random-старт
                if batches_in_segment >= random_segment_batches {
                    batches_in_segment = 0;
                    k = random_in_range(&mut rng, &range_start, &range_end);
                    p = match ec::point_from_scalar_be(&biguint_to_be32(&k)) {
                        Some(pt) => pt,
                        None => continue,
                    };
                }
            }
        }
    }
}

fn random_in_range(rng: &mut impl Rng, start: &BigUint, end: &BigUint) -> BigUint {
    let range = if end > start { end - start } else { BigUint::from(1u32) };
    let bytes: [u8; 32] = rng.gen();
    let r = BigUint::from_bytes_be(&bytes);
    start + (r % &range)
}

fn addr_from_h160(h: &[u8; 20]) -> String {
    let mut payload = vec![0x00u8];
    payload.extend_from_slice(h);
    let checksum = Sha256::digest(&Sha256::digest(&payload));
    payload.extend_from_slice(&checksum[..4]);
    bs58::encode(payload).into_string()
}

fn fmt_speed(s: f64) -> String {
    if s >= 1e6 {
        format!("{:.2} M keys/s", s / 1e6)
    } else if s >= 1e3 {
        format!("{:.1} K keys/s", s / 1e3)
    } else {
        format!("{:.0} keys/s", s)
    }
}
fn fmt_count(c: u64) -> String {
    if c >= 1_000_000_000 {
        format!("{:.2}B", c as f64 / 1e9)
    } else if c >= 1_000_000 {
        format!("{:.2}M", c as f64 / 1e6)
    } else if c >= 1_000 {
        format!("{:.1}K", c as f64 / 1e3)
    } else {
        c.to_string()
    }
}

fn run(puzzle: &puzzles::Puzzle, threads: usize, mode: Mode) {
    let target_h160 = match address_to_h160(puzzle.address) {
        Some(h) => h,
        None => {
            eprintln!("❌ Не удалось декодировать адрес {}", puzzle.address);
            return;
        }
    };

    let range_start = BigUint::from_str_radix(puzzle.range_start, 16).unwrap();
    let range_end = BigUint::from_str_radix(puzzle.range_end, 16).unwrap();

    println!("\n🎯 {}  |  адрес: {}", puzzle.name, puzzle.address);
    println!("   Диапазон: {} .. {}  ({} бит)", puzzle.range_start, puzzle.range_end, puzzle.bits);
    println!("   Режим: {}", if mode == Mode::Sequential { "sequential (батч-инверсия по кускам)" } else { "random (батч-инверсия от случайных стартов)" });
    println!("🚀 {} потоков | batch-inversion (1 обращение на {} ключей)", threads, BATCH);
    println!("   Нажми Ctrl+C чтобы остановить\n");

    // Таблица iG — общая для всех потоков (read-only).
    print!("   Предвычисляю таблицу {}·G...", BATCH);
    std::io::stdout().flush().ok();
    let table = Arc::new(ec::precompute_ig_table(BATCH));
    println!(" готово.");

    let state = Arc::new(Shared {
        found: AtomicBool::new(false),
        checked: AtomicU64::new(0),
        result: Mutex::new(None),
    });
    let start_time = Instant::now();

    let span = if range_end > range_start { &range_end - &range_start } else { BigUint::from(1u32) };
    let chunk = &span / BigUint::from(threads as u64);

    let mut handles = Vec::new();
    for i in 0..threads {
        let st = Arc::clone(&state);
        let tbl = Arc::clone(&table);
        let rs = range_start.clone();
        let re = range_end.clone();
        let (seg_start, seg_end) = match mode {
            Mode::Sequential => {
                let s = &range_start + &chunk * BigUint::from(i as u64);
                let e = if i == threads - 1 { range_end.clone() } else { &s + &chunk };
                (s, e)
            }
            Mode::Random => {
                let mut rng = rand::thread_rng();
                (random_in_range(&mut rng, &range_start, &range_end), range_end.clone())
            }
        };
        handles.push(thread::spawn(move || {
            worker(target_h160, rs, re, seg_start, seg_end, mode, tbl, st);
        }));
    }

    let sc = Arc::clone(&state);
    ctrlc::set_handler(move || sc.found.store(true, Ordering::Relaxed)).ok();

    let mut last = 0u64;
    while !state.found.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(1000));
        // все потоки завершились (sequential дошёл до конца)?
        if handles.iter().all(|h| h.is_finished()) {
            break;
        }
        let cur = state.checked.load(Ordering::Relaxed);
        let since = cur.saturating_sub(last);
        last = cur;
        let el = start_time.elapsed().as_secs_f64();
        print!(
            "\r⏳ Проверено: {} | {:.1}s | Средняя: {} | Мгновенная: {}        ",
            fmt_count(cur), el,
            fmt_speed(if el > 0.0 { cur as f64 / el } else { 0.0 }),
            fmt_speed(since as f64),
        );
        std::io::stdout().flush().ok();
    }

    for h in handles {
        h.join().ok();
    }

    let el = start_time.elapsed().as_secs_f64();
    let total = state.checked.load(Ordering::Relaxed);
    let res = state.result.lock().unwrap();
    if let Some(ref r) = *res {
        println!("\n\n╔══════════════════════════════════════════════════════╗");
        println!("║         🔑 ПРИВАТНЫЙ КЛЮЧ НАЙДЕН!                    ║");
        println!("╠══════════════════════════════════════════════════════╣");
        println!("║ Пазл:   {}", puzzle.name);
        println!("║ Адрес:  {}", r.address);
        println!("║ HEX:    {}", r.key_hex);
        println!("║ WIF:    {}", r.wif);
        println!("╚══════════════════════════════════════════════════════╝");
        println!("   Проверено: {} за {:.1}с ({})", fmt_count(total), el, fmt_speed(total as f64 / el));
        let fname = format!("puzzle_{}_found.txt", puzzle.id);
        let content = format!(
            "Bitcoin Puzzle FOUND\n\nPuzzle: {}\nAddress: {}\nPrivate key (HEX): {}\nPrivate key (WIF): {}\n\nChecked: {} in {:.1}s\n",
            puzzle.name, r.address, r.key_hex, r.wif, fmt_count(total), el
        );
        std::fs::write(&fname, content).ok();
        println!("   📄 Сохранено в {}", fname);
    } else {
        println!("\n\n⏹  Остановлено. Проверено: {} за {:.1}с ({})", fmt_count(total), el, fmt_speed(total as f64 / el));
        if mode == Mode::Sequential && total > 0 {
            println!("   (sequential прошёл весь диапазон — ключ не найден в нём)");
        }
    }
}

// ── CLI ──
fn main() {
    let args: Vec<String> = std::env::args().collect();

    let mut puzzle_id: Option<u32> = None;
    let mut threads = num_cpus::get();
    let mut mode = Mode::Sequential;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--puzzle" | "-p" => { i += 1; puzzle_id = args.get(i).and_then(|s| s.parse().ok()); }
            "--threads" | "-t" => { i += 1; threads = args.get(i).and_then(|s| s.parse().ok()).unwrap_or(threads); }
            "--mode" | "-m" => { i += 1; mode = match args.get(i).map(|s| s.as_str()) {
                Some("random") => Mode::Random,
                Some("sequential") => Mode::Sequential,
                _ => Mode::Sequential,
            }; }
            "--help" | "-h" => { print_usage(); return; }
            _ => {}
        }
        i += 1;
    }

    let _ = Zero::is_zero(&BigUint::zero()); // силенс unused import в некоторых сборках

    let puzzle = match puzzle_id {
        Some(id) => puzzles::PUZZLES.iter().find(|p| p.id == id).cloned(),
        None => {
            if atty::is(atty::Stream::Stdin) {
                interactive()
            } else {
                print_usage();
                return;
            }
        }
    };

    match puzzle {
        Some(p) => run(&p, threads.max(1), mode),
        None => { eprintln!("❌ Пазл не найден. bitkee-fast --help"); }
    }
}

fn interactive() -> Option<puzzles::Puzzle> {
    let items: Vec<String> = puzzles::PUZZLES.iter().map(|p| {
        let tag = if p.reward > 0.0 { format!(" 💰 {:.2} BTC", p.reward) } else { String::new() };
        format!("{}{}  ({} бит)", p.name, tag, p.bits)
    }).collect();
    let sel = dialoguer::Select::new().with_prompt("🎯 Выбери пазл").items(&items).default(0).interact().ok()?;
    let puzzle = puzzles::PUZZLES[sel].clone();

    let modes = ["sequential (надёжно находит — по кускам)", "random (от случайных стартов)"];
    let m = dialoguer::Select::new().with_prompt("🔍 Режим").items(&modes).default(0).interact().ok()?;
    let mode = if m == 0 { Mode::Sequential } else { Mode::Random };

    let max_t = num_cpus::get();
    let topts: Vec<String> = (1..=max_t).map(|n| if n == max_t { format!("{} (все ядра)", n) } else { n.to_string() }).collect();
    let t = dialoguer::Select::new().with_prompt("⚡ Потоков").items(&topts).default(max_t - 1).interact().ok()?;

    run(&puzzle, t + 1, mode);
    None
}

fn print_usage() {
    eprintln!("bitkee-fast — Bitcoin Puzzle Solver (batch-inversion, 5-10x)\n");
    eprintln!("  bitkee-fast                        — интерактивный режим");
    eprintln!("  bitkee-fast -p <id> [-t N] [-m random|sequential]\n");
    eprintln!("Пазлы:");
    for p in puzzles::PUZZLES.iter() {
        let tag = if p.reward > 0.0 { format!(" 💰 {:.2} BTC", p.reward) } else { String::new() };
        eprintln!("  id={:<3} {}{} ({} бит)", p.id, p.name, tag, p.bits);
    }
}
