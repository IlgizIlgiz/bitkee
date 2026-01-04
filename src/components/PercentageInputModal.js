import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import './Modal.css';

function PercentageInputModal({ isOpen, onClose, onConfirm, currentPosition }) {
  const { t } = useTranslation();
  const [percentageInputValue, setPercentageInputValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (currentPosition !== null) {
        // Format percentage, removing trailing zeros
        const percentage = (currentPosition * 100).toFixed(8).replace(/\.?0+$/, '');
        setPercentageInputValue(percentage);
      } else {
        setPercentageInputValue('');
      }
      setError('');
    }
  }, [isOpen, currentPosition]);

  const handleInputChange = (e) => {
    const value = e.target.value.replace(/[^\d.]/g, '');
    const parts = value.split('.');
    if (parts[1] && parts[1].length > 8) {
      parts[1] = parts[1].slice(0, 8);
      setPercentageInputValue(parts.join('.'));
    } else {
      setPercentageInputValue(value);
    }
    setError('');
  };

  const handleConfirm = () => {
    let percentage = parseFloat(percentageInputValue);
    if (isNaN(percentage) || percentage < 0) {
      percentage = 0;
    } else if (percentage > 100) {
      percentage = 100;
    }
    // Round to 8 decimal places to avoid floating point precision issues
    const position = Math.round((percentage / 100) * 1e10) / 1e10;
    onConfirm(position);
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
          <h3>{t('percentageInputTitle')}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          <p>{t('percentageInputDescription')}</p>

          <div className="input-group">
            <div className="input-with-clear">
              <input
                type="number"
                className={`modal-input ${error ? 'error' : ''}`}
                value={percentageInputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="0.00000000"
                step="0.00000001"
                min="0"
                max="100"
                autoFocus
              />
              <span className="input-suffix">%</span>
              <button
                className="clear-btn"
                onClick={() => setPercentageInputValue('')}
                title={t('clear')}
                type="button"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {error && <div className="error-message">{error}</div>}
          </div>

          <div className="modal-info">
            <small>{t('percentageRangeInfo')}</small>
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

export default PercentageInputModal;