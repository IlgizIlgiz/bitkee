import BN from 'bn.js';
import * as bitcoinjs from 'bitcoinjs-lib';
import bigi from 'bigi';
import { MAX_PRIVATE_KEY_BN, ADDRESSES_PER_BATCH, MAX_PRIVATE_KEY } from '../constants/bitcoin.js';

/**
 * Генерирует приватный ключ из позиции в диапазоне (0-1)
 * @param {number} position - позиция от 0 до 1
 * @returns {string} - 64-значный hex приватный ключ
 */
export const generatePrivateKeyFromPosition = (position) => {
  if (position < 0 || position > 1) {
    throw new Error('Position must be between 0 and 1');
  }

  // Специальная обработка для позиции 100% (1.0)
  if (position === 1.0) {
    return MAX_PRIVATE_KEY;
  }

  // Специальная обработка для позиции 0% (0.0)
  if (position === 0.0) {
    return '0000000000000000000000000000000000000000000000000000000000000000';
  }

  // Вычисляем приватный ключ на основе позиции
  // Позиция 0 соответствует ключу 0, позиция 1 соответствует максимальному ключу
  // Используем 10 знаков после запятой для точности (1e10)
  const targetKey = MAX_PRIVATE_KEY_BN.mul(new BN(Math.round(position * 1e10))).div(new BN(1e10));
  
  // Преобразуем в hex и дополняем до 64 символов
  return targetKey.toString(16).padStart(64, '0');
};

/**
 * Генерирует биткоин-адрес из приватного ключа
 * @param {string} privateKeyHex - приватный ключ в hex формате
 * @param {boolean} compressed - использовать сжатый адрес
 * @returns {string} - биткоин-адрес
 */
export const generateAddressFromPrivateKey = (privateKeyHex, compressed = false) => {
  try {
    const d = bigi.fromHex(privateKeyHex);
    const keyPair = new bitcoinjs.ECPair(d);
    keyPair.compressed = compressed;
    
    return keyPair.getAddress();
  } catch (error) {
    console.error('Error generating address:', error);
    return null;
  }
};

/**
 * Генерирует пару адресов (сжатый и несжатый) из приватного ключа
 * @param {string} privateKeyHex - приватный ключ в hex формате
 * @returns {object} - объект с адресами и приватным ключом
 */
export const generateKeyPairFromPrivateKey = (privateKeyHex) => {
  try {
    const d = bigi.fromHex(privateKeyHex);
    const keyPair = new bitcoinjs.ECPair(d);
    
    // Генерируем несжатый адрес
    keyPair.compressed = false;
    const uncompressedAddress = keyPair.getAddress();
    
    // Генерируем сжатый адрес
    keyPair.compressed = true;
    const compressedAddress = keyPair.getAddress();
    
    // Возвращаем к несжатому для WIF
    keyPair.compressed = false;
    const privateKeyWIF = keyPair.toWIF();
    
    return {
      publicKey: uncompressedAddress,
      compressedPublicKey: compressedAddress,
      privateKeyWIFUncompressed: privateKeyWIF
    };
  } catch (error) {
    console.error('Error generating key pair:', error);
    return null;
  }
};

/**
 * Генерирует 128 последовательных адресов начиная с заданного приватного ключа
 * @param {string} startPrivateKeyHex - начальный приватный ключ
 * @returns {Array} - массив объектов с адресами
 */
export const generateAddressesFromPrivateKey = (startPrivateKeyHex) => {
  const addresses = [];
  const startBN = new BN(startPrivateKeyHex, 16);
  
  for (let i = 0; i < ADDRESSES_PER_BATCH; i++) {
    const currentKeyBN = startBN.add(new BN(i));
    const currentKeyHex = currentKeyBN.toString(16).padStart(64, '0');
    
    const keyPair = generateKeyPairFromPrivateKey(currentKeyHex);
    if (keyPair) {
      addresses.push(keyPair);
    }
  }
  
  return addresses;
};

/**
 * Генерирует адреса из позиции в диапазоне
 * @param {number} position - позиция от 0 до 1
 * @returns {Array} - массив объектов с адресами
 */
export const generateAddressesFromPosition = (position) => {
  const startPrivateKey = generatePrivateKeyFromPosition(position);
  return generateAddressesFromPrivateKey(startPrivateKey);
};

/**
 * Валидирует позицию
 * @param {number} position - позиция для проверки
 * @returns {boolean} - валидна ли позиция
 */
export const validatePosition = (position) => {
  return typeof position === 'number' && position >= 0 && position <= 1;
};

/**
 * Форматирует позицию для отображения
 * @param {number} position - позиция
 * @returns {string} - отформатированная позиция
 */
export const formatPosition = (position) => {
  const percentage = position * 100;
  // Убираем лишние нули после точки
  return `${parseFloat(percentage.toFixed(8))}%`;
};

/**
 * Получает описание периода для позиции
 * @param {number} position - позиция
 * @returns {string} - описание периода
 */
export const getPeriodDescription = (position) => {
  const periods = [
    { range: [0, 0.001], description: "Ранние годы (2009-2010)" },
    { range: [0.1, 0.2], description: "Период Mt.Gox (2011-2012)" },
    { range: [0.3, 0.4], description: "Первый пузырь (2013-2014)" },
    { range: [0.6, 0.7], description: "После крахов (2015-2016)" },
    { range: [0.9, 1.0], description: "Современный период (2017+)" }
  ];
  
  for (const period of periods) {
    if (position >= period.range[0] && position <= period.range[1]) {
      return period.description;
    }
  }
  
  return "Неизвестный период";
};

/**
 * Форматирует приватный ключ для отображения
 * @param {string} privateKey - приватный ключ в hex формате
 * @param {number} maxLength - максимальная длина для отображения
 * @returns {string} - отформатированный приватный ключ
 */
export const formatPrivateKey = (privateKey, maxLength = 16) => {
  if (!privateKey) return '';
  
  if (privateKey.length <= maxLength) {
    return privateKey;
  }
  
  const start = privateKey.substring(0, maxLength / 2);
  const end = privateKey.substring(privateKey.length - maxLength / 2);
  return `${start}...${end}`;
}; 