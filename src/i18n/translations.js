export const translations = {
  en: {
    // Common
    loading: "Loading...",
    error: "Error",
    cancel: "Cancel",
    submit: "Submit",
    clear: "Clear",
    edit: "Edit",

    // Header / Navigation
    community: "COMMUNITY",
    history: "HISTORY",
    about: "ABOUT",

    // Mode buttons
    manual: "Manual",
    auto: "Auto",
    autoAI: "Auto AI",

    // Page navigation
    pageNumber: "Current page",
    position: "Position",
    currentPosition: "Current Position",
    editPage: "Edit page number",

    // Quick select buttons
    quickStart: "0%",
    quickStartTitle: "Start from 0%",
    quickMiddle: "50%",
    quickMiddleTitle: "Middle of range",
    quickEnd: "100%",
    quickEndTitle: "End of range",
    quickInput: "Input",
    quickInputTitle: "Enter percentage manually",

    // Page controls
    prevKeys: "Previous",
    nextKeys: "Next",

    // Balance labels
    currentBalance: "Current",
    historyBalance: "History",
    totalReceived: "History",
    finalBalance: "Active",

    // Balance display
    balancesBTC: "BTC",
    currentBalances: "Current: {amount} BTC",
    historyBalances: "History: {amount} BTC",

    // Address labels
    walletAddress: "Wallet Address",
    compressedAddress: "Compressed Wallet Address",
    privateKey: "Private Key",
    openExplorer: "Open in explorer",
    copy: "Copy",

    // Loading messages
    checkingBalances: "Checking balances...",
    requestingGPT: "Requesting GPT for page generation...",
    generatingAI: "Generating page using AI method...",

    // Info messages
    manualModeInfo: "Press 'Start' to scan a random page once, or select a page (arrows, slider or manual input) and then press 'Start'.",
    autoModeInfo: "Automatically generating pages until a positive balance is found. All pages with any balance history will be saved.",
    autoAIModeInfo: "AI-powered page generation and scanning...",
    generatedPage: "Generated random page:",
    aiGenerationMode: "AI-powered automatic page generation mode",

    // AI method descriptions
    aiMethodEarlyMining: "Early mining period, Satoshi's first page",
    aiMethodDateBased: "Year of Bitcoin creation",
    aiMethodSimpleSequence: "Simple sequence",
    aiMethodPopularSequence: "Popular sequence",
    aiMethodRepeatingPattern: "Repeating pattern",
    aiMethodMtGoxEra: "Mt.Gox period",
    aiMethodBubble2013: "First Bitcoin bubble",
    aiMethodRoundNumber: "Round number",
    aiMethodMillionMark: "Million mark",

    // History
    historyTitle: "History",
    historyEmpty: "You haven't found any addresses with balance history or positive balance yet.",
    historyEmptySubtext: "Keep scanning - luck will surely smile upon you!",
    historyLoading: "Loading history...",
    historyEnd: "End of history reached",

    // Results
    resultsTitle: "Results",
    showResults: "Results",
    noResults: "No results to display",

    // Status messages
    locked: "{seconds} sec",

    // Buttons
    start: "Start",
    stop: "Stop",

    // Balance found messages
    balanceFound: "BALANCE FOUND!",
    searchStopped: "Search stopped automatically",

    // Fullscreen balance found messages
    foundBalanceTitle: "REAL BITCOINS FOUND!",
    foundBalanceDescription: "Congratulations! You found a Bitcoin address with a positive balance!",
    foundBalanceAmount: "Found balance:",
    foundBalanceHistory: "Total history:",
    foundBalanceInstructions: "What to do next:",
    foundBalanceStep1: "Go to Guarda.com",
    foundBalanceStep2: "Create or open a wallet",
    foundBalanceStep3: "Find the 'Import Private Key' function",
    foundBalanceStep4: "Enter the private key of the found address",
    foundBalanceStep5: "Confirm import and get access to funds",
    foundBalanceWarning: "Warning: Never share your private key with strangers!",
    foundBalanceShowDetails: "Show address details",
    foundBalanceOpenHistory: "Open search history",
    foundBalanceHistoryTip: "Tip: You can always return to the found address via the 'History' button in the main menu!",

    // Sounds
    soundError: "Sound cannot be played (user interaction required)",
    soundCreateError: "Error creating audio",
    soundEnable: "Enable sound",
    soundDisable: "Disable sound",

    // Errors
    dataError: "Error: missing data for display",

    // Percentages
    percent: "%",

    // Numbers
    page: "Page",
    addresses: "addresses",
    addressesCount: "256 addresses BTC",
    pageDescription: "Each page contains 128 addresses.",
    pageRangeHint: "Enter page number ({{min}} - {{max}})",
    more: "more",

    // Modal dialogs
    pageInputTitle: "Enter Page Number",
    pageInputDescription: "Enter the page number you want to scan:",
    percentageInputTitle: "Enter Percentage",
    percentageInputDescription: "Enter the percentage (0-100) to set position:",
    enterPageNumber: "Enter page number",
    enterPercentage: "Enter percentage",
    confirm: "Confirm",
    close: "Close",
    pageRangeLabel: "Page range:",
    percentageRangeInfo: "Enter a value between 0 and 100 with up to 8 decimal places",

    // Search patterns (for GPT)
    searchPatterns: {
      sequential: "Sequential keys (0001, 0002, 0003...)",
      repeating: "Repeating digits (1111, 2222, 3333...)",
      dateBased: "Date-based keys (2011, 2012, 2013...)",
      wordBased: "Word-based keys (password, bitcoin...)",
      earlyMining: "Early mining keys (2009-2011)",
      mtGoxLeak: "Mt.Gox leak keys",
      brainWallet: "Brain wallet keys (simple passwords)"
    },
    from: "from",
    to: "to",

    // Mode switcher
    pagesMode: "Pages",

    // Puzzle Mode
    puzzleMode: "Puzzle",
    targetAddress: "Target",
    reward: "Reward",
    keysChecked: "Keys checked",
    speed: "Speed",
    keysPerSec: "keys/sec",
    progress: "Progress",
    puzzleSolved: "PUZZLE SOLVED!",
    puzzleInfo: "Bitcoin Puzzles are real addresses with known key ranges. Find the key - claim the reward!",

    // Intro/About modal
    introWhatIsThis: "What is this?",
    introDescription: "BitKeys is a tool for searching Bitcoin addresses with balance in the private key space.",
    introHowItWorks: "How does it work?",
    introManualMode: "Manual mode:",
    introManualModeDesc: "Select a page and scan it",
    introAutoMode: "Auto mode:",
    introAutoModeDesc: "Automatically scans random pages",
    introPuzzleMode: "Puzzle mode:",
    introPuzzleModeDesc: "Search for keys to Bitcoin Puzzle addresses with real rewards",
    introWhatHappens: "What happens when found?",
    introWhatHappensDesc: "All found addresses with balance or history are automatically saved in history. Each page contains 128 addresses.",
    introSecurity: "Security:",
    introSecurityDesc: "The app runs locally in your browser. Private keys are never sent to servers.",
    introImportant: "Important:",
    introImportantDesc: "This project is created for educational purposes only. Never spend the bitcoins you find — they may belong to someone else (e.g., Satoshi Nakamoto)!",
    introStartBtn: "Got it, let's start!"
  },

  ru: {
    // Common
    loading: "Загрузка...",
    error: "Ошибка",
    cancel: "Отмена",
    submit: "Подтвердить",
    clear: "Очистить",
    edit: "Редактировать",

    // Header / Navigation
    community: "Сообщество",
    history: "История",
    about: "Что это",

    // Mode buttons
    manual: "Ручной",
    auto: "Авто",
    autoAI: "Авто ИИ",

    // Page navigation
    pageNumber: "Текущая страница",
    position: "Позиция",
    currentPosition: "Текущая позиция",
    editPage: "Редактировать номер страницы",

    // Quick select buttons
    quickStart: "0%",
    quickStartTitle: "Начать с 0%",
    quickMiddle: "50%",
    quickMiddleTitle: "Середина диапазона",
    quickEnd: "100%",
    quickEndTitle: "Конец диапазона",
    quickInput: "Ввод",
    quickInputTitle: "Ввести процент вручную",

    // Page controls
    prevKeys: "Назад",
    nextKeys: "Вперед",

    // Balance labels
    currentBalance: "Текущий",
    historyBalance: "История",
    totalReceived: "По истории",
    finalBalance: "Активно",

    // Balance display
    balancesBTC: "BTC",
    currentBalances: "Текущие: {amount} BTC",
    historyBalances: "По истории: {amount} BTC",

    // Address labels
    walletAddress: "Адрес кошелька",
    compressedAddress: "Адрес кошелька Compressed",
    privateKey: "Приватный ключ",
    openExplorer: "Открыть в эксплорере",
    copy: "Копировать",

    // Loading messages
    checkingBalances: "Проверяю балансы...",
    requestingGPT: "Запрашиваем GPT для генерации страниц...",
    generatingAI: "Генерируем страницу по методу ИИ...",

    // Info messages
    manualModeInfo: "Нажмите «Старт» для однократного сканирования случайной страницы, или выберите страницу (стрелки, бегунок, ввод) и нажмите «Старт».",
    autoModeInfo: "Генерация страниц будет продолжаться автоматически, пока не будет найден положительный баланс. Все найденные страницы даже с историей будут сохранены.",
    autoAIModeInfo: "Авто-поиск с ИИ",
    generatedPage: "Сгенерирована случайная страница:",
    aiGenerationMode: "Режим автоматической генерации страниц с помощью ИИ",

    // AI method descriptions
    aiMethodEarlyMining: "Самая первая страница, период майнинга Сатоши",
    aiMethodDateBased: "Год создания Bitcoin",
    aiMethodSimpleSequence: "Простая последовательность",
    aiMethodPopularSequence: "Популярная последовательность",
    aiMethodRepeatingPattern: "Повторяющийся паттерн",
    aiMethodMtGoxEra: "Период Mt.Gox",
    aiMethodBubble2013: "Первый пузырь биткоина",
    aiMethodRoundNumber: "Круглое число",
    aiMethodMillionMark: "Миллионная отметка",

    // History
    historyTitle: "История",
    historyEmpty: "Вы пока что не нашли ни одного адреса с историей баланса или положительным балансом.",
    historyEmptySubtext: "Продолжайте сканирование - удача обязательно улыбнется!",
    historyLoading: "Загрузка истории...",
    historyEnd: "Достигнут конец истории",

    // Results
    resultsTitle: "Результаты",
    showResults: "Результаты",
    noResults: "Нет результатов для отображения",

    // Status messages
    locked: "{seconds} сек",

    // Buttons
    start: "Старт",
    stop: "Стоп",

    // Balance found messages
    balanceFound: "БАЛАНС НАЙДЕН!",
    searchStopped: "Поиск остановлен автоматически",

    // Fullscreen balance found messages
    foundBalanceTitle: "НАЙДЕНЫ РЕАЛЬНЫЕ БИТКОИНЫ!",
    foundBalanceDescription: "Поздравляем! Вы нашли Bitcoin-адрес с положительным балансом!",
    foundBalanceAmount: "Найденный баланс:",
    foundBalanceHistory: "Общая история:",
    foundBalanceInstructions: "Что делать дальше:",
    foundBalanceStep1: "Перейдите на Guarda.com",
    foundBalanceStep2: "Создайте или откройте кошелек",
    foundBalanceStep3: "Найдите функцию 'Импорт приватного ключа'",
    foundBalanceStep4: "Введите приватный ключ найденного адреса",
    foundBalanceStep5: "Подтвердите импорт и получите доступ к средствам",
    foundBalanceWarning: "Внимание: Никогда не делитесь приватным ключом с посторонними!",
    foundBalanceShowDetails: "Показать детали адреса",
    foundBalanceOpenHistory: "Открыть историю поиска",
    foundBalanceHistoryTip: "Совет: Вы всегда можете вернуться к найденному адресу через кнопку 'История' в главном меню!",

    // Sounds
    soundError: "Звук не может быть воспроизведен (требуется взаимодействие пользователя)",
    soundCreateError: "Ошибка создания аудио",
    soundEnable: "Включить звук",
    soundDisable: "Отключить звук",

    // Errors
    dataError: "Ошибка: отсутствуют данные для отображения",

    // Percentages
    percent: "%",

    // Numbers
    page: "Страница",
    addresses: "адресов",
    addressesCount: "256 адресов BTC",
    pageDescription: "Каждая страница содержит 128 адресов.",
    pageRangeHint: "Введите номер страницы ({{min}} - {{max}})",
    more: "ещё",

    // Modal dialogs
    pageInputTitle: "Ввести номер страницы",
    pageInputDescription: "Введите номер страницы для сканирования:",
    percentageInputTitle: "Ввести процент",
    percentageInputDescription: "Введите процент (0-100) для установки позиции:",
    enterPageNumber: "Введите номер страницы",
    enterPercentage: "Введите процент",
    confirm: "Подтвердить",
    close: "Закрыть",
    pageRangeLabel: "Диапазон страниц:",
    percentageRangeInfo: "Введите значение от 0 до 100 с до 8 знаков после запятой",

    // Search patterns (for GPT)
    searchPatterns: {
      sequential: "Последовательные ключи (0001, 0002, 0003...)",
      repeating: "Повторяющиеся цифры (1111, 2222, 3333...)",
      dateBased: "Ключи на основе дат (2011, 2012, 2013...)",
      wordBased: "Ключи на основе слов (password, bitcoin...)",
      earlyMining: "Ранние ключи майнинга (2009-2011)",
      mtGoxLeak: "Ключи из утечек Mt.Gox",
      brainWallet: "Brain wallet ключи (простые пароли)"
    },
    from: "от",
    to: "до",

    // Mode switcher
    pagesMode: "Страницы",

    // Puzzle Mode
    puzzleMode: "Puzzle",
    targetAddress: "Цель",
    reward: "Награда",
    keysChecked: "Проверено ключей",
    speed: "Скорость",
    keysPerSec: "ключей/сек",
    progress: "Прогресс",
    puzzleSolved: "PUZZLE РЕШЁН!",
    puzzleInfo: "Bitcoin Puzzles - реальные адреса с известным диапазоном ключей. Найди ключ - забери награду!",

    // Intro/About modal
    introWhatIsThis: "Что это такое?",
    introDescription: "BitKeys — инструмент для поиска Bitcoin-адресов с балансом в пространстве приватных ключей.",
    introHowItWorks: "Как это работает?",
    introManualMode: "Ручной режим:",
    introManualModeDesc: "Выберите страницу и просканируйте её",
    introAutoMode: "Авто режим:",
    introAutoModeDesc: "Автоматически сканирует случайные страницы",
    introPuzzleMode: "Puzzle режим:",
    introPuzzleModeDesc: "Поиск ключей к адресам Bitcoin Puzzle с реальными наградами",
    introWhatHappens: "Что происходит при находке?",
    introWhatHappensDesc: "Все найденные адреса с балансом или историей автоматически сохраняются в истории. Каждая страница содержит 128 адресов.",
    introSecurity: "Безопасность:",
    introSecurityDesc: "Приложение работает локально в вашем браузере. Приватные ключи не передаются на серверы.",
    introImportant: "Важно:",
    introImportantDesc: "Этот проект создан исключительно в образовательных целях. Ни в коем случае не тратьте биткоины, которые найдёте — они могут принадлежать кому-то другому (например, Сатоши Накамото)!",
    introStartBtn: "Понятно, начать!"
  }
};

// Функция для интерполяции строк с параметрами
export const interpolate = (text, params = {}) => {
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
};
