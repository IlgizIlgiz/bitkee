// addressWorker.js
import BN from 'bn.js';
import * as bitcoinjs from 'bitcoinjs-lib';
import bigi from 'bigi';
import { MAX_PRIVATE_KEY_BN, ADDRESSES_PER_BATCH } from './constants/bitcoin.js';

onmessage = function(e) {
  const { position, privateKeyHex, addressesToGenerate, requestId } = e.data;

  function generatePrivateKeyFromPosition(position) {
    if (position < 0 || position > 1) {
      throw new Error('Position must be between 0 and 1');
    }

    // Вычисляем приватный ключ на основе позиции
    // Позиция 0 соответствует ключу 1, позиция 1 соответствует максимальному ключу
    // Используем 10 знаков после запятой для точности (1e10)
    const targetKey = MAX_PRIVATE_KEY_BN.mul(new BN(Math.round(position * 1e10))).div(new BN(1e10));
    
    // Если результат равен 0, используем ключ 1
    if (targetKey.isZero()) {
      return new BN(1).toString(16).padStart(64, '0');
    }
    
    // Преобразуем в hex и дополняем до 64 символов
    return targetKey.toString(16).padStart(64, '0');
  }

  function generateKeyPairFromPrivateKey(privateKeyHex) {
    try {
      const d = bigi.fromHex(privateKeyHex);
      
      if (d.toString() === '0') {
        console.log('Worker: Skipping zero private key');
        return null;
      }
      // Сравнение через BN.js
      const dBN = new BN(d.toString());
      if (dBN.gte(MAX_PRIVATE_KEY_BN)) {
        console.log('Worker: Skipping key >= max:', d.toString(), 'max:', MAX_PRIVATE_KEY_BN.toString());
        return null;
      }
      
      const keyPair = new bitcoinjs.ECPair(d);
      
      keyPair.compressed = false;
      const uncompressedAddress = keyPair.getAddress();
      
      keyPair.compressed = true;
      const compressedAddress = keyPair.getAddress();
      
      keyPair.compressed = false;
      const privateKeyWIF = keyPair.toWIF();
      
      return {
        publicKey: uncompressedAddress,
        compressedPublicKey: compressedAddress,
        privateKeyWIFUncompressed: privateKeyWIF
      };
    } catch (error) {
      console.error('Error generating key pair for', privateKeyHex, ':', error);
      return null;
    }
  }

  function generateAddressesFromPrivateKey(startPrivateKeyHex, count = ADDRESSES_PER_BATCH) {
    const addresses = new Array(count).fill(null);
    const startBN = new BN(startPrivateKeyHex, 16);
    
    console.log('Worker: Starting with key', startBN.toString(), 'generating', count, 'addresses');
    
    for (let i = 0; i < count; i++) {
      const currentKeyBN = startBN.add(new BN(i));
      
      // Проверяем, не превышает ли ключ максимальное значение
      if (currentKeyBN.gte(MAX_PRIVATE_KEY_BN)) {
        console.log('Worker: Stopping at key', currentKeyBN.toString(), 'which exceeds max');
        break;
      }
      
      const currentKeyHex = currentKeyBN.toString(16).padStart(64, '0');
      
      if (i === 0) {
        console.log('Worker: First key in batch:', currentKeyBN.toString());
      }
      if (i === count - 1) {
        console.log('Worker: Last key in batch:', currentKeyBN.toString());
      }
      
      const keyPair = generateKeyPairFromPrivateKey(currentKeyHex);
      if (keyPair) {
        addresses[i] = keyPair; // Сохраняем по правильному индексу
      } else {
        console.log('Worker: Failed to generate key pair for key', currentKeyBN.toString(), 'at index', i);
        // addresses[i] остается null
      }
    }
    
    const validCount = addresses.filter(addr => addr !== null).length;
    console.log('Worker: Generated', validCount, 'addresses out of', count);
    if (validCount < count) {
      console.log('Worker: Missing addresses at indices:', addresses.map((addr, idx) => addr === null ? idx : null).filter(idx => idx !== null));
    }
    return addresses;
  }

  function generateAddressesFromPosition(position) {
    const startPrivateKey = generatePrivateKeyFromPosition(position);
    return generateAddressesFromPrivateKey(startPrivateKey);
  }

  let addresses;
  if (privateKeyHex) {
    // Если передан приватный ключ напрямую, используем его
    const count = addressesToGenerate || ADDRESSES_PER_BATCH;
    addresses = generateAddressesFromPrivateKey(privateKeyHex, count);
  } else {
    // Иначе используем позицию
    addresses = generateAddressesFromPosition(position);
  }
  // Возвращаем адреса и requestId для проверки race condition
  postMessage({ addresses, requestId });
};