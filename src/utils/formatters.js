/**
 * Форматирует баланс в BTC
 * @param {number} balance - баланс в сатоши
 * @returns {string} - отформатированный баланс в BTC
 */
export const formatBalance = (balance) => {
  if (!balance || balance === 0) {
    return '0.00000000';
  }
  
  const btcValue = balance / 100000000; // Преобразование сатоши в биткоины
  
  // Если баланс очень маленький, показываем в научной нотации
  if (btcValue < 0.00000001) {
    return btcValue.toExponential(2);
  }
  
  // Убираем лишние нули справа, но оставляем минимум 2 знака после запятой
  let formatted = btcValue.toFixed(8);
  formatted = parseFloat(formatted).toString();
  
  // Если нет знаков после запятой, добавляем .00
  if (!formatted.includes('.')) {
    formatted += '.00';
  } else {
    // Если есть только один знак после запятой, добавляем еще один ноль
    const decimalPart = formatted.split('.')[1];
    if (decimalPart.length === 1) {
      formatted += '0';
    }
  }
  
  return formatted;
};

/**
 * Форматирует позицию для отображения
 * @param {number} position - позиция от 0 до 1
 * @returns {string} - отформатированная позиция в процентах
 */
export const formatPosition = (position) => {
  if (position === null || position === undefined) {
    return '0%';
  }
  
  const percentage = position * 100;
  // Убираем лишние нули после точки
  return `${parseFloat(percentage.toFixed(8))}%`;
};

/**
 * Форматирует приватный ключ для отображения
 * @param {string} privateKey - приватный ключ в hex
 * @param {number} maxLength - максимальная длина для отображения
 * @returns {string} - отформатированный ключ
 */
export const formatPrivateKey = (privateKey, maxLength = 16) => {
  if (!privateKey) {
    return 'N/A';
  }
  
  if (privateKey.length <= maxLength) {
    return privateKey;
  }
  
  return `${privateKey.substring(0, maxLength)}...`;
};

/**
 * Форматирует адрес для отображения
 * @param {string} address - биткоин-адрес
 * @param {number} maxLength - максимальная длина для отображения
 * @returns {string} - отформатированный адрес
 */
export const formatAddress = (address, maxLength = 12) => {
  if (!address) {
    return 'N/A';
  }
  
  if (address.length <= maxLength) {
    return address;
  }
  
  return `${address.substring(0, maxLength)}...`;
};

/**
 * Форматирует время выполнения
 * @param {number} milliseconds - время в миллисекундах
 * @returns {string} - отформатированное время
 */
export const formatExecutionTime = (milliseconds) => {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

/**
 * Форматирует количество адресов
 * @param {number} count - количество адресов
 * @returns {string} - отформатированное количество
 */
export const formatAddressCount = (count) => {
  if (count < 1000) {
    return count.toString();
  }
  
  if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  
  return `${(count / 1000000).toFixed(1)}M`;
};

/**
 * Форматирует статистику поиска
 * @param {object} stats - статистика поиска
 * @returns {object} - отформатированная статистика
 */
export const formatSearchStats = (stats) => {
  return {
    totalScanned: formatAddressCount(stats.totalScanned || 0),
    addressesWithBalance: formatAddressCount(stats.addressesWithBalance || 0),
    totalBTCFound: formatBalance(stats.totalBTCFound || 0),
    successRate: `${((stats.successRate || 0) * 100).toFixed(4)}%`,
    averageTimePerBatch: formatExecutionTime(stats.averageTimePerBatch || 0)
  };
}; 