/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import './Style.css';
import { useTranslation } from '../hooks/useTranslation';
import PageInputModal from '../components/PageInputModal';
import PercentageInputModal from '../components/PercentageInputModal';
import { Target, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pencil, Wallet, Eye } from 'lucide-react';

function PageNumber(props) {
    const { t } = useTranslation();
    const [isDragging, setIsDragging] = useState(false);
    const [localPosition, setLocalPosition] = useState(props.position || 0);
    const [visualPosition, setVisualPosition] = useState(props.position || 0);
    const [showPageModal, setShowPageModal] = useState(false);
    const [showPercentageModal, setShowPercentageModal] = useState(false);

    const progressBarRef = useRef(null);
    const lastMouseXRef = useRef(0);
    const percentage = visualPosition * 100;
    
    // Отладочная информация для balanceFound
    useEffect(() => {
        if (props.balanceFound) {
            console.log('🔒 PageNumber: balanceFound = true, UI should be blocked');
        }
    }, [props.balanceFound]);
    


    // Обновляем локальную позицию при изменении props
    useEffect(() => {
        if (props.position !== null && !isDragging) {
            setLocalPosition(props.position);
            setVisualPosition(props.position);
        }
    }, [props.position, isDragging]);



    // Функция для расчета позиции при клике/перетаскивании
    const calculatePosition = (clientX) => {
        if (!progressBarRef.current) return 0;
        const rect = progressBarRef.current.getBoundingClientRect();
        const clickX = clientX - rect.left;
        // Ограничиваем клик в пределах бегунка
        const clampedX = Math.max(0, Math.min(rect.width, clickX));
        const percentage = (clampedX / rect.width) * 100;
        return percentage / 100;
    };

    // Универсальная функция для получения координат (мышь или touch)
    const getClientX = (e) => {
        return e.touches ? e.touches[0].clientX : e.clientX;
    };

    // Обработчики событий мыши и touch
    const handleStart = (e) => {
        if (!props.isManualMode || props.isScanning || props.balanceFound) return;
        e.preventDefault(); // Предотвращаем выделение текста и зум
        e.stopPropagation(); // Останавливаем всплытие события
        
        // Инициализируем аудио при первом взаимодействии
        if (props.onInitializeAudio) {
            props.onInitializeAudio();
        }
        
        // Для touch событий дополнительно предотвращаем зум
        if (e.touches) {
            e.preventDefault();
        }
        
        setIsDragging(true);
        const clientX = getClientX(e);
        const newPosition = calculatePosition(clientX);
        lastMouseXRef.current = clientX;
        setVisualPosition(newPosition);
        setLocalPosition(newPosition);
        // НЕ вызываем onPositionChange при начале перетаскивания
    };

    const handleClick = (e) => {
        if (!props.isManualMode || props.isScanning || props.balanceFound) return;
        
        // Инициализируем аудио при первом взаимодействии
        if (props.onInitializeAudio) {
            props.onInitializeAudio();
        }
        
        // Небольшая задержка, чтобы отличить клик от перетаскивания
        setTimeout(() => {
            if (!isDragging) {
                const clientX = getClientX(e);
                const newPosition = calculatePosition(clientX);
                setLocalPosition(newPosition);
                setVisualPosition(newPosition);
        if (props.onPositionChange) {
            props.onPositionChange(newPosition);
        }
                if (props.onAutoStart) {
                    props.onAutoStart(newPosition);
                }
            }
        }, 10);
    };

    const handleMove = useCallback((e) => {
        if (!isDragging || !props.isManualMode || props.isScanning || props.balanceFound) return;
        e.preventDefault(); // Предотвращаем выделение текста и скролл
        e.stopPropagation(); // Останавливаем всплытие события
        
        // Для touch событий дополнительно предотвращаем скролл
        if (e.touches) {
            e.preventDefault();
        }
        
        const clientX = getClientX(e);
        lastMouseXRef.current = clientX;
        const newPosition = calculatePosition(clientX);
        
        // Обновляем только визуальную позицию при перетаскивании
        setVisualPosition(newPosition);
        setLocalPosition(newPosition);
        // НЕ вызываем onPositionChange здесь - только при завершении перетаскивания
    }, [isDragging, props.isManualMode, props.isScanning, props.balanceFound]);

    const handleEnd = useCallback((e) => {
        if (!isDragging) return; // Если не было перетаскивания, ничего не делаем
        
        e.preventDefault();
        e.stopPropagation();
        
        setIsDragging(false);
        // При завершении перетаскивания используем последнюю сохраненную позицию курсора
        const finalPosition = calculatePosition(lastMouseXRef.current);
        setLocalPosition(finalPosition);
        setVisualPosition(finalPosition);
        
        // Только при завершении перетаскивания вызываем обработчики
        if (props.onPositionChange) {
            props.onPositionChange(finalPosition);
        }
        // Автоматически запускаем сканирование выбранной позиции
        if (props.onAutoStart) {
            props.onAutoStart(finalPosition);
        }
    }, [isDragging, props.onPositionChange, props.onAutoStart]);

    // Добавляем глобальные обработчики событий (мышь и touch)
    useEffect(() => {
        if (isDragging) {
            // События мыши
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleEnd);
            
            // События touch
            document.addEventListener('touchmove', handleMove, { passive: false });
            document.addEventListener('touchend', handleEnd);
            document.addEventListener('touchcancel', handleEnd);
            
            return () => {
                // Удаляем события мыши
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleEnd);
                
                // Удаляем события touch
                document.removeEventListener('touchmove', handleMove);
                document.removeEventListener('touchend', handleEnd);
                document.removeEventListener('touchcancel', handleEnd);
            };
        }
    }, [isDragging, props.isManualMode, props.isScanning, handleMove, handleEnd]);

    // Константы для минимальной и максимальной страницы
    const MIN_PAGE = BigInt(1);
    const MAX_PAGE = BigInt('904625697166532776746648320380374280100293470930272690489102837043110636675');

    // Функция для проверки максимальной страницы
    const isMaxPage = (pageNumber) => {
      if (!pageNumber) return false;
      
      try {
        const pageBigInt = BigInt(pageNumber);
        return pageBigInt >= MAX_PAGE;
      } catch (error) {
        console.error('Error checking max page:', error);
        return false;
      }
    };

    // Функция для валидации и коррекции номера страницы
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

    // Функции для кнопок быстрого выбора
    const handleQuickSelect = (position) => {
        if (!props.isManualMode || props.isScanning || props.balanceFound) return;
        
        if (props.onInitializeAudio) {
            props.onInitializeAudio();
        }
        
        setLocalPosition(position);
        setVisualPosition(position);
        if (props.onPositionChange) {
            props.onPositionChange(position);
        }
        // УБРАНО: if (props.onAutoStart) { props.onAutoStart(position); }
    };

    // Функции для навигации по страницам
    const handleNextKeys = () => {
        if (!props.isManualMode || props.isScanning || props.balanceFound) return;
        
        if (props.onInitializeAudio) {
            props.onInitializeAudio();
        }
        
        // Получаем текущую страницу и увеличиваем на 1
        const currentPage = props.currentPage;
        console.log('Current page:', currentPage, 'Type:', typeof currentPage);
        
        if (currentPage !== null && currentPage !== undefined) {
            // Преобразуем в BigInt для точных вычислений с большими числами
            const currentPageBigInt = BigInt(currentPage);
            const nextPageBigInt = currentPageBigInt + BigInt(1);
            
            console.log('Current page (BigInt):', currentPageBigInt.toString());
            console.log('Next page (BigInt):', nextPageBigInt.toString());
            console.log('Next page (Number):', Number(nextPageBigInt));
            console.log('onSwitchToPage exists:', !!props.onSwitchToPage);
            
            // Передаем новую страницу как строку для сохранения точности
            if (props.onSwitchToPage) {
                console.log('Calling onSwitchToPage with:', nextPageBigInt.toString());
                props.onSwitchToPage(nextPageBigInt.toString());
            }
        }
    };

    const handlePrevKeys = () => {
        if (!props.isManualMode || props.isScanning || props.balanceFound) return;
        
        if (props.onInitializeAudio) {
            props.onInitializeAudio();
        }
        
        // Получаем текущую страницу и уменьшаем на 1
        const currentPage = props.currentPage;
        console.log('Current page (prev):', currentPage, 'Type:', typeof currentPage);
        
        if (currentPage !== null && currentPage !== undefined && currentPage > 1) {
            // Преобразуем в BigInt для точных вычислений с большими числами
            const currentPageBigInt = BigInt(currentPage);
            const prevPageBigInt = currentPageBigInt - BigInt(1);
            
            console.log('Current page (BigInt):', currentPageBigInt.toString());
            console.log('Prev page (BigInt):', prevPageBigInt.toString());
            console.log('Prev page (Number):', Number(prevPageBigInt));
            
            // Передаем новую страницу как строку для сохранения точности
            if (props.onSwitchToPage) {
                console.log('Calling onSwitchToPage with:', prevPageBigInt.toString());
                props.onSwitchToPage(prevPageBigInt.toString());
            }
        }
    };

    // Обработка подтверждения ввода страницы
    const handlePageConfirm = (pageNumber) => {
        if (props.onSwitchToPage) {
            console.log('Modal page input:', pageNumber);
            props.onSwitchToPage(pageNumber);
        }
    };

    // Обработка подтверждения ввода процента
    const handlePercentageConfirm = (position) => {
        handleQuickSelect(position);
    };
    
    return (
        <>
            <div className="pn-w">
                
                <div className={`pageBlock ${props.final ? 'PageNumberTotal' : ''} ${props.total ? 'PageNumberReceived' : ''}`}>
                    <div className="position-content">
                      <div className={`position-container ${props.balanceFound ? 'balance-found' : ''}`}>
                          
                          {/* Page label at top */}
                          <div className='page-label-row'>
                            <span className='page-label'>{t('pageNumber')} · {t('addressesCount')}</span>
                          </div>

                          {/* Navigation row: arrow - number (centered) - arrow */}
                          <div className='page-nav-row'>
                            <div className='nav-btn-column'>
                              <span className='page-nav-btn prev-btn'
                                onClick={() => {
                                  if (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && String(props.currentPage) !== '1') {
                                    handlePrevKeys();
                                  }
                                }}
                                style={{
                                  cursor: (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && String(props.currentPage) !== '1') ? 'pointer' : 'default',
                                  opacity: (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && String(props.currentPage) !== '1') ? 1 : 0.3
                                }}
                                title={t('prevKeys')}
                              >
                                <ChevronLeft size={18} />
                              </span>
                              <span className='page-nav-btn first-btn'
                                onClick={() => {
                                  if (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && String(props.currentPage) !== '1') {
                                    if (props.onSwitchToPage) {
                                      props.onSwitchToPage('1');
                                    }
                                  }
                                }}
                                style={{
                                  cursor: (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && String(props.currentPage) !== '1') ? 'pointer' : 'default',
                                  opacity: (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && String(props.currentPage) !== '1') ? 1 : 0.3
                                }}
                                title="0%"
                              >
                                <ChevronsLeft size={18} />
                              </span>
                            </div>
                            <div className='page-number-section'>
                              <span className='value-spacer'></span>
                              <span className='page-number'>
                                {props.currentPage !== null ?
                                  (typeof props.currentPage === 'string' ?
                                    props.currentPage :
                                    props.currentPage.toLocaleString('fullwide', { useGrouping: false })
                                  ) :
                                  '0'
                                }
                              </span>
                              <button
                                className='page-edit-btn'
                                onClick={() => setShowPageModal(true)}
                                disabled={!props.isManualMode || props.isScanning || props.balanceFound}
                                title={t('editPage')}
                              >
                                <Pencil size={14} />
                              </button>
                            </div>
                            <div className='nav-btn-column'>
                              <span className='page-nav-btn next-btn'
                                onClick={() => {
                                  if (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && !isMaxPage(props.currentPage)) {
                                    handleNextKeys();
                                  }
                                }}
                                style={{
                                  cursor: (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && !isMaxPage(props.currentPage)) ? 'pointer' : 'default',
                                  opacity: (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && !isMaxPage(props.currentPage)) ? 1 : 0.3
                                }}
                                title={t('nextKeys')}
                              >
                                <ChevronRight size={18} />
                              </span>
                              <span className='page-nav-btn last-btn'
                                onClick={() => {
                                  if (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && !isMaxPage(props.currentPage)) {
                                    if (props.onSwitchToPage) {
                                      props.onSwitchToPage('904625697166532776746648320380374280100293470930272690489102837043110636675');
                                    }
                                  }
                                }}
                                style={{
                                  cursor: (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && !isMaxPage(props.currentPage)) ? 'pointer' : 'default',
                                  opacity: (props.isManualMode && !props.isScanning && !props.balanceFound && props.currentPage !== null && !isMaxPage(props.currentPage)) ? 1 : 0.3
                                }}
                                title="100%"
                              >
                                <ChevronsRight size={18} />
                              </span>
                            </div>
                          </div>

                          {/* Slider */}
                          <div className='progress-bar-container'>
                              {/* Мелкий текст значения над бегунком с кнопкой редактирования */}
                              <div className='progress-value-section'>
                                <span className='value-spacer'></span>
                                <span className='progress-value-overlay'>
                                  {parseFloat((localPosition * 100).toFixed(8))}%
                                </span>
                                <button
                                  className='percent-edit-btn'
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowPercentageModal(true);
                                  }}
                                  disabled={!props.isManualMode || props.isScanning || props.balanceFound}
                                  title={t('quickInputTitle')}
                                >
                                  <Pencil size={14} />
                                </button>
                              </div>
                              <div
                                  className={`progress-bar ${props.isManualMode && !props.isScanning && !props.balanceFound ? 'interactive' : ''}`}
                                  ref={progressBarRef}
                                  onMouseDown={handleStart}
                                  onMouseUp={handleEnd}
                                  onTouchStart={handleStart}
                                  onTouchEnd={handleEnd}
                                  onClick={handleClick}
                                  style={{ cursor: props.isManualMode && !props.isScanning && !props.balanceFound ? 'pointer' : 'default' }}
                              >
                                  <div
                                      className='progress-fill'
                                      style={{ width: `${percentage}%` }}
                                  />
                                  <div
                                      className='progress-indicator'
                                      style={{ left: `${percentage}%` }}
                                  >
                                      <div className='indicator-dot'></div>
                                  </div>
                              </div>
                          </div>


                          {/* Balance row - at bottom */}
                          <div className="page-balance-row">
                            <div
                              className={`balance-card ${!props.isLoading && props.finalBalance > 0 ? 'has-balance' : ''} ${props.isLoading ? 'scanning' : ''} ${props.currentPage !== 0 && props.currentPage !== null ? 'clickable' : ''}`}
                              onClick={() => {
                                if (props.currentPage !== 0 && props.currentPage !== null) {
                                  if (props.onInitializeAudio) props.onInitializeAudio();
                                  if (props.setShowResults) props.setShowResults(true);
                                }
                              }}
                            >
                              {props.currentPage !== 0 && props.currentPage !== null && (
                                <Eye size={10} className="balance-eye-icon" />
                              )}
                              <div className="balance-card-header">
                                <Wallet size={12} className="balance-icon" />
                                <span className="balance-card-label">{t('finalBalance')}</span>
                              </div>
                              <span className="balance-card-value">
                                {props.isLoading ? (
                                  <span className="balance-loader"></span>
                                ) : (
                                  <>{props.formatBalance ? props.formatBalance(props.finalBalance || 0) : '0.00000000'} <span className="btc-suffix">BTC</span></>
                                )}
                              </span>
                            </div>
                            <div
                              className={`balance-card ${!props.isLoading && props.totalReceived > 0 ? 'has-received' : ''} ${props.isLoading ? 'scanning' : ''} ${props.currentPage !== 0 && props.currentPage !== null ? 'clickable' : ''}`}
                              onClick={() => {
                                if (props.currentPage !== 0 && props.currentPage !== null) {
                                  if (props.onInitializeAudio) props.onInitializeAudio();
                                  if (props.setShowResults) props.setShowResults(true);
                                }
                              }}
                            >
                              {props.currentPage !== 0 && props.currentPage !== null && (
                                <Eye size={10} className="balance-eye-icon" />
                              )}
                              <div className="balance-card-header">
                                <Wallet size={12} className="balance-icon" />
                                <span className="balance-card-label">{t('totalReceived')}</span>
                              </div>
                              <span className="balance-card-value">
                                {props.isLoading ? (
                                  <span className="balance-loader"></span>
                                ) : (
                                  <>{props.formatBalance ? props.formatBalance(props.totalReceived || 0) : '0.00000000'} <span className="btc-suffix">BTC</span></>
                                )}
                              </span>
                            </div>
                          </div>

                      </div>
                    </div>
                </div>
            </div>
            
            {/* Модальные окна */}
            <PageInputModal
              isOpen={showPageModal}
              onClose={() => setShowPageModal(false)}
              onConfirm={handlePageConfirm}
              currentPage={props.currentPage}
            />
            
            <PercentageInputModal
              isOpen={showPercentageModal}
              onClose={() => setShowPercentageModal(false)}
              onConfirm={handlePercentageConfirm}
              currentPosition={props.position}
            />
        </>
    );
}

export default PageNumber;