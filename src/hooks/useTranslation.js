import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { translations, interpolate } from '../i18n/translations';
import { openDB } from 'idb';

// Дефолтный язык
const DEFAULT_LANGUAGE = 'en';

// Инициализация базы данных для языковых настроек
const initLanguageDB = async () => {
  return openDB('LanguageDB', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });
};

// Сохранение языка в IndexedDB
const saveLanguage = async (language) => {
  try {
    const db = await initLanguageDB();
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    await store.put({ key: 'language', value: language });
    await tx.done;
  } catch (error) {
    console.error('Error saving language:', error);
  }
};

// Загрузка языка из IndexedDB
const loadLanguage = async () => {
  try {
    const db = await initLanguageDB();
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const result = await store.get('language');
    return result?.value || DEFAULT_LANGUAGE;
  } catch (error) {
    console.error('Error loading language:', error);
    return DEFAULT_LANGUAGE;
  }
};

// Создаем контекст для переводов
const TranslationContext = createContext();

// Провайдер контекста
export const TranslationProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(DEFAULT_LANGUAGE);
  const [isLoading, setIsLoading] = useState(true);

  // Загрузка языка при инициализации
  useEffect(() => {
    const initLanguage = async () => {
      try {
        const savedLanguage = await loadLanguage();
        setCurrentLanguage(savedLanguage);
      } catch (error) {
        console.error('Error initializing language:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initLanguage();
  }, []);

  // Функция для получения переведенного текста
  const t = useCallback((key, params = {}) => {
    const keys = key.split('.');
    let value = translations[currentLanguage];
    
    // Навигация по вложенным ключам
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) break;
    }
    
    // Если перевод не найден, пробуем дефолтный язык
    if (value === undefined) {
      value = translations[DEFAULT_LANGUAGE];
      for (const k of keys) {
        value = value?.[k];
        if (value === undefined) break;
      }
    }
    
    // Если все еще не найдено, возвращаем ключ
    if (value === undefined) {
      console.warn(`Translation key "${key}" not found`);
      return key;
    }
    
    // Интерполяция параметров
    return interpolate(value, params);
  }, [currentLanguage]);

  // Функция для смены языка
  const changeLanguage = useCallback(async (newLanguage) => {
    if (translations[newLanguage]) {
      setCurrentLanguage(newLanguage);
      await saveLanguage(newLanguage);
    } else {
      console.warn(`Language "${newLanguage}" not supported`);
    }
  }, []);

  // Получение списка доступных языков
  const getAvailableLanguages = useCallback(() => {
    return Object.keys(translations);
  }, []);

  const value = {
    t,
    currentLanguage,
    changeLanguage,
    getAvailableLanguages,
    isLoading
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};

// Хук для использования контекста
export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}; 