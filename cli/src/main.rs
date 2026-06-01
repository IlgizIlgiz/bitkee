mod bitcoin;
mod puzzles;

use num_bigint::BigUint;
use num_traits::Num;
use rand::Rng;
use std::io::Write;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const BATCH_SIZE: u32 = 1000;

#[derive(Clone, Copy, Debug, PartialEq)]
enum SearchMode {
    Random,
    Smart,
    StartBias,
}

impl SearchMode {
    fn label(self) -> &'static str {
        match self {
            SearchMode::Random => "random (равномерный по всему диапазону)",
            SearchMode::Smart => "smart (весовой — горячие зоны ×3 плотность)",
            SearchMode::StartBias => "start-bias (от начала диапазона — #69 был на 0.7%)",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Intensity {
    Eco,
    Normal,
    Turbo,
}

impl Intensity {
    fn throttle_ms(self) -> u64 {
        match self {
            Intensity::Eco => 50,
            Intensity::Normal => 10,
            Intensity::Turbo => 0,
        }
    }
    fn label(self) -> &'static str {
        match self {
            Intensity::Eco => "eco  (50ms пауза, холодный)",
            Intensity::Normal => "normal (10ms пауза, умеренный)",
            Intensity::Turbo => "turbo (без пауз, макс. скорость 🔥)",
        }
    }
}

struct SharedState {
    found: AtomicBool,
    total_checked: AtomicU64,
    result: Mutex<Option<SearchResult>>,
}

#[derive(Clone, Debug)]
struct SearchResult {
    private_key_hex: String,
    private_key_wif: String,
    address: String,
    total_checked: u64,
    elapsed_secs: f64,
}

fn key_to_hex(key: &[u8; 32]) -> String { bitcoin::bytes_to_hex(key) }
fn hex_to_key(hex: &str) -> [u8; 32] { bitcoin::hex_to_bytes(hex).unwrap_or([0u8; 32]) }
fn biguint_to_key(n: &BigUint) -> [u8; 32] {
    let bytes = n.to_bytes_be();
    let mut key = [0u8; 32];
    let offset = 32usize.saturating_sub(bytes.len());
    key[offset..].copy_from_slice(&bytes);
    key
}

fn random_key_in_range(start_padded: &str, end_padded: &str) -> [u8; 32] {
    let start = BigUint::from_str_radix(start_padded, 16).unwrap();
    let end = BigUint::from_str_radix(end_padded, 16).unwrap();
    let range = if end >= start { &end - &start + 1u32 } else { BigUint::from(1u32) };
    let mut rng = rand::thread_rng();
    let random_bytes: [u8; 32] = rng.gen();
    let random = BigUint::from_bytes_be(&random_bytes);
    biguint_to_key(&(&start + (random % &range)))
}

fn random_key_in_fraction(range_start: &BigUint, range_end: &BigUint, frac_start: f64, frac_end: f64) -> [u8; 32] {
    let range_size = range_end - range_start;
    let sub_start = range_start + biguint_fraction(&range_size, frac_start);
    let sub_end = range_start + biguint_fraction(&range_size, frac_end);
    let sub_size = if &sub_end > &sub_start { &sub_end - &sub_start + 1u32 } else { BigUint::from(1u32) };
    let mut rng = rand::thread_rng();
    let random_bytes: [u8; 32] = rng.gen();
    let random = BigUint::from_bytes_be(&random_bytes);
    biguint_to_key(&(&sub_start + (random % &sub_size)))
}

fn biguint_fraction(n: &BigUint, frac: f64) -> BigUint {
    let num = (frac * u64::MAX as f64) as u64;
    (n * BigUint::from(num)) / BigUint::from(u64::MAX)
}

fn worker_loop(
    target_address: String, range_start_padded: String, range_end_padded: String,
    state: Arc<SharedState>, _worker_id: usize, throttle_ms: u64, mode: SearchMode,
    zone_info: Option<(f64, f64, &'static str)>,
) {
    let range_start_big = BigUint::from_str_radix(&range_start_padded, 16).unwrap();
    let range_end_big = BigUint::from_str_radix(&range_end_padded, 16).unwrap();

    while !state.found.load(Ordering::Relaxed) {
        let seg_start: [u8; 32] = match mode {
            SearchMode::Smart => {
                if let Some((fs, fe, _)) = zone_info {
                    random_key_in_fraction(&range_start_big, &range_end_big, fs, fe)
                } else {
                    random_key_in_range(&range_start_padded, &range_end_padded)
                }
            }
            _ => random_key_in_range(&range_start_padded, &range_end_padded),
        };

        let seg_start_hex = key_to_hex(&seg_start);
        let seg_start_big = BigUint::from_bytes_be(&seg_start);
        let seg_end_big = {
            let end_candidate = &seg_start_big + BigUint::from(BATCH_SIZE - 1);
            if end_candidate > range_end_big { range_end_big.clone() } else { end_candidate }
        };
        let seg_end_hex = format!("{:0>64x}", seg_end_big);

        let result = bitcoin::check_keys_batch(&target_address, &seg_start_hex, &seg_end_hex, BATCH_SIZE);
        state.total_checked.fetch_add(result.checked as u64, Ordering::Relaxed);

        if result.found {
            let mut res = state.result.lock().unwrap();
            if res.is_none() {
                *res = Some(SearchResult {
                    private_key_hex: result.key_hex.clone().unwrap(),
                    private_key_wif: result.key_wif.clone().unwrap(),
                    address: result.address.clone().unwrap(),
                    total_checked: 0, elapsed_secs: 0.0,
                });
                state.found.store(true, Ordering::Relaxed);
            }
            break;
        }
        if throttle_ms > 0 { thread::sleep(Duration::from_millis(throttle_ms)); }
    }
}

fn format_speed(speed: f64) -> String {
    if speed >= 1_000_000.0 { format!("{:.2} M keys/s", speed / 1_000_000.0) }
    else if speed >= 1_000.0 { format!("{:.1} K keys/s", speed / 1_000.0) }
    else { format!("{:.0} keys/s", speed) }
}

fn format_checked(checked: u64) -> String {
    if checked >= 1_000_000_000 { format!("{:.2}B", checked as f64 / 1_000_000_000.0) }
    else if checked >= 1_000_000 { format!("{:.2}M", checked as f64 / 1_000_000.0) }
    else if checked >= 1_000 { format!("{:.1}K", checked as f64 / 1_000.0) }
    else { checked.to_string() }
}

struct HotZone { frac_start: f64, frac_end: f64, label: &'static str, reason: &'static str }

fn get_hot_zones() -> Vec<HotZone> {
    vec![
        HotZone { frac_start: 0.0, frac_end: 0.10, label: "0-10%", reason: "#69 на 0.72%, #85 на 9.0%" },
        HotZone { frac_start: 0.15, frac_end: 0.32, label: "15-32%", reason: "#66 на 26%, #75 на 19%, #95 на 29%" },
        HotZone { frac_start: 0.35, frac_end: 0.55, label: "35-55%", reason: "#68 на 49%, #100 на 37%, #90 на 40%" },
    ]
}

fn run_search(puzzle: &puzzles::Puzzle, num_threads: usize, intensity: Intensity, mode: SearchMode) {
    let throttle_ms = intensity.throttle_ms();
    println!("\n🎯 {}  |  адрес: {}", puzzle.name, puzzle.address);
    println!("   Диапазон: {} .. {}  ({} бит)", puzzle.range_start, puzzle.range_end, puzzle.bits);
    println!("   Режим: {}", mode.label());
    println!("🚀 {} потоков | интенсивность: {}", num_threads, intensity.label());
    if throttle_ms > 0 { println!("   (пауза {}ms между батчами)", throttle_ms); }
    if mode == SearchMode::Smart {
        let zones = get_hot_zones();
        println!("   🔥 Горячие зоны (60% потоков):");
        for z in &zones { println!("      Зона {:>8} — {}", z.label, z.reason); }
    }
    if mode == SearchMode::StartBias { println!("   Идём от начала — #69 был найден всего на 0.72% от старта!"); }
    println!("   Нажми Ctrl+C чтобы остановить\n");

    let state = Arc::new(SharedState { found: AtomicBool::new(false), total_checked: AtomicU64::new(0), result: Mutex::new(None) });
    let start_time = Instant::now();
    let mut handles = Vec::new();

    match mode {
        SearchMode::Smart => {
            let zones = get_hot_zones();
            let zone_threads_total = (num_threads as f64 * 0.6).ceil() as usize;
            let full_range_threads = num_threads.saturating_sub(zone_threads_total);
            let threads_per_zone = if zones.is_empty() { 0 } else { zone_threads_total / zones.len() };
            let remaining = zone_threads_total.saturating_sub(threads_per_zone * zones.len());
            let mut thread_id = 0;
            for (zi, zone) in zones.iter().enumerate() {
                let threads_in_zone = threads_per_zone + if zi < remaining { 1 } else { 0 };
                for _ in 0..threads_in_zone {
                    let s = Arc::clone(&state); let a = puzzle.address.to_string();
                    let rs = puzzle.range_start_padded(); let re = puzzle.range_end_padded();
                    let zi = (zone.frac_start, zone.frac_end, zone.label);
                    handles.push(thread::spawn(move || worker_loop(a, rs, re, s, thread_id, throttle_ms, mode, Some(zi))));
                    thread_id += 1;
                }
            }
            for _ in 0..full_range_threads {
                let s = Arc::clone(&state); let a = puzzle.address.to_string();
                let rs = puzzle.range_start_padded(); let re = puzzle.range_end_padded();
                handles.push(thread::spawn(move || worker_loop(a, rs, re, s, thread_id, throttle_ms, SearchMode::Random, None)));
                thread_id += 1;
            }
        }
        SearchMode::StartBias | SearchMode::Random => {
            for id in 0..num_threads {
                let s = Arc::clone(&state); let a = puzzle.address.to_string();
                let rs = puzzle.range_start_padded(); let re = puzzle.range_end_padded();
                handles.push(thread::spawn(move || worker_loop(a, rs, re, s, id, throttle_ms, mode, None)));
            }
        }
    }

    let state_clone = Arc::clone(&state);
    ctrlc::set_handler(move || { state_clone.found.store(true, Ordering::Relaxed); }).ok();

    let mut last_checked: u64 = 0;
    while !state.found.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(1000));
        let current = state.total_checked.load(Ordering::Relaxed);
        let since = current.saturating_sub(last_checked);
        last_checked = current;
        let elapsed = start_time.elapsed().as_secs_f64();
        print!("\r⏳ Проверено: {} | {:.1}s | Средняя: {} | Мгновенная: {}     ",
            format_checked(current), elapsed,
            format_speed(if elapsed>0.0 { current as f64/elapsed } else { 0.0 }),
            format_speed(since as f64));
        std::io::stdout().flush().ok();
    }
    for h in handles { h.join().ok(); }

    let elapsed = start_time.elapsed().as_secs_f64();
    let total = state.total_checked.load(Ordering::Relaxed);
    let result = state.result.lock().unwrap();
    if let Some(ref r) = *result {
        println!("\n╔══════════════════════════════════════════════════════╗");
        println!("║         🔑 ПРИВАТНЫЙ КЛЮЧ НАЙДЕН!                    ║");
        println!("╠══════════════════════════════════════════════════════╣");
        println!("║ Пазл:      {:45} ║", puzzle.name);
        println!("║ Адрес:     {:45} ║", r.address);
        println!("║ Прив. ключ (HEX):                                    ║");
        println!("║   {}  ║", r.private_key_hex);
        println!("║ Прив. ключ (WIF):                                    ║");
        println!("║   {} ║", r.private_key_wif);
        println!("╚══════════════════════════════════════════════════════╝");
        println!("   Проверено: {} ключей за {:.1} с", format_checked(total), elapsed);
        let filename = format!("puzzle_{}_found.txt", puzzle.id);
        let content = format!("🔑 Bitcoin Puzzle Private Key — НАЙДЕНО!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nПазл: {name}\nАдрес: {addr}\n\nПриватный ключ (HEX):\n  {hex}\n\nПриватный ключ (WIF):\n  {wif}\n\nПроверено ключей: {chk}\nЗатрачено времени: {el:.1} с\nСредняя скорость: {spd}\n",
            name=puzzle.name, addr=r.address, hex=r.private_key_hex, wif=r.private_key_wif,
            chk=format_checked(total), el=elapsed, spd=format_speed(total as f64/elapsed));
        if std::fs::write(&filename, &content).is_ok() { println!("\n📄 Результат сохранён в файл: {}", filename); }
    } else {
        println!("\n⏹  Поиск остановлен (Ctrl+C). Проверено: {} за {:.1} с", format_checked(total), elapsed);
    }
}

fn interactive_mode() {
    let searchable = puzzles::get_searchable_puzzles();
    if searchable.is_empty() { eprintln!("Нет доступных пазлов."); return; }

    let items: Vec<String> = searchable.iter().map(|p| {
        let reward = if p.reward > 0.0 { format!(" 💰 {:.2} BTC", p.reward) }
        else if p.is_test { " 🧪 тестовый".to_string() } else { String::new() };
        format!("{}{}  ({} бит, {})", p.name, reward, p.bits, p.range_start)
    }).collect();

    let selection = dialoguer::Select::new().with_prompt("🎯 Выбери пазл").items(&items).default(0).interact().unwrap();
    let puzzle = &searchable[selection];

    let modes = [SearchMode::Smart, SearchMode::StartBias, SearchMode::Random];
    let mode_items: Vec<String> = modes.iter().map(|m| m.label().to_string()).collect();
    let mode_sel = dialoguer::Select::new().with_prompt("🔍 Режим поиска").items(&mode_items).default(0).interact().unwrap();

    let max_threads = num_cpus::get();
    let thread_options: Vec<String> = (1..=max_threads).map(|n| if n == max_threads { format!("{} потоков (все ядра)", n) } else { format!("{} потоков", n) }).collect();
    let thread_sel = dialoguer::Select::new().with_prompt("⚡ Сколько потоков?").items(&thread_options).default(2.max(max_threads/2)-1).interact().unwrap();

    let intensities = [Intensity::Eco, Intensity::Normal, Intensity::Turbo];
    let int_items: Vec<String> = intensities.iter().map(|i| i.label().to_string()).collect();
    let int_sel = dialoguer::Select::new().with_prompt("🌡  Интенсивность").items(&int_items).default(1).interact().unwrap();

    run_search(puzzle, thread_sel + 1, intensities[int_sel], modes[mode_sel]);
}

fn print_usage() {
    eprintln!("BitKee CLI — Bitcoin Puzzle Solver\n");
    eprintln!("Использование:");
    eprintln!("  bitkee                              — интерактивный режим");
    eprintln!("  bitkee --puzzle <id> [опции]       — неинтерактивный режим\n");
    eprintln!("Аргументы:");
    eprintln!("  --puzzle, -p <id>   ID пазла");
    eprintln!("  --threads, -t <n>   Потоков (по умолчанию: все ядра)");
    eprintln!("  --intensity, -i <m> eco | normal | turbo (по умолчанию: normal)");
    eprintln!("  --mode, -m <m>      random | smart | start-bias (по умолчанию: smart)\n");
    eprintln!("Режимы: smart (весовой по горячим зонам) | start-bias (от начала) | random (равномерный)\n");
    eprintln!("Пример: bitkee --puzzle 71 --mode smart --threads 4 --intensity normal\n");
    eprintln!("Доступные пазлы:");
    for p in puzzles::get_searchable_puzzles() {
        let r = if p.reward > 0.0 { format!(" 💰 {:.2} BTC", p.reward) }
            else if p.is_test { " 🧪 тестовый".to_string() } else { String::new() };
        eprintln!("  id={:<3} {}{}  ({} бит)", p.id, p.name, r, p.bits);
    }
    eprintln!("\n  --threads по умолчанию = число ядер CPU ({})", num_cpus::get());
}

fn parse_args() -> Option<(u32, usize, Intensity, SearchMode)> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() == 1 {
        if atty::is(atty::Stream::Stdin) { return None; }
        else { eprintln!("⚠️  Нет терминала. Используй аргументы:"); print_usage(); std::process::exit(1); }
    }
    let mut puzzle_id: Option<u32> = None;
    let mut threads: Option<usize> = None;
    let mut intensity = Intensity::Normal;
    let mut mode = SearchMode::Smart;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--puzzle"|"-p" => { i+=1; puzzle_id=Some(args[i].parse().unwrap_or_else(|_|{eprintln!("❌ Неверный ID"); std::process::exit(1)})); }
            "--threads"|"-t" => { i+=1; threads=Some(args[i].parse().unwrap_or_else(|_|{eprintln!("❌ Неверное число потоков"); std::process::exit(1)})); }
            "--intensity"|"-i" => { i+=1; intensity=match args[i].as_str() {
                "eco"=>Intensity::Eco, "normal"=>Intensity::Normal, "turbo"=>Intensity::Turbo,
                o=>{eprintln!("❌ Неизвестный режим: {}. Допустимо: eco, normal, turbo",o); std::process::exit(1)}
            };}
            "--mode"|"-m" => { i+=1; mode=match args[i].as_str() {
                "random"=>SearchMode::Random, "smart"=>SearchMode::Smart, "start-bias"=>SearchMode::StartBias,
                o=>{eprintln!("❌ Неизвестный режим: {}. Допустимо: random, smart, start-bias",o); std::process::exit(1)}
            };}
            "--help"|"-h" => { print_usage(); std::process::exit(0); }
            o => { eprintln!("❌ Неизвестный аргумент: {}", o); print_usage(); std::process::exit(1); }
        }
        i += 1;
    }
    let pid = puzzle_id.unwrap_or_else(||{eprintln!("❌ Укажи --puzzle <id>"); print_usage(); std::process::exit(1)});
    let t = threads.unwrap_or_else(|| num_cpus::get());
    Some((pid, t, intensity, mode))
}

fn main() {
    match parse_args() {
        None => interactive_mode(),
        Some((pid, threads, intensity, mode)) => {
            match puzzles::get_searchable_puzzles().into_iter().find(|p| p.id == pid) {
                Some(p) => run_search(p, threads, intensity, mode),
                None => { eprintln!("❌ Пазл id={} не найден.", pid); std::process::exit(1); }
            }
        }
    }
}
