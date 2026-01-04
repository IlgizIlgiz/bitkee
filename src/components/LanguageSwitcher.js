import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './LanguageSwitcher.css';

const LanguageSwitcher = () => {
  const { currentLanguage, changeLanguage } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const languages = [
    { code: 'en', flag: '🇺🇸', name: 'English' },
    { code: 'ru', flag: '🇷🇺', name: 'Русский' }
  ];

  const currentLang = languages.find(lang => lang.code === currentLanguage) || languages[0];

  const handleLanguageChange = (languageCode) => {
    changeLanguage(languageCode);
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Закрытие дропдауна при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
  };
  }, [isOpen]);

  return (
    <div className="language-switcher" ref={dropdownRef}>
      <button
        className={`language-current-btn ${isOpen ? 'active' : ''}`}
        onClick={toggleDropdown}
        title={currentLang.name}
      >
        <span className="flag">{currentLang.flag}</span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <div className="language-dropdown">
      {languages.map((language) => (
        <button
          key={language.code}
              className={`language-option ${currentLanguage === language.code ? 'current' : ''}`}
          onClick={() => handleLanguageChange(language.code)}
        >
              <span className="flag">{language.flag}</span>
              <span className="name">{language.name}</span>
        </button>
      ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher; 