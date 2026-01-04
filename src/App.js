/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';
import { openDB } from 'idb';
import PageNumber from './PageNumber/PageNumber';
import Results from './Results/Results';
import Community from './Community/Community';
import History from './History/History';
import axios from "axios";
import { X, Coins, Target, ClipboardList, BookOpen, Lightbulb, AlertTriangle, BarChart3 } from 'lucide-react';

// Утилиты
import { formatBalance } from './utils/formatters';
import { generatePrivateKeyFromPosition } from './utils/bitcoin';
import { MAX_PRIVATE_KEY } from './constants/bitcoin.js';
import { ADDRESSES_PER_BATCH } from './constants/bitcoin';
import { createAddressWorker } from './utils/workerFactory';
import { BITCOIN_PUZZLES, DEFAULT_PUZZLE_ID, getPuzzleById, getUnsolvedPuzzles } from './data/puzzles';

// Локализация
import { useTranslation } from './hooks/useTranslation';

import foundReceived from './Sounds/foundReceived.mp3';
import foundFinal from './Sounds/foundFinal.mp3';

function App() {
  const { t } = useTranslation();
  
  const [currentPosition, setCurrentPosition] = useState(null);
  const [currentHash, setCurrentHash] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [autoMode, setAutoMode] = useState(false);
  const [autoModeAI, setAutoModeAI] = useState(false);
  const [currentAiPosition, setCurrentAiPosition] = useState(null);

  // Puzzle Mode state
  const [puzzleMode, setPuzzleMode] = useState(false);
  const [selectedPuzzle, setSelectedPuzzle] = useState(() => getPuzzleById(DEFAULT_PUZZLE_ID));
  const [puzzleStats, setPuzzleStats] = useState({ checked: 0, startTime: null, speed: 0 });
  const [puzzleBalances, setPuzzleBalances] = useState({}); // Реальные балансы с API
  const [puzzleBalancesLoading, setPuzzleBalancesLoading] = useState(false); // Загрузка балансов
  const puzzleModeRef = useRef(false);
  const selectedPuzzleRef = useRef(selectedPuzzle);
  const puzzleBalancesRef = useRef(puzzleBalances);
  useEffect(() => { selectedPuzzleRef.current = selectedPuzzle; }, [selectedPuzzle]);
  useEffect(() => { puzzleBalancesRef.current = puzzleBalances; }, [puzzleBalances]);
  // Звук: по умолчанию выключен, но читаем из localStorage
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('soundEnabled');
    return stored === null ? false : stored === 'true';
  });
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => {
    localStorage.setItem('soundEnabled', soundEnabled);
  }, [soundEnabled]);
  // Показ вступительного окна
  const [showIntro, setShowIntro] = useState(false);
 
  const currentPositionRef = useRef(null);
  const currentPageRef = useRef(null);
  const aiPositions = useRef([]);
  const workerRef = useRef(null);

  // Multi-threaded puzzle search
  const puzzleWorkersRef = useRef([]);
  const puzzleWorkerStatsRef = useRef({}); // Stats per worker: { workerId: { checked, speed } }

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(null);
  const loadingRef = useRef(false); // Мгновенное отслеживание loading
  const requestIdRef = useRef(0); // ID текущего запроса для защиты от race condition
  const [balancesResult, setBalancesResult] = useState([]);
  const [totalReceived, setTotalReceived] = useState(0);
  const [finalBalance, setFinalBalance] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockedSeconds, setLockedSeconds] = useState(5);
  const [showResults, setShowResults] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [resultsExists, setResultsExists] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [keepResultsDuringLoading, setKeepResultsDuringLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingMsg, setAiLoadingMsg] = useState(null);
  const [showBalanceModal, setShowBalanceModal] = useState(false);

  const autoModeRef = useRef(false);
  const autoModeRefAi = useRef(false);

  // Тестовый режим
  const [testMode, setTestMode] = useState(false);
  const testModeRef = useRef(false);
  const testPages = useRef([
    '1', // Первая страница
    '904625697166532776746648320380374280100293470930272690489102837043110636675' // Последняя страница
  ]);
  const testPageIndex = useRef(0);

  // Состояние для отслеживания найденного баланса
  const [balanceFound, setBalanceFound] = useState(false);
  // 1. Новый state
  const [permanentLock, setPermanentLock] = useState(false);
  // Состояние для отслеживания запущенного авто режима
  const [autoRunning, setAutoRunning] = useState(false);

  useEffect(() => {
    autoModeRef.current = autoMode;
  }, [autoMode]);

  useEffect(() => {
    autoModeRefAi.current = autoModeAI;
  }, [autoModeAI]);

  useEffect(() => {
    puzzleModeRef.current = puzzleMode;
  }, [puzzleMode]);

  useEffect(() => {
    testModeRef.current = testMode;
  }, [testMode]);

  // Обновляем начальное сообщение загрузки
  useEffect(() => {
    setLoadingMsg(t('checkingBalances'));
  }, [t]);

  // Показываем вступительное окно при первом запуске
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem('hasSeenIntro');
    if (!hasSeenIntro) {
      setShowIntro(true);
    }
  }, []);



  // Функция загрузки последнего числа из IndexedDB
  const loadLastPosition = useCallback(async () => {
    try {
      const db = await initDB();
      const tx = db.transaction('pages', 'readonly');
      const store = tx.objectStore('pages');
      
      const lastPositionRecord = await store.get('lastPosition');
      
      if (lastPositionRecord && lastPositionRecord.balances && lastPositionRecord.balances.position !== undefined) {
        console.log(`Загружена последняя позиция: ${lastPositionRecord.balances.position}`);
        return lastPositionRecord.balances.position;
      }
      
      return null;
    } catch (error) {
      console.error('Ошибка загрузки последней позиции:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    // Initialize the worker asynchronously (WASM if available, JS fallback)
    const initWorker = async () => {
      try {
        workerRef.current = await createAddressWorker();

        workerRef.current.onmessage = (e) => {
          const { addresses, requestId, error, puzzleResult } = e.data;

          if (error) {
            console.warn('Worker error:', error);
            return;
          }

          // Проверяем, актуален ли этот ответ
          if (requestId !== undefined && requestId !== requestIdRef.current) {
            console.log('⏭️ Ignoring stale response. Response requestId:', requestId, 'Current requestId:', requestIdRef.current);
            return; // Игнорируем устаревший ответ
          }

          // Puzzle stats update (every 5 sec from worker)
          if (e.data.puzzleStats) {
            const { keysChecked, speed } = e.data.puzzleStats;
            setPuzzleStats(prev => ({ ...prev, checked: keysChecked, speed }));
            return;
          }

          // Puzzle search result from WASM (found!)
          if (puzzleResult) {
            handlePuzzleSearchResult(puzzleResult);
            return;
          }

          // In puzzle mode, worker sends puzzleStats/puzzleResult only - no addresses
          if (puzzleModeRef.current) {
            return;
          }

          // Normal mode: проверяем балансы через API
          if (addresses) {
            const validAddresses = addresses.filter(addr => addr !== null);
            console.log('App: Received', validAddresses.length, 'valid addresses out of', addresses.length, 'total slots, requestId:', requestId);
            if (validAddresses.length < 128) {
              console.warn('App: Expected 128 addresses, but received only', validAddresses.length, 'valid ones');
            }
            checkBalances(validAddresses, currentPositionRef.current);
          }
        };

        console.log('Worker initialized successfully');
      } catch (error) {
        console.error('Failed to initialize worker:', error);
      }
    };

    initWorker();

    // Загружаем последнюю позицию без автоматического запуска
    const initializeApp = async () => {
      try {
        const lastPosition = await loadLastPosition();
        if (lastPosition !== null) {
          // Если есть сохраненная позиция, просто устанавливаем её без запуска
          console.log('Восстанавливаем последнюю позицию:', lastPosition);
          setCurrentPosition(lastPosition);
          setCurrentPage(Math.floor(lastPosition / ADDRESSES_PER_BATCH));
        } else {
          // Если нет сохраненной позиции, устанавливаем начальные значения
          console.log('Устанавливаем начальные значения');
          setCurrentPosition(0);
          setCurrentPage(0);
        }
      } catch (error) {
        console.error('Ошибка инициализации приложения:', error);
        // В случае ошибки устанавливаем начальные значения
        setCurrentPosition(0);
        setCurrentPage(0);
      }
    };

    initializeApp();

    return () => {
      workerRef.current.terminate();
    };
  }, [loadLastPosition]);

  const toggleAutoMode = () => {
    setAutoMode(!autoMode);
      if (autoModeAI) {
        setAutoModeAI(false);
    }
  }

  const toggleAutoAiMode = () => {
    setAutoModeAI(!autoModeAI);
      if (autoMode) {
        setAutoMode(false);
    }
  }

  // Puzzle Mode functions
  const togglePuzzleMode = () => {
    const newPuzzleMode = !puzzleMode;
    setPuzzleMode(newPuzzleMode);
    if (newPuzzleMode) {
      // При включении puzzle mode отключаем другие режимы
      setAutoMode(false);
      setAutoModeAI(false);
      // Сбрасываем статистику
      setPuzzleStats({ checked: 0, startTime: null, speed: 0 });
      // Загружаем актуальные балансы пазлов
      fetchPuzzleBalances();
    }
  };

  const selectPuzzle = (puzzleId) => {
    const puzzle = getPuzzleById(puzzleId);
    if (puzzle) {
      setSelectedPuzzle(puzzle);
      // Сбрасываем статистику при смене puzzle
      setPuzzleStats({ checked: 0, startTime: null, speed: 0 });
    }
  };

  // Загрузить реальные балансы ВСЕХ пазлов с blockchain.info
  const fetchPuzzleBalances = async () => {
    setPuzzleBalancesLoading(true);
    try {
      // Загружаем балансы ВСЕХ пазлов (и решённых тоже) для проверки статуса
      const allPuzzles = BITCOIN_PUZZLES;
      const addresses = allPuzzles.map(p => p.address).join('|');
      const response = await fetch(`https://blockchain.info/balance?active=${addresses}`);
      if (!response.ok) return;

      const data = await response.json();
      const balances = {};
      for (const puzzle of allPuzzles) {
        if (data[puzzle.address]) {
          // Конвертируем сатоши в BTC
          balances[puzzle.id] = data[puzzle.address].final_balance / 100000000;
        }
      }
      setPuzzleBalances(balances);
      console.log('Puzzle balances loaded:', balances);
    } catch (error) {
      console.error('Failed to fetch puzzle balances:', error);
    } finally {
      setPuzzleBalancesLoading(false);
    }
  };

  // Проверить решён ли пазл (баланс = 0)
  const isPuzzleSolved = (puzzleId) => {
    const puzzle = getPuzzleById(puzzleId);
    // Тестовые пазлы никогда не считаются решёнными
    if (puzzle?.isTest) return false;
    // Если баланс загружен из API и равен 0 - решён
    if (puzzleBalances[puzzleId] !== undefined) {
      return puzzleBalances[puzzleId] === 0;
    }
    // Fallback на статический флаг solved
    return puzzle?.solved || false;
  };

  // Функция для работы с IndexedDB
  const initDB = async () => {
    return openDB('HistoryDB', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pages')) {
          db.createObjectStore('pages', { keyPath: 'pageNumber' });
        }
      },
    });
  };

  // Функция сохранения данных в IndexedDB
  const savePageToHistory = async (pageNumber, balances) => {
    const db = await initDB();
    const tx = db.transaction('pages', 'readwrite');
    const store = tx.objectStore('pages');
  
    // Проверяем, существует ли уже запись с таким pageNumber
    const existingRecord = await store.get(pageNumber);
    
    if (!existingRecord) {
      const timestamp = new Date().toISOString(); // Получаем текущую дату и время
      await store.put({ pageNumber, balances, timestamp });
      console.log(`Запись с pageNumber ${pageNumber} сохранена в историю.`);
    } else {
      console.log(`Запись с pageNumber ${pageNumber} уже существует. Сохранение пропущено.`);
    }
  
    await tx.done; // Завершаем транзакцию
  };

  // Функция чтения данных из IndexedDB
  const getHistoryFromDB = async (offset = 0, limit = 20) => {
      const db = await initDB();
      const tx = db.transaction('pages', 'readonly');
      const store = tx.objectStore('pages');

      // Получаем все записи
      const allRecords = await store.getAll();
      // Фильтруем записи - исключаем служебные записи
      const filteredRecords = allRecords.filter(record => 
        record.pageNumber !== 'lastPosition' && 
        (typeof record.pageNumber !== 'string' || !isNaN(record.pageNumber))
      );
      // Сортируем записи по timestamp в порядке убывания
      const sortedRecords = filteredRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      // Выбираем записи с учетом пагинации
      const paginatedRecords = sortedRecords.slice(offset, offset + limit);

      return paginatedRecords;
  };

  // Функция сохранения последнего числа в IndexedDB
  const saveLastPosition = async (position) => {
    try {
      const db = await initDB();
      const tx = db.transaction('pages', 'readwrite');
      const store = tx.objectStore('pages');
      
      const timestamp = new Date().toISOString();
      await store.put({ 
        pageNumber: 'lastPosition', 
        balances: { position: position }, 
        timestamp 
      });
      
      console.log(`Последняя позиция ${position} сохранена.`);
      await tx.done;
    } catch (error) {
      console.error('Ошибка сохранения последней позиции:', error);
    }
  };



  // Функция генерации случайной страницы из всего диапазона
  const generateRandomPage = () => {
    // Вычисляем максимальный номер страницы
    const maxKey = BigInt('0x' + MAX_PRIVATE_KEY);
    const maxPageNumber = (maxKey - BigInt(1)) / BigInt(ADDRESSES_PER_BATCH) + BigInt(1);
    
    // Получаем текущую страницу для избежания повторений
    const currentPage = currentPositionRef.current ? getPageFromPosition(currentPositionRef.current) : null;
    const currentPageBigInt = currentPage ? BigInt(currentPage) : null;
    
    let randomPage;
    
    // 70% случаев - полностью случайная страница
    if (Math.random() < 0.7) {
      randomPage = BigInt(Math.floor(Math.random() * Number(maxPageNumber))) + BigInt(1);
    } 
    // 20% случаев - стратегические страницы (близко к началу, середине, концу)
    else if (Math.random() < 0.9) {
      const strategicRanges = [
        [BigInt(1), maxPageNumber / BigInt(10)], // Первые 10%
        [maxPageNumber / BigInt(4), maxPageNumber * BigInt(3) / BigInt(4)], // Середина
        [maxPageNumber * BigInt(9) / BigInt(10), maxPageNumber] // Последние 10%
      ];
      const randomRange = strategicRanges[Math.floor(Math.random() * strategicRanges.length)];
      const minPage = randomRange[0];
      const maxPage = randomRange[1];
      randomPage = minPage + BigInt(Math.floor(Math.random() * Number(maxPage - minPage + BigInt(1))));
    }
    // 10% случаев - страница в противоположной части диапазона
    else {
      if (currentPageBigInt !== null) {
        const midPage = maxPageNumber / BigInt(2);
        if (currentPageBigInt < midPage) {
          // Текущая страница в первой половине, генерируем во второй
          randomPage = midPage + BigInt(Math.floor(Math.random() * Number(maxPageNumber - midPage))) + BigInt(1);
      } else {
          // Текущая страница во второй половине, генерируем в первой
          randomPage = BigInt(Math.floor(Math.random() * Number(midPage))) + BigInt(1);
        }
      } else {
        randomPage = BigInt(Math.floor(Math.random() * Number(maxPageNumber))) + BigInt(1);
      }
    }
    
    // Дополнительная проверка: если новая страница слишком близка к текущей, генерируем новую
    if (currentPageBigInt !== null && Math.abs(Number(randomPage - currentPageBigInt)) < 100) {
      console.log('Page too close to current, regenerating...');
      return generateRandomPage(); // Рекурсивно генерируем новую страницу
    }
    
    return randomPage.toString();
  };

  // Функция для генерации страниц в тестовом режиме
  const generateTestPage = () => {
    // Чередуем: случайная страница, тестовая страница, случайная страница, тестовая страница...
    console.log('🔍 generateTestPage called, testPageIndex:', testPageIndex.current);
    console.log('🔍 testPages available:', testPages.current);
    
    if (testPageIndex.current % 2 === 0) {
      // Четный индекс - случайная страница
      console.log('🧪 Test mode: generating random page (index:', testPageIndex.current, 'is even)');
      return generateRandomPage();
    } else {
      // Нечетный индекс - тестовая страница
      const testPageIndexInArray = Math.floor(testPageIndex.current / 2) % testPages.current.length;
      const testPage = testPages.current[testPageIndexInArray];
      console.log('🧪 Test mode: using test page:', testPage, '(array index:', testPageIndexInArray, ')');
      return testPage;
    }
  };


  const playSoundFoundRecevied = () => {
    try {
      const audio = new Audio(foundReceived);
      audio.play().catch(error => {
        console.log(t('soundError') + ':', error.message);
      });
    } catch (error) {
      console.log(t('soundCreateError') + ':', error.message);
    }
  };

  const playSoundFoundFinal = () => {
    try {
      const audio = new Audio(foundFinal);
      audio.play().catch(error => {
        console.log(t('soundError') + ':', error.message);
      });
    } catch (error) {
      console.log(t('soundCreateError') + ':', error.message);
    }
  };

  // Функция для инициализации аудио после взаимодействия пользователя
  const initializeAudio = () => {
    if (!userInteracted) {
      setUserInteracted(true);
      // Создаем и сразу останавливаем аудио для "разблокировки"
      try {
        const audio = new Audio(foundReceived);
        audio.volume = 0;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch(() => {
          // Игнорируем ошибки при инициализации
        });
      } catch (error) {
        // Игнорируем ошибки при инициализации
      }
    }
  };

  const closeIntro = () => {
    setShowIntro(false);
    localStorage.setItem('hasSeenIntro', 'true');
  };

  const switchPosition = (position = null, keepResults = false) => {
    console.log('[DEBUG] switchPosition called. position:', position, 'keepResults:', keepResults, 'loading:', loading, 'autoMode:', autoMode, 'autoModeAI:', autoModeAI, 'puzzleMode:', puzzleMode);

    // Puzzle mode uses separate startPuzzleSearch/stopPuzzleSearch flow
    if (puzzleModeRef.current) {
      console.log('🎯 Puzzle mode active - use puzzle button instead');
      return;
    }

    if (loading && !autoModeRefAi.current) {
      return;
    }
    console.log('🔄 switchPosition called with position:', position, 'keepResults:', keepResults);
    console.log('🔄 Current testModeRef.current:', testModeRef.current);
    console.log('🔄 Current loading state:', loading);

    if (loading) {
      console.log('❌ switchPosition blocked - loading in progress');
      return;
    }

    if (position !== null) {
      // Если передана позиция, вычисляем страницу и переключаемся на неё
      const pageNumber = getPageFromPosition(position);
      console.log('📍 Switch position:', position, '-> Page:', pageNumber);
      switchToPage(pageNumber, keepResults);
    } else {
      // Если позиция не передана, генерируем страницу в зависимости от режима
      let pageToSwitch;
      if (testModeRef.current) {
        console.log('🧪 Test mode active, generating test page...');
        pageToSwitch = generateTestPage();
        testPageIndex.current++; // Увеличиваем индекс для следующего вызова
        console.log('🧪 Test mode: generated page:', pageToSwitch, 'new index:', testPageIndex.current);
      } else {
        console.log('🎲 Normal mode active, generating random page...');
        pageToSwitch = generateRandomPage();
        console.log('🎲 Normal mode: generated random page:', pageToSwitch);
      }
      switchToPage(pageToSwitch, keepResults);
    }
  }

  // Puzzle mode - starts continuous search with multiple workers
  const startPuzzleSearch = async () => {
    const puzzle = selectedPuzzleRef.current;
    if (!puzzle) {
      console.log('No puzzle selected');
      return;
    }

    // Количество потоков = количество ядер CPU (минимум 2, максимум 8)
    const numWorkers = Math.min(8, Math.max(2, navigator.hardwareConcurrency || 4));
    console.log(`Starting puzzle search with ${numWorkers} workers for:`, puzzle.address);

    // Сбрасываем результаты и статистику
    setResultsExists(false);
    setFinalBalance(0);
    setTotalReceived(0);
    puzzleWorkerStatsRef.current = {};

    // Останавливаем старые воркеры если есть
    puzzleWorkersRef.current.forEach(w => {
      try { w.terminate(); } catch (e) {}
    });
    puzzleWorkersRef.current = [];

    // Создаём новые воркеры
    for (let i = 0; i < numWorkers; i++) {
      try {
        const worker = await createAddressWorker();
        const workerId = i;

        worker.onmessage = (e) => {
          // Puzzle stats update
          if (e.data.puzzleStats) {
            const { keysChecked, speed } = e.data.puzzleStats;
            puzzleWorkerStatsRef.current[workerId] = { checked: keysChecked, speed };

            // Агрегируем статистику от всех воркеров
            const allStats = Object.values(puzzleWorkerStatsRef.current);
            const totalChecked = allStats.reduce((sum, s) => sum + s.checked, 0);
            const totalSpeed = allStats.reduce((sum, s) => sum + s.speed, 0);
            setPuzzleStats(prev => ({ ...prev, checked: totalChecked, speed: totalSpeed }));
            return;
          }

          // Puzzle search result (found!)
          if (e.data.puzzleResult) {
            console.log(`Worker ${workerId} found the key!`);
            // Останавливаем все воркеры
            stopPuzzleSearch();
            handlePuzzleSearchResult(e.data.puzzleResult);
            return;
          }
        };

        puzzleWorkersRef.current.push(worker);

        // Запускаем поиск на этом воркере
        worker.postMessage({
          puzzleSearch: {
            targetAddress: puzzle.address,
            rangeStart: puzzle.rangeStart,
            rangeEnd: puzzle.rangeEnd
          }
        });
      } catch (error) {
        console.error(`Failed to create worker ${i}:`, error);
      }
    }

    console.log(`Started ${puzzleWorkersRef.current.length} puzzle workers`);
  };

  // Stop puzzle search - stops all workers
  const stopPuzzleSearch = () => {
    console.log('Stopping all puzzle workers...');
    puzzleWorkersRef.current.forEach((worker, i) => {
      try {
        worker.postMessage({ puzzleStop: true });
        // Даём время на остановку, затем terminate
        setTimeout(() => {
          try { worker.terminate(); } catch (e) {}
        }, 100);
      } catch (e) {
        console.error(`Error stopping worker ${i}:`, e);
      }
    });
    puzzleWorkersRef.current = [];
    puzzleWorkerStatsRef.current = {};
  };

  // Обработка результата puzzle search из WASM (только когда нашли!)
  const handlePuzzleSearchResult = async (result) => {
    const puzzle = selectedPuzzleRef.current;

    if (!result.found) return;

    console.log('🎉🎉🎉 PUZZLE SOLVED via WASM!');
    console.log('Target:', result.address_found);
    console.log('Private Key WIF:', result.private_key_wif);
    console.log('Private Key HEX:', result.private_key_hex);
    console.log('Keys checked:', result.keys_checked);

    // Останавливаем поиск
    puzzleModeRef.current = false;
    setPuzzleMode(false);
    setAutoRunning(false);

    // Вычисляем номер страницы из приватного ключа
    // Формула: pageNumber = floor((privateKey - 1) / 128) + 1
    let calculatedPageNumber = null;
    if (result.private_key_hex) {
      try {
        const privateKeyBigInt = BigInt('0x' + result.private_key_hex);
        const pageNumberBigInt = (privateKeyBigInt - BigInt(1)) / BigInt(ADDRESSES_PER_BATCH) + BigInt(1);
        calculatedPageNumber = pageNumberBigInt.toString();
        console.log('Calculated page number:', calculatedPageNumber);
      } catch (e) {
        console.error('Failed to calculate page number:', e);
      }
    }

    // Запрашиваем реальный баланс найденного адреса с blockchain.info
    let balanceSatoshi = 0;
    let totalReceivedSatoshi = 0;
    try {
      const response = await fetch(`https://blockchain.info/balance?active=${result.address_found}`);
      if (response.ok) {
        const data = await response.json();
        if (data[result.address_found]) {
          balanceSatoshi = data[result.address_found].final_balance || 0;
          totalReceivedSatoshi = data[result.address_found].total_received || 0;
          console.log('Real balance fetched:', balanceSatoshi / 100000000, 'BTC');
        }
      }
    } catch (error) {
      console.error('Failed to fetch found address balance:', error);
      // Fallback на баланс puzzle
      const fallback = puzzleBalancesRef.current[puzzle?.id] || puzzle?.reward || 0;
      balanceSatoshi = Math.round(fallback * 100000000);
      totalReceivedSatoshi = balanceSatoshi;
    }

    // Сохраняем в историю, если есть баланс или история транзакций
    if (calculatedPageNumber && (balanceSatoshi > 0 || totalReceivedSatoshi > 0)) {
      console.log('Saving puzzle find to history, page:', calculatedPageNumber);
      await savePageToHistory(calculatedPageNumber, [result.address_found]);
    }

    // Показываем результат
    // Puzzle адреса - compressed, поэтому баланс идёт в compressedPublicKeyAddress
    setBalancesResult([{
      publicKeyAddress: { address: '', final_balance: 0, total_received: 0 },
      compressedPublicKeyAddress: { address: result.address_found, final_balance: balanceSatoshi, total_received: totalReceivedSatoshi },
      privateKeyWIFUncompressed: result.private_key_wif
    }]);
    setFinalBalance(balanceSatoshi);
    setTotalReceived(totalReceivedSatoshi);
    setResultsExists(true);
    setShowBalanceModal(true);
    setPermanentLock(true);
    playSoundFoundFinal();
  };

  const handlePositionChange = (newPosition) => {
    if (!loading && !autoMode && !autoModeAI) {
      // Вычисляем номер страницы из позиции
      const pageNumber = getPageFromPosition(newPosition);
      
      console.log('Position change:', newPosition, '-> Page:', pageNumber);
      
      // Переключаемся на соответствующую страницу
      switchToPage(pageNumber);
    }
  }

  const handleAutoStart = (position) => {
    if (!loading && !autoMode && !autoModeAI) {
      // Вычисляем номер страницы из позиции
      const pageNumber = getPageFromPosition(position);
      
      console.log('Auto start position:', position, '-> Page:', pageNumber);
      
      // Переключаемся на соответствующую страницу
      switchToPage(pageNumber);
    }
  }

  // Функции для работы со страницами
  const getPageFromPosition = (position) => {
    // Специальная обработка для позиции 100% (1.0)
    if (position === 1.0) {
      // Вычисляем максимальный номер страницы
      const maxKey = BigInt('0x' + MAX_PRIVATE_KEY);
      // Максимальная страница = (максимальный ключ - 1) / 128 + 1
      const maxPageNumber = (maxKey - BigInt(1)) / BigInt(ADDRESSES_PER_BATCH) + BigInt(1);
      console.log('Position 100% -> Max page:', maxPageNumber.toString());
      return maxPageNumber.toString();
    }
    
    // Генерируем приватный ключ из позиции
    const privateKeyHex = generatePrivateKeyFromPosition(position);
    const keyBigInt = BigInt('0x' + privateKeyHex);

    // Вычисляем номер страницы с округлением вверх (ceiling)
    // чтобы страница НАЧИНАЛАСЬ на введённом проценте или выше
    const pageNumber = (keyBigInt + BigInt(ADDRESSES_PER_BATCH) - BigInt(2)) / BigInt(ADDRESSES_PER_BATCH) + BigInt(1);
    return pageNumber;
  };

  const getPositionFromPage = (pageNumber) => {
    // pageNumber может быть BigInt или строкой
    const pageNumberBigInt = typeof pageNumber === 'bigint' ? pageNumber : BigInt(pageNumber);
    // Вычисляем начальный ключ: (страница - 1) * 128 + 1
    const startKeyBigInt = (pageNumberBigInt - BigInt(1)) * BigInt(ADDRESSES_PER_BATCH) + BigInt(1);
    const maxKey = BigInt('0x' + MAX_PRIVATE_KEY);
    
    // Проверяем, является ли это максимальной страницей
    const maxPageNumber = (maxKey - BigInt(1)) / BigInt(ADDRESSES_PER_BATCH) + BigInt(1);
    if (pageNumberBigInt >= maxPageNumber) {
      console.log('Max page detected, returning position 100%');
      return 1.0;
    }
    
    const position = Number(startKeyBigInt * BigInt(100000000) / maxKey) / 100000000;
    return position;
  };

  const getPrivateKeyFromPage = (pageNumber) => {
    // pageNumber может быть BigInt или строкой
    const pageNumberBigInt = typeof pageNumber === 'bigint' ? pageNumber : BigInt(pageNumber);
    
    // Вычисляем максимальный ключ и максимальную страницу
    const maxKey = BigInt('0x' + MAX_PRIVATE_KEY);
    const maxPageNumber = (maxKey - BigInt(1)) / BigInt(ADDRESSES_PER_BATCH) + BigInt(1);
    
    // Проверяем, является ли это максимальной страницей
    if (pageNumberBigInt >= maxPageNumber) {
      console.log('Max page detected, calculating last valid key');
      // Для последней страницы вычисляем начальный ключ так, чтобы последний ключ не превышал максимум
      // Последняя страница должна содержать ровно 64 адреса
      const lastValidKey = maxKey - BigInt(64) + BigInt(1);
      const startKeyBigInt = lastValidKey;
      return startKeyBigInt.toString(16).padStart(64, '0');
    }
    
    // Страница 1: ключи 1-128 (начинаем с 1)
    // Страница 2: ключи 129-256 (начинаем с 129)
    // Страница 3: ключи 257-384 (начинаем с 257)
    const startKeyBigInt = (pageNumberBigInt - BigInt(1)) * BigInt(ADDRESSES_PER_BATCH) + BigInt(1);
    return startKeyBigInt.toString(16).padStart(64, '0');
  };



  // Функция для переключения на страницу
  const switchToPage = (pageNumber, keepResults = false) => {
    // Используем ref для мгновенной проверки (React state асинхронный)
    if (loadingRef.current && !autoModeRefAi.current) {
      console.log('❌ switchToPage blocked - loadingRef.current is true');
      return;
    }

    // Если мы в puzzle mode, выходим из него перед переключением на страницу
    if (puzzleModeRef.current) {
      console.log('📍 Exiting puzzle mode to switch to page');
      puzzleModeRef.current = false;
      setPuzzleMode(false);
      setAutoRunning(false);
      // Останавливаем puzzle поиск в воркере
      if (workerRef.current) {
        workerRef.current.postMessage({ puzzleStop: true });
      }
    }

    // Инкрементируем ID запроса для защиты от race condition
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;
    console.log('🔄 New request ID:', currentRequestId);

    // Преобразуем pageNumber в BigInt для точных вычислений
    const pageNumberBigInt = BigInt(pageNumber);
    const pageNumberString = pageNumberBigInt.toString();
    
    console.log('Switching to page:', pageNumber, 'Type:', typeof pageNumber);
    console.log('Page number as BigInt:', pageNumberBigInt.toString());
    console.log('Page number as string:', pageNumberString);
    
    // Сбрасываем AI позицию только если не в AI режиме
    if (!autoModeRefAi.current) {
      setCurrentAiPosition(null);
    }
    
    // Сбрасываем результаты только если не нужно их сохранять
    if (!keepResults) {
      setResultsExists(false);
      setFinalBalance(0);
      setTotalReceived(0);
      // НЕ сбрасываем флаг найденного баланса при новом запуске
      // setBalanceFound(false);
    }
    
    setKeepResultsDuringLoading(keepResults);
    
    // Устанавливаем состояние загрузки в зависимости от режима
    loadingRef.current = true; // Мгновенно блокируем следующие запросы
    if (autoModeRefAi.current) {
      setAiLoading(true);
    } else {
      setLoading(true);
    }

    const position = getPositionFromPage(pageNumberBigInt);
    const privateKeyHex = getPrivateKeyFromPage(pageNumberBigInt);
    
    // Вычисляем правильные диапазоны ключей
    const maxKey = BigInt('0x' + MAX_PRIVATE_KEY);
    const maxPageNumber = (maxKey - BigInt(1)) / BigInt(ADDRESSES_PER_BATCH) + BigInt(1);
    let expectedStart, expectedEnd;
    let addressesToGenerate = ADDRESSES_PER_BATCH;
    
    if (pageNumberBigInt >= maxPageNumber) {
      // Для последней страницы
      expectedStart = Number(maxKey - BigInt(64) + BigInt(1));
      expectedEnd = Number(maxKey);
      addressesToGenerate = 64; // Последняя страница содержит 64 адреса
    } else {
      // Для обычных страниц
      expectedStart = Number((pageNumberBigInt - BigInt(1)) * BigInt(ADDRESSES_PER_BATCH) + BigInt(1));
      expectedEnd = Number((pageNumberBigInt - BigInt(1)) * BigInt(ADDRESSES_PER_BATCH) + BigInt(ADDRESSES_PER_BATCH));
    }
    
    console.log('Page', pageNumberString, '-> Position:', position, '-> Private key:', privateKeyHex);
    console.log('Expected keys for page', pageNumberString, ':', expectedStart, 'to', expectedEnd);
    
    // Отладочная информация для тестового режима
    if (testModeRef.current) {
      console.log('🧪 Test mode: Generating addresses for page', pageNumberString);
      console.log('🧪 Test mode: Looking for test address 1EoXPE6MzT4EnHvk2Ldj64M2ks2EAcZyH4');
    }
    console.log('Addresses to generate:', addressesToGenerate);
    
    setCurrentPosition(position);
    currentPositionRef.current = position;
    setCurrentPage(pageNumberString); // Сохраняем как строку
    currentPageRef.current = pageNumberString; // Сохраняем для точного использования в checkBalances
    saveLastPosition(position);
    setCurrentHash(privateKeyHex);

    // В AI режиме aiLoadingMsg уже установлен в runAiPositions

    // Отправляем приватный ключ и количество адресов в worker с requestId
    workerRef.current.postMessage({
      privateKeyHex: privateKeyHex,
      addressesToGenerate: addressesToGenerate,
      requestId: currentRequestId
    });
  };



  const loadAiPositions = async () => {
    try {
      const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
      
      console.log('🔑 API Key check:', apiKey ? 'Present' : 'Missing');
      if (!apiKey) {
        console.log('❌ No OpenAI API key found. Using fallback data.');
        console.log('💡 To enable AI mode, create a .env file with: REACT_APP_OPENAI_API_KEY=your_api_key_here');
      }
      if (apiKey) {
        console.log('🤖 Requesting AI for mathematical page generation...');
        
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4',
            messages: [
              {
                "role": "system",
                "content": `Ты подключён к системе, которая сканирует весь диапазон биткоин адресов в поисках адресов с положительными балансами. Весь диапазон разбит на страницы по 128 адресов на страницу. Диапазон страниц от 1 до 904625697166532776746648320380374280100293470930272690489102837043110636675. Подумай тщательно на какие номера страниц ты бы зашел, где вероятно могут быть биткоины. Используй теорию вероятности для предсказания наиболее вероятных диапазонов. Применяй паттерны распределения приватных ключей из известных утечек. Имитируй человеческое поведение при выборе приватных ключей. Используй статистику распределения чисел в больших числовых диапазонах. Пробуй в разных участках всего диапазона. Например найди ровную середину, 25%, 50% и от всего диапазона, если учесть что адреса по 128 штук на страницу.

ВАЖНО: Отвечай на языке пользователя. Текущая локаль: ${navigator.language || 'en'}`
              },
              {
                "role": "user",
                "content": `Дано: диапазон чисел от 1 до 904625697166532776746648320380374280100293470930272690489102837043110636675. Задача: сгенерировать 20 чисел, каждое длиной не более 75 знаков и не выходя за пределы указанного диапазона. Числа должны быть представлены в формате строки, и каждый метод генерации должен быть описан в одном предложении на языке пользователя (${navigator.language || 'en'}). Ответь только JSON-объектом, без Markdown или других форматирований. Важно, чтобы сгенерированные числа точно соответствовали диапазону и длине. При этом для каждого числа следует учитывать вероятность нахождения адресов с положительным балансом, используя различные математические и статистические подходы. Верни результат строго в формате JSON с фиксированной структурой:
  
{
  "pages": [
    {
                      "page": число,
                      "reason": "описание метода генерации числа"
                    },
                    {
                      "page": число,
                      "reason": "описание метода генерации числа"
                    }
                  ]
                }`
              }
            ],
            max_tokens: 4000,
            temperature: 1,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );
  
        // Парсинг ответа OpenAI
        const generatedData = response.data.choices[0].message.content;
        
        const result = JSON.parse(generatedData);
        console.log('generated pages:', result.pages?.length || 0);
        const validPages = validatePages(result.pages);
        console.log('after validation:', validPages.length);
        // Помещаем в aiPositions только валидные страницы
        aiPositions.current = validPages;
        
        // Проверяем, что мы все еще в режиме Auto-AI
        if (autoModeRefAi.current) {
          runAiPositions();
        } else {
          console.log('Auto-AI mode disabled, ignoring OpenAI response');
      }
    } else {
      const result = {
        "pages": [
          {
              "page": 78125,
              "reason": "Address 10000000 - round 10 million"
          },
          {
              "page": 123456,
              "reason": "Sequential pattern"
          },
          {
              "page": 500000,
              "reason": "Address 64000000 - round 64 million"
          },
          {
              "page": 1000000,
              "reason": "Address 128000000 - round 128 million"
          },
          {
              "page": 999999,
              "reason": "Address 127999872 - almost 128 million"
          },
          {
              "page": 2009,
              "reason": "Bitcoin creation year"
          },
          {
              "page": 2010,
              "reason": "Early Bitcoin year"
          },
          {
              "page": 111111,
              "reason": "Repeating pattern"
          },
          {
              "page": 888888,
              "reason": "Lucky number pattern"
          },
          {
              "page": 123123,
              "reason": "Repeating sequence"
          }
        ]
      }

      const validPages = validatePages(result.pages);

      // Помещаем в aiPositions только валидные страницы
      aiPositions.current = validPages;
      
      // Проверяем, что мы все еще в режиме Auto-AI
      if (autoModeRefAi.current) {
        runAiPositions();
      } else {
        console.log('Auto-AI mode disabled, ignoring test data');
      }
      }
    } catch (error) {
      setAiLoadingMsg(null);
      // В случае ошибки генерируем случайную страницу
      const randomPage = generateRandomPage();
      console.log('AI mode: Error occurred, generating random page:', randomPage);
      setAiLoading(true);
      switchToPage(randomPage, true);
      console.error(error);
    }
  };

  function validatePages(pages) {
    const validPages = pages.filter(pageObj => {
      // Проверяем, что page и reason существуют
      if (typeof pageObj.page !== 'string' || 
          typeof pageObj.reason !== 'string') {
        return false;
      }

      // Проверяем, что page состоит только из цифр
      if (!/^\d+$/.test(pageObj.page)) {
          return false;
      }
  
      // Проверка, что число не выходит за пределы диапазона
      const min = 1;
      const max = "904625697166532776746648320380374280100293470930272690489102837043110636675";
      if (pageObj.page.length > 75 || BigInt(pageObj.page) < BigInt(min) || BigInt(pageObj.page) > BigInt(max)) {
        return false;
      }
  
      // Проверка, что причина не пустая
      if (pageObj.reason.trim() === '') {
        return false;
      }
  
      return true;
    });
  
    return validPages;
  }




  
  const runAiPositions = async () => {
    try {
      // Проверяем, что мы все еще в режиме Auto-AI
      if (!autoModeRefAi.current) {
        console.log('Auto-AI mode disabled, stopping AI positions processing');
        return;
      }
      
      if (aiPositions.current && Array.isArray(aiPositions.current) && aiPositions.current.length > 0) {
        const [firstEntry, ...remainingEntries] = aiPositions.current;

        // Обновляем счетчик сразу
        aiPositions.current = remainingEntries;

        // Устанавливаем состояние загрузки сразу
        setAiLoading(true);
        
        // Показываем причину генерации и количество оставшихся
        setCurrentAiPosition({
          page: parseInt(firstEntry.page),
          method: firstEntry.reason
        });
        setAiLoadingMsg(t('generatingAI'));
        
        // Пауза для показа метода
        await new Promise(resolve => setTimeout(resolve, 3000));

        setAiLoadingMsg(null);

        // Используем номер страницы напрямую
        const pageNumber = parseInt(firstEntry.page);
        console.log('AI page:', pageNumber);
        
        // Переключаемся на соответствующую страницу, сохраняя результаты
        switchToPage(pageNumber, true);

      } else {
        // Если нет данных от ИИ, генерируем случайную страницу
        const randomPage = generateRandomPage();
        console.log('AI mode: No AI data, generating random page:', randomPage);
        setAiLoadingMsg(null);
        setAiLoading(true); // Устанавливаем aiLoading в true
        switchToPage(randomPage, true);
      }
      
    } catch (e) {
      // В случае ошибки тоже генерируем случайную страницу
      const randomPage = generateRandomPage();
      console.log('AI mode: Error occurred, generating random page:', randomPage);
      setAiLoadingMsg(null);
      setAiLoading(true); // Устанавливаем aiLoading в true
      switchToPage(randomPage, true);
    }
  }

  const switchPositionAi = () => {
    // Проверяем, что мы в режиме Auto-AI
    if (!autoModeRefAi.current) {
      console.log('Auto-AI mode disabled, ignoring switchPositionAi call');
      return;
    }
    
    if (aiLoading) {
      return;
    }

    if (aiPositions.current.length === 0) {
      setAiLoading(true);
      setAiLoadingMsg(t('requestingGPT'));
      loadAiPositions();
    } else {
      runAiPositions();
    }
  }

  const checkBalances = async (newData, position) => {
    console.log('[DEBUG] checkBalances called. position:', position, 'newData:', newData);
    // Номер страницы теперь управляется напрямую через switchToPage
    // Не перезаписываем currentPage здесь
    
    const publicKeyAddresses = newData.map(addr => addr.publicKey);
    const compressedKeyAddresses = newData.map(addr => addr.compressedPublicKey);
    
    const fetchBalances = async (addresses, type) => {
      // Используем правильное состояние сообщений в зависимости от режима
      if (autoModeRefAi.current) {
        setAiLoadingMsg(t('checkingBalances'));
      } else {
        setLoadingMsg(t('checkingBalances'));
      }
      const url = `https://blockchain.info/balance?cors=true&active=${addresses.join(',')}`;
      try {
        const response = await fetch(url);
        if (response.status === 200) {
          const data = await response.json();

          // Формируем результат
          const results = addresses.map(address => {
            let final_balance = data[address]?.final_balance;
            let total_received = data[address]?.total_received;
            
            // Подмена баланса в тестовом режиме для адреса 1EoXPE6MzT4EnHvk2Ldj64M2ks2EAcZyH4
            if (testModeRef.current && address === '1EoXPE6MzT4EnHvk2Ldj64M2ks2EAcZyH4') {
              final_balance = 100000000; // 1 BTC в сатоши
              total_received = 100000000; // 1 BTC в сатоши
              console.log('🧪 Test mode: Substituted balance for 1EoXPE6MzT4EnHvk2Ldj64M2ks2EAcZyH4 -> 1 BTC');
            }
            // Подмена баланса в тестовом режиме для существующего тестового адреса
            else if (testModeRef.current && address === '12r67zedaTdQ37FVj42thJu2tnPkwtje1X') {
              final_balance = 100000000; // 1 BTC в сатоши
              total_received = 100000000; // 1 BTC в сатоши
              console.log('🧪 Test mode: Substituted balance for 12r67zedaTdQ37FVj42thJu2tnPkwtje1X -> 1 BTC');
            }
            // Отладочная информация для тестового режима
            if (testModeRef.current) {
              console.log('🧪 Test mode: Checking address:', address, 'Balance:', final_balance, 'Received:', total_received);
            }
            // Существующая подмена для тестового адреса (только если не в тестовом режиме)
            else if (address === '12r67zedaTdQ37FVj42thJu2tnPkwtje1X') {
              final_balance = 12345;
              total_received = 12345;
            }
            
            return {
              address: address,
              final_balance: final_balance,
              total_received: total_received,
              privateKeyWIFUncompressed: newData.find(addr => addr[type] === address)?.privateKeyWIFUncompressed
            };
          });

          return results;
          
        } else {
          throw new Error(`Response status: ${response.status}`);
        }
      } catch (error) {
        console.error('Ошибка при выполнении запроса:', error);
        return [];
      }
    };

    const [publicKeyResults, compressedKeyResults] = await Promise.all([
        fetchBalances(publicKeyAddresses, 'publicKey'),
        fetchBalances(compressedKeyAddresses, 'compressedPublicKey')
    ]);

    let combinedResults = publicKeyResults.map((pubKeyResult, index) => ({
        publicKeyAddress: pubKeyResult,
        compressedPublicKeyAddress: compressedKeyResults[index],
        privateKeyWIFUncompressed: pubKeyResult.privateKeyWIFUncompressed, // Предполагая, что они совпадают
        originalIndex: index // Сохраняем исходный индекс
    }));

    // Убираем сортировку, чтобы сохранить исходный порядок по ключам
    // combinedResults = combinedResults.sort((a, b) => {
    //     const maxReceivedA = Math.max(a.publicKeyAddress.total_received, a.compressedPublicKeyAddress.total_received);
    //     const maxReceivedB = Math.max(b.publicKeyAddress.total_received, b.compressedPublicKeyAddress.total_received);
    //     return maxReceivedB - maxReceivedA;
    // });

    console.log('Combined results order:', combinedResults.map((result, i) => ({
        index: i,
        originalIndex: result.originalIndex,
        address: result.publicKeyAddress.address,
        final_balance: result.publicKeyAddress.final_balance
    })));

    // Проверка на хотя бы один положительный общий полученный баланс (total_received)
    const hasNonZeroBalanceTotal = combinedResults.some(result => 
      result.publicKeyAddress.total_received > 0 || result.compressedPublicKeyAddress.total_received > 0
    );

    // Проверка на хотя бы один положительный итоговый баланс (final_balance)
    const hasNonZeroBalanceFinal = combinedResults.some(result => 
      result.publicKeyAddress.final_balance > 0 || result.compressedPublicKeyAddress.final_balance > 0
    );
    
    console.log('🔍 Balance check results:');
    console.log('  - hasNonZeroBalanceTotal:', hasNonZeroBalanceTotal);
    console.log('  - hasNonZeroBalanceFinal:', hasNonZeroBalanceFinal);
    console.log('  - testModeRef.current:', testModeRef.current);
    console.log('  - combinedResults:', combinedResults.map(r => ({
      address: r.publicKeyAddress.address,
      final_balance: r.publicKeyAddress.final_balance,
      total_received: r.publicKeyAddress.total_received
    })));

    
    // Если найден хотя бы один адрес с ненулевым балансом или историей, сохраняем в IndexedDB
    if (hasNonZeroBalanceFinal) {
      console.log('💰 Found positive balance! Setting balanceFound = true');
      if (testModeRef.current) {
        console.log('🧪 Test mode: This should trigger UI blocking');
      }
      playSoundFoundFinal(); // ВСЕГДА проигрываем звук при реальных биткоинах
      // Останавливаем все режимы и устанавливаем флаг найденного баланса
      autoModeRef.current = false;
      autoModeRefAi.current = false;
      puzzleModeRef.current = false;
      setAutoMode(false);
      setAutoModeAI(false);
      setPuzzleMode(false);
      setAutoRunning(false); // Сбрасываем флаг запущенного авто режима
      setShowBalanceModal(true);
      setPermanentLock(true); // <--- добавлено
      // Сбрасываем состояния загрузки для AI режима
      setAiLoading(false);
      setAiLoadingMsg(null);
      const addresses = combinedResults.map(result => result.publicKeyAddress.address);
      // Используем сохранённый номер страницы напрямую (без потери точности)
      await savePageToHistory(currentPageRef.current, addresses);
    } else if (hasNonZeroBalanceTotal) {
      // В ручном режиме всегда проигрываем звук истории, если включён
      console.log('[SOUND DEBUG] hasNonZeroBalanceTotal:', hasNonZeroBalanceTotal, 'soundEnabled:', soundEnabledRef.current, 'autoModeRef.current:', autoModeRef.current, 'autoModeRefAi.current:', autoModeRefAi.current);
      if (soundEnabledRef.current && !autoModeRef.current && !autoModeRefAi.current) {
        console.log('[SOUND DEBUG] Playing sound for history (manual mode)');
      playSoundFoundRecevied();
      } else if (soundEnabledRef.current && (autoModeRef.current || autoModeRefAi.current)) {
        console.log('[SOUND DEBUG] Playing sound for history (auto mode)');
        playSoundFoundRecevied();
      }
      const addresses = combinedResults.map(result => result.publicKeyAddress.address);
      // Используем сохранённый номер страницы напрямую (без потери точности)
      await savePageToHistory(currentPageRef.current, addresses);
    }

    setBalancesResult(combinedResults);
    updateTotalBalances([...publicKeyResults, ...compressedKeyResults]); // Обновление общих балансов
    
    // Используем правильное состояние для AI режима
    loadingRef.current = false; // Сбрасываем ref для разблокировки новых запросов
    if (autoModeRefAi.current) {
      // Очищаем сообщение загрузки для показа результатов
      setAiLoadingMsg(null);
      // Временно сбрасываем aiLoading для показа результатов
      setAiLoading(false);
      // Пауза для показа результатов
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      setLoading(false);
    }
    
    setResultsExists(true);

    if ((!hasNonZeroBalanceFinal && autoModeRef.current) || (!hasNonZeroBalanceFinal && autoModeRefAi.current)) {
      if (hasNonZeroBalanceTotal) {
        if (autoModeRef.current) {
          setTimeout(()=>{switchPosition(null, false)},3500);
        }

        if (autoModeRefAi.current) {
          setTimeout(()=>{runAiPositions()},4000);
        }
      } else {
        if (autoModeRef.current) {
          setTimeout(()=>{switchPosition(null, false)},100);
        }

        if (autoModeRefAi.current) {
          setTimeout(()=>{
            // Дополнительная проверка режима Auto-AI перед продолжением
            if (!autoModeRefAi.current) {
              console.log('Auto-AI mode disabled during timeout, stopping');
              return;
            }

            // Сбрасываем состояние только перед следующей итерацией
            setFinalBalance(0);
            setTotalReceived(0);
            // Проверяем, есть ли еще страницы для обработки
            if (aiPositions.current.length > 0) {
              runAiPositions();
            } else {
              // Если страницы закончились, запрашиваем новые у GPT
              setAiLoadingMsg(t('requestingGPT'));
              loadAiPositions();
            }
          },4000);
        }
      }
    }
};


  const updateTotalBalances = (results) => {
    const totalFinalBalance = results.reduce((acc, item) => acc + item.final_balance, 0);
    const totalTotalReceived = results.reduce((acc, item) => acc + item.total_received, 0);
    setFinalBalance(totalFinalBalance);
    setTotalReceived(totalTotalReceived);
  }

  // Используем импортированную функцию formatBalance




  useEffect(() => {
    console.log('🔒 useEffect finalBalance/totalReceived:', { finalBalance, totalReceived, autoMode, autoModeAI });
    if (finalBalance > 0) {
      console.log('🔒 Setting locked state for finalBalance > 0');
      setLockedSeconds(3600); 
      setLocked(true);
      const interval = setInterval(() => {
        setLockedSeconds(prevSeconds => prevSeconds > 0 ? prevSeconds - 1 : 0);
      }, 1000);
      
      const timer = setTimeout(() => {
        setLocked(false);
        clearInterval(interval); // Очищаем интервал, когда время истекло
      }, 3600000); // Блокировка на 3600 секунд

      return () => {
        clearTimeout(timer);
        clearInterval(interval);
        setLocked(false);
        setLockedSeconds(0);
      };
    } else if (totalReceived > 0 && !autoMode && !autoModeAI) {
      // В авто режимах блокируем только при реальном балансе, в ручном - и при истории
      console.log('🔒 Setting locked state for totalReceived > 0 in manual mode');
      setLockedSeconds(3); 
      setLocked(true);
      const interval = setInterval(() => {
        setLockedSeconds(prevSeconds => prevSeconds > 0 ? prevSeconds - 1 : 0);
      }, 1000);
      
      const timer = setTimeout(() => {
        setLocked(false);
        clearInterval(interval); // Очищаем интервал, когда время истекло
      }, 3000); // Блокировка на 3 секунды

      return () => {
        clearTimeout(timer);
        clearInterval(interval);
        setLocked(false);
        setLockedSeconds(0);
      };
    }
  }, [totalReceived, autoMode, autoModeAI]);

  // Звуковой эффект при показе полноэкранного сообщения о найденном балансе
  useEffect(() => {
    console.log('🔒 useEffect balanceFound:', balanceFound);
    if (balanceFound) {
      console.log('🔒 balanceFound = true, showing modal and blocking UI');
      // Инициализируем аудио при первом показе сообщения
      initializeAudio();
      // playSoundFoundFinal(); // УБРАНО: звук теперь только в checkBalances
      // Блокируем скролл body
      document.body.classList.add('found-balance-open');
    } else {
      console.log('🔒 balanceFound = false, hiding modal and unblocking UI');
      // Разблокируем скролл body
      document.body.classList.remove('found-balance-open');
    }
    
    // Очистка при размонтировании
    return () => {
      document.body.classList.remove('found-balance-open');
    };
  }, [balanceFound]);

  // Функции для управления тестовым режимом через консоль браузера
  useEffect(() => {
    // Делаем функции доступными в глобальной области видимости
    window.bitkeeTestMode = {
      // Включить тестовый режим
      enable: () => {
        setTestMode(true);
        testPageIndex.current = 0; // Сбрасываем индекс
        console.log('🧪 Test mode ENABLED');
        console.log('📋 Test pages:', testPages.current);
        console.log('🔄 Pattern: random page -> test page -> random page -> test page...');
        console.log('🔧 Next steps:');
        console.log('   1. Enable auto mode (click "Auto" button)');
        console.log('   2. Click "Start" button to begin testing');
        console.log('   3. Watch console for test page generation');
      },
      
      // Выключить тестовый режим
      disable: () => {
        setTestMode(false);
        console.log('🧪 Test mode DISABLED');
      },
      
      // Проверить статус тестового режима
      status: () => {
        console.log('🧪 Test mode status:', testMode ? 'ENABLED' : 'DISABLED');
        console.log('📋 Test pages:', testPages.current);
        console.log('📊 Current index:', testPageIndex.current);
        console.log('🔧 Auto mode status:', autoMode ? 'ENABLED' : 'DISABLED');
        console.log('🔧 Auto-AI mode status:', autoModeAI ? 'ENABLED' : 'DISABLED');
        console.log('🔧 Loading status:', loading ? 'IN PROGRESS' : 'IDLE');
        return testMode;
      },
      
      // Добавить тестовую страницу
      addPage: (pageNumber) => {
        if (typeof pageNumber === 'string' || typeof pageNumber === 'number') {
          testPages.current.push(pageNumber.toString());
          console.log('✅ Added test page:', pageNumber);
          console.log('📋 All test pages:', testPages.current);
        } else {
          console.error('❌ Invalid page number. Use string or number.');
        }
      },
      
      // Удалить тестовую страницу по индексу
      removePage: (index) => {
        if (index >= 0 && index < testPages.current.length) {
          const removed = testPages.current.splice(index, 1)[0];
          console.log('🗑️ Removed test page at index', index, ':', removed);
          console.log('📋 Remaining test pages:', testPages.current);
        } else {
          console.error('❌ Invalid index. Available indices:', testPages.current.map((_, i) => i));
        }
      },
      
      // Показать все тестовые страницы
      listPages: () => {
        console.log('📋 Test pages:');
        testPages.current.forEach((page, index) => {
          console.log(`  ${index}: ${page}`);
        });
      },
      
      // Сбросить индекс (начать с начала)
      resetIndex: () => {
        testPageIndex.current = 0;
        console.log('🔄 Reset test page index to 0');
      },
      
      // Установить индекс вручную
      setIndex: (index) => {
        if (typeof index === 'number' && index >= 0) {
          testPageIndex.current = index;
          console.log('📊 Set test page index to:', index);
        } else {
          console.error('❌ Invalid index. Use a non-negative number.');
        }
      },
      
      // Очистить все тестовые страницы
      clearPages: () => {
        testPages.current = [];
        console.log('🗑️ Cleared all test pages');
      },
      
      // Установить стандартные тестовые страницы
      setDefaultPages: () => {
        testPages.current = [
          '1', // Первая страница - должна содержать тестовый адрес
          '2', // Вторая страница
          '3', // Третья страница
          '904625697166532776746648320380374280100293470930272690489102837043110636675' // Последняя страница
        ];
        console.log('🔄 Set default test pages:', testPages.current);
      },
      
      // Помощь
      help: () => {
        console.log('🧪 BitKee Test Mode Commands:');
        console.log('  bitkeeTestMode.enable()     - Enable test mode');
        console.log('  bitkeeTestMode.disable()    - Disable test mode');
        console.log('  bitkeeTestMode.status()     - Show current status');
        console.log('  bitkeeTestMode.addPage(page) - Add test page');
        console.log('  bitkeeTestMode.removePage(index) - Remove test page by index');
        console.log('  bitkeeTestMode.listPages()  - List all test pages');
        console.log('  bitkeeTestMode.resetIndex() - Reset page index to 0');
        console.log('  bitkeeTestMode.setIndex(n)  - Set page index to n');
        console.log('  bitkeeTestMode.clearPages() - Clear all test pages');
        console.log('  bitkeeTestMode.setDefaultPages() - Set default test pages');
        console.log('  bitkeeTestMode.help()       - Show this help');
        console.log('');
        console.log('📋 Pattern: random page -> test page -> random page -> test page...');
        console.log('🎯 Use with auto mode for testing!');
        console.log('💰 Test address 1EoXPE6MzT4EnHvk2Ldj64M2ks2EAcZyH4 will show 1 BTC balance in test mode');
      }
    };
    
    // Показываем информацию о тестовом режиме при загрузке
    console.log('🧪 BitKee Test Mode loaded! Type bitkeeTestMode.help() for commands.');
    
    // Очищаем при размонтировании
    return () => {
      delete window.bitkeeTestMode;
    };
  }, [testMode]);

  return (
    <div className="App">
      {/* Background layers */}
      <div className="bg-grid" />
      <div className="bg-noise" />

      {/* Intro modal */}
      {showIntro && (
        <div className="intro-overlay">
          <div className="intro-modal">
            <div className="intro-header">
              <h2>BitKeys</h2>
              <button className="intro-close-btn" onClick={closeIntro}>
                <X size={14} />
              </button>
            </div>
            <div className="intro-content">
              <p><strong>{t('introWhatIsThis')}</strong></p>
              <p>{t('introDescription')}</p>

              <p><strong>{t('introHowItWorks')}</strong></p>
              <ul>
                <li><strong>{t('introManualMode')}</strong> {t('introManualModeDesc')}</li>
                <li><strong>{t('introAutoMode')}</strong> {t('introAutoModeDesc')}</li>
                <li><strong>{t('introPuzzleMode')}</strong> {t('introPuzzleModeDesc')}</li>
              </ul>

              <p><strong>{t('introWhatHappens')}</strong></p>
              <p>{t('introWhatHappensDesc')}</p>

              <p><strong>{t('introSecurity')}</strong></p>
              <p>{t('introSecurityDesc')}</p>

              <p><strong>⚠️ {t('introImportant')}</strong></p>
              <p>{t('introImportantDesc')}</p>
            </div>
            <div className="intro-footer">
              <button className="intro-start-btn" onClick={closeIntro}>
                {t('introStartBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Community 
        setShowHistory={setShowHistory} 
        onInitializeAudio={initializeAudio}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        setShowIntro={setShowIntro}
      />
      <div className='content'>
    
              {showHistory && <History 
                setShowHistory={setShowHistory} 
                getHistoryFromDB={getHistoryFromDB} 
                switchPosition={switchPosition} 
                switchToPage={switchToPage}
                onInitializeAudio={initializeAudio}
              />}
      
      {showResults && (resultsExists || keepResultsDuringLoading) ? (
        <Results formatBalance={formatBalance} balancesResult={balancesResult} setShowResults={setShowResults} onInitializeAudio={initializeAudio}/>
      ) : (
        <>
          {/* Mode Switcher - сверху над основным блоком */}
          {(currentPosition !== null || autoModeAI === true) && !permanentLock && (
            <div className="mode-switcher">
              <button
                className={`mode-btn ${!puzzleMode ? 'active' : ''}`}
                onClick={() => {
                  if (puzzleMode) {
                    initializeAudio();
                    // Останавливаем puzzle mode
                    puzzleModeRef.current = false;
                    setPuzzleMode(false);
                    setAutoRunning(false);
                    loadingRef.current = false;
                    setLoading(false);
                    setPuzzleStats({ checked: 0, startTime: null, speed: 0 });
                  }
                }}
              >
                {t('pagesMode')}
              </button>
              <button
                className={`mode-btn puzzle ${puzzleMode ? 'active' : ''}`}
                onClick={() => {
                  if (!puzzleMode) {
                    initializeAudio();
                    // Останавливаем pages mode и включаем puzzle
                    autoModeRef.current = false;
                    setAutoMode(false);
                    setAutoModeAI(false);
                    setAutoRunning(false);
                    setLocked(false);
                    setLockedSeconds(0);
                    loadingRef.current = false;
                    setLoading(false);
                    setPuzzleMode(true);
                    puzzleModeRef.current = false; // Не стартуем сразу
                    setPuzzleStats({ checked: 0, startTime: null, speed: 0 });
                    // Загружаем актуальные балансы пазлов
                    fetchPuzzleBalances();
                  }
                }}
              >
                {t('puzzleMode')}
              </button>
            </div>
          )}

          {/* PUZZLE MODE UI */}
          {puzzleMode && selectedPuzzle && (
            <div className="puzzle-mode-container">
              <div className="puzzle-panel-full">
                <div className="puzzle-selector-section">
                  <select
                    value={selectedPuzzle.id}
                    onChange={(e) => {
                      selectPuzzle(parseInt(e.target.value));
                      setPuzzleStats({ checked: 0, startTime: null, speed: 0 });
                    }}
                    disabled={autoRunning}
                    className="puzzle-select-large"
                  >
                    {BITCOIN_PUZZLES.map(puzzle => {
                      const solved = isPuzzleSolved(puzzle.id);
                      const balanceLoaded = puzzleBalances[puzzle.id] !== undefined;
                      const balance = balanceLoaded ? puzzleBalances[puzzle.id] : puzzle.reward;
                      const balanceText = puzzleBalancesLoading && !balanceLoaded
                        ? 'Loading...'
                        : (solved ? '✓ SOLVED' : `${balance.toFixed(2)} BTC`);
                      return (
                        <option key={puzzle.id} value={puzzle.id}>
                          {puzzle.name} — {balanceText}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="puzzle-target-section">
                  <span className="puzzle-target-label">{t('targetAddress')}</span>
                  <div className="puzzle-target-row">
                    <span className="puzzle-target-addr">{selectedPuzzle.address}</span>
                    <a
                      href={`https://www.blockchain.com/explorer/addresses/btc/${selectedPuzzle.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="puzzle-explorer-link"
                      title={t('openExplorer')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  </div>
                </div>

                {/* Show SOLVED badge or reward */}
                {isPuzzleSolved(selectedPuzzle.id) ? (
                  <div className="puzzle-solved-section">
                    <span className="puzzle-solved-badge">✓ SOLVED</span>
                    {selectedPuzzle.solvedDate && (
                      <span className="puzzle-solved-date">{selectedPuzzle.solvedDate}</span>
                    )}
                  </div>
                ) : (
                  <div className="puzzle-reward-section">
                    {puzzleBalancesLoading && puzzleBalances[selectedPuzzle.id] === undefined ? (
                      <span className="puzzle-reward-loading">Loading balance...</span>
                    ) : (
                      <>
                        <span className="puzzle-reward-amount">
                          {puzzleBalances[selectedPuzzle.id] !== undefined
                            ? `${puzzleBalances[selectedPuzzle.id].toFixed(8)} BTC`
                            : `~${selectedPuzzle.reward} BTC`}
                        </span>
                        <span className="puzzle-reward-usd">
                          ≈ ${Math.round((puzzleBalances[selectedPuzzle.id] || selectedPuzzle.reward) * 95000).toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {puzzleStats.startTime && (
                  <div className="puzzle-stats-section">
                    <div className="puzzle-stat-item">
                      <span className="stat-value">{puzzleStats.checked.toLocaleString()}</span>
                      <span className="stat-label">{t('keysChecked')}</span>
                    </div>
                    <div className="puzzle-stat-item">
                      <span className="stat-value">~{puzzleStats.speed.toLocaleString()}</span>
                      <span className="stat-label">{t('keysPerSec')}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Puzzle Start/Stop button */}
              <div className="puzzle-start-section">
                {isPuzzleSolved(selectedPuzzle.id) ? (
                  <button
                    className="universal-btn puzzle-btn solved-disabled"
                    disabled
                  >
                    {t('puzzleSolved')}
                  </button>
                ) : (
                  <button
                    className={`universal-btn puzzle-btn ${autoRunning ? 'running' : ''}`}
                    onClick={() => {
                      initializeAudio();
                      if (autoRunning) {
                        // Stop - keep stats visible, worker keeps running until stopped
                        stopPuzzleSearch();
                        puzzleModeRef.current = false;
                        setAutoRunning(false);
                      } else {
                        // Start - reset stats and begin continuous search
                        puzzleModeRef.current = true;
                        setAutoRunning(true);
                        setPuzzleStats({ checked: 0, startTime: Date.now(), speed: 0 });
                        startPuzzleSearch();
                      }
                    }}
                  >
                    {autoRunning ? t('stop') : t('start')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* PAGES MODE UI */}
          {!puzzleMode && (currentPosition !== null || autoModeAI === true) && <PageNumber
            aiPositions={aiPositions.current}
            autoModeAI={autoModeAI}
            currentAiPosition={currentAiPosition}
            resultsExists={resultsExists || keepResultsDuringLoading}
            setShowResults={setShowResults}
            position={currentPosition}
            currentHash={currentHash}

            final={finalBalance > 0}
            total={totalReceived > 0}
            isManualMode={!autoMode && !autoModeAI}
            isScanning={loading || aiLoading}
            balanceFound={permanentLock}
            onPositionChange={handlePositionChange}
            onAutoStart={handleAutoStart}
            onSwitchToPage={switchToPage}
            currentPage={currentPage}
            onInitializeAudio={initializeAudio}

            isLoading={loading || aiLoading}
            finalBalance={finalBalance}
            totalReceived={totalReceived}
            formatBalance={formatBalance}

            puzzleMode={false}
            selectedPuzzle={null}
            puzzleStats={null}
            puzzles={null}
            onSelectPuzzle={null}
            onTogglePuzzleMode={null}
          />}

          {/* Start/Stop button with Auto toggle - только для Pages mode */}
          {!puzzleMode && (currentPosition !== null || autoModeAI === true) && !permanentLock && (
            <div className="start-section">
              <label className="auto-toggle">
                <input
                  type="checkbox"
                  checked={autoMode}
                  onChange={() => {
                    initializeAudio();
                    setAutoMode(!autoMode);
                    setAutoModeAI(false);
                    setLocked(false);
                    setLockedSeconds(0);
                    setAutoRunning(false);
                  }}
                />
                <span className="toggle-switch"></span>
                <span className="toggle-label">{t('auto')}</span>
              </label>
              <button
                className={`universal-btn${(loading || aiLoading || autoRunning) ? ' loading' : ''}${autoRunning ? ' auto-active' : ''}${puzzleMode && autoRunning ? ' puzzle-active' : ''}${locked ? ' locked-btn' : ''}`}
                onClick={() => {
                  if (locked) return;
                  initializeAudio();
                  const shouldStop = autoRunning;
                  if (shouldStop) {
                    // Останавливаем авто режим
                    autoModeRef.current = false;
                    puzzleModeRef.current = false;
                    setAutoRunning(false);
                    setLockedSeconds(0);
                    setLocked(false);
                    loadingRef.current = false;
                    setLoading(false);
                  } else {
                    if (puzzleMode) {
                      // Puzzle mode - непрерывный поиск в диапазоне
                      puzzleModeRef.current = true;
                      setAutoRunning(true);
                      switchPosition(null, true);
                    } else if (autoMode) {
                      autoModeRef.current = true;
                      setAutoRunning(true);
                      switchPosition(null, true);
                    } else {
                      switchPosition(null, false);
                    }
                  }
                }}
                disabled={locked}
              >
                {locked ? (
                  <>{t('locked', { seconds: lockedSeconds })}</>
                ) : (
                  (autoRunning ? t('stop') : t('start'))
                )}
              </button>
            </div>
          )}

        </>
      )

      }
      </div>

      {/* Компактное окно найденного баланса */}
      {showBalanceModal && (
        <div className="found-modal-overlay" onClick={() => setShowBalanceModal(false)}>
          <div className="found-modal" onClick={(e) => e.stopPropagation()}>
            <div className="found-modal-header">
              <span className="found-modal-title">
                <Coins size={14} /> {t('foundBalanceTitle')}
              </span>
              <button className="found-modal-close" onClick={() => setShowBalanceModal(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="found-modal-body">
              {/* Балансы */}
              <div className="found-balances-row">
                <div className={`found-balance-item${finalBalance > 0 ? ' has-balance' : ''}`}>
                  <span className="found-balance-label">{t('finalBalance')}</span>
                  <span className="found-balance-value">{formatBalance(finalBalance)} BTC</span>
                </div>
                <div className={`found-balance-item${totalReceived > 0 ? ' has-received' : ''}`}>
                  <span className="found-balance-label">{t('totalReceived')}</span>
                  <span className="found-balance-value">{formatBalance(totalReceived)} BTC</span>
                </div>
              </div>

              {/* Адрес - стиль как в puzzle */}
              {balancesResult[0]?.compressedPublicKeyAddress?.address && (
                <div className="found-address-section">
                  <span className="found-address-label">{t('walletAddress')}</span>
                  <div className="found-address-row">
                    <span className="found-address-value">{balancesResult[0].compressedPublicKeyAddress.address}</span>
                    <a
                      href={`https://www.blockchain.com/explorer/addresses/btc/${balancesResult[0].compressedPublicKeyAddress.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="found-explorer-link"
                      title={t('openExplorer')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  </div>
                </div>
              )}

              {/* Приватный ключ */}
              <div className="found-address-section">
                <span className="found-address-label">{t('privateKey')} (WIF)</span>
                <div className="found-address-row">
                  <span className="found-key-value">{balancesResult[0]?.privateKeyWIFUncompressed}</span>
                  <button
                    className="found-explorer-link"
                    onClick={() => {
                      navigator.clipboard.writeText(balancesResult[0]?.privateKeyWIFUncompressed || '');
                    }}
                    title={t('copy') || 'Copy'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
