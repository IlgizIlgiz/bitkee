import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import './Modal.css';

function PageInputModal({ isOpen, onClose, onConfirm, currentPage }) {
  const { t } = useTranslation();
  const [pageInputValue, setPageInputValue] = useState('');
  const [error, setError] = useState('');

  const MIN_PAGE = BigInt(1);
  const MAX_PAGE = BigInt('904625697166532776746648320380374280100293470930272690489102837043110636675');

  const validateAndCorrectPage = (pageNumber) => {
    try {
      const page = BigInt(pageNumber);
      if (page < MIN_PAGE) return MIN_PAGE.toString();
      if (page > MAX_PAGE) return MAX_PAGE.toString();
      return page.toString();
    } catch (error) {
      console.error('Error validating page:', error);
      return MIN_PAGE.toString();
    }
  };

  useEffect(() => {
    if (isOpen) {
      setPageInputValue(currentPage ? currentPage.toString() : '');
      setError('');
    }
  }, [isOpen, currentPage]);

  const handleInputChange = (e) => {
    const value = e.target.value.replace(/\D/g, '');
    setPageInputValue(value);
    setError('');
  };

  const handleConfirm = () => {
    const pageNumber = pageInputValue.trim();
    if (!pageNumber) {
      setError(t('enterPageNumber'));
      return;
    }
    const validatedPage = validateAndCorrectPage(pageNumber);
    onConfirm(validatedPage);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div className="modal-content">
        <div className="modal-header">
          <h3>{t('pageInputTitle')}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          <p>{t('pageInputDescription')}</p>

          <div className="input-group">
            <div className="input-with-clear">
              <textarea
                className={`modal-input modal-textarea ${error ? 'error' : ''}`}
                value={pageInputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`1 - ${MAX_PAGE.toString()}`}
                rows={3}
                autoFocus
              />
              <button
                className="clear-btn"
                onClick={() => setPageInputValue('')}
                title={t('clear')}
                type="button"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {error && <div className="error-message">{error}</div>}
          </div>

          <div className="modal-info">
            <div className="range-centered">
              <span className="range-label">{t('pageRangeLabel')}</span>
              <div className="range-row">
                <span className="range-fromto">{t('from')}</span>
                <span className="range-min">1</span>
                <span className="range-fromto">{t('to')}</span>
              </div>
              <div className="range-max-big">{MAX_PAGE.toString()}</div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>
            {t('close')}
          </button>
          <button className="modal-btn primary" onClick={handleConfirm}>
            {t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PageInputModal;