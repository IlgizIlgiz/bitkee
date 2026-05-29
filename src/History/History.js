/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
import { X, BookOpen, Copy, Check, FileText, Key } from 'lucide-react';
import './Style.css';
import { useTranslation } from '../hooks/useTranslation';

function History(props) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('pages');
    const [history, setHistory] = useState([]);
    const [puzzleFinds, setPuzzleFinds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [currentOffset, setCurrentOffset] = useState(0);
    const [copied, setCopied] = useState(null);
    const LIMIT = 20;

    const copyToClipboard = async (text, id, e) => {
        if (e) e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(id);
            setTimeout(() => setCopied(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const loadHistory = async (offset = 0) => {
        setLoading(true);
        const savedHistory = await props.getHistoryFromDB(offset, LIMIT);
        if (savedHistory.length < LIMIT) {
            setHasMore(false);
        }
        setHistory(prevHistory => [...prevHistory, ...savedHistory]);
        setCurrentOffset(offset + LIMIT);
        setLoading(false);
    };

    const loadPuzzleFinds = async () => {
        if (props.getPuzzleFinds) {
            const finds = await props.getPuzzleFinds();
            setPuzzleFinds(finds);
        }
    };

    useEffect(() => {
        loadHistory();
        loadPuzzleFinds();
    }, []);

    const handleScroll = (e) => {
        if (activeTab !== 'pages' || !hasMore || loading) return;
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            loadHistory(currentOffset);
        }
    };

    const showHistoryPosition = (pageNumber) => {
        props.setShowHistory(false);
        props.switchToPage(pageNumber, false);
    };

    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatPageNumber = (pageNumber) => {
        if (typeof pageNumber === 'string' && pageNumber === 'lastPosition') {
            return 'N/A';
        }
        const pageStr = pageNumber.toString();
        if (pageStr.length <= 10) {
            return pageStr;
        }
        const start = pageStr.substring(0, 6);
        const end = pageStr.substring(pageStr.length - 4);
        return `${start}...${end}`;
    };

    // Записи режима «страницы» — без поля find (находки пазлов идут в свой таб)
    const pageItems = history.filter(item => !item.find);

    const closeHistory = () => {
        if (props.onInitializeAudio) props.onInitializeAudio();
        props.setShowHistory(false);
    };

    return (
        <div className='r-w'>
            <div className='resultsclose' onClick={closeHistory}></div>
            <div className='results' onScroll={handleScroll}>
                <div className="resH">
                    <div className="resHT">
                        <BookOpen size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {t('historyTitle')}
                    </div>
                    <div className="resultsC" onClick={closeHistory}>
                        <X size={14} className="closeSvg" />
                    </div>
                </div>

                {/* Табы: Страницы | Пазлы */}
                <div className="history-tabs">
                    <button
                        type="button"
                        className={`history-tab ${activeTab === 'pages' ? 'active' : ''}`}
                        onClick={() => setActiveTab('pages')}
                    >
                        <FileText size={12} /> {t('historyTabPages')}
                    </button>
                    <button
                        type="button"
                        className={`history-tab ${activeTab === 'puzzles' ? 'active' : ''}`}
                        onClick={() => setActiveTab('puzzles')}
                    >
                        <Key size={12} /> {t('historyTabPuzzles')}{puzzleFinds.length > 0 ? ` (${puzzleFinds.length})` : ''}
                    </button>
                </div>

                <div className="resData">
                    {activeTab === 'pages' ? (
                        <>
                            {pageItems.length === 0 && !loading && (
                                <div className="emptyHistoryText">
                                    {t('historyEmpty')}
                                    <br />
                                    <span style={{ fontSize: '11px', opacity: 0.7 }}>
                                        {t('historyEmptySubtext')}
                                    </span>
                                </div>
                            )}
                            {pageItems.map((item, index) => (
                                <div key={index} className="historyItem" onClick={() => {
                                    if (props.onInitializeAudio) props.onInitializeAudio();
                                    showHistoryPosition(item.pageNumber);
                                }}>
                                    <div className="historyItemDate">
                                        {formatDate(item.timestamp)}
                                    </div>
                                    <div className="historyItemPage">
                                        {t('page')}: {formatPageNumber(item.pageNumber)}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="loadingText">{t('historyLoading')}</div>
                            )}
                            {!hasMore && pageItems.length > 0 && (
                                <div className="endText">{t('historyEnd')}</div>
                            )}
                        </>
                    ) : (
                        <>
                            {puzzleFinds.length === 0 && (
                                <div className="emptyHistoryText">
                                    {t('historyPuzzlesEmpty')}
                                </div>
                            )}
                            {puzzleFinds.map((item, index) => (
                                <div key={index} className="historyFindCard">
                                    <div className="historyFindTop">
                                        <span className="historyFindName">
                                            <Key size={12} /> {item.find.puzzleName || t('privateKey')}
                                        </span>
                                        <span className="historyItemDate">{formatDate(item.timestamp)}</span>
                                    </div>
                                    <div className="historyFindAddr">{item.find.address}</div>
                                    <div className="historyFindRow">
                                        <span className="historyFindRowLabel">WIF</span>
                                        <span className="historyFindRowVal">{item.find.wif}</span>
                                        <button
                                            type="button"
                                            className={`historyCopyBtn${copied === `${index}-wif` ? ' copied' : ''}`}
                                            onClick={(e) => copyToClipboard(item.find.wif, `${index}-wif`, e)}
                                            title="Copy WIF"
                                        >
                                            {copied === `${index}-wif` ? <Check size={12} /> : <Copy size={12} />}
                                        </button>
                                    </div>
                                    {item.find.hex && (
                                        <div className="historyFindRow">
                                            <span className="historyFindRowLabel">HEX</span>
                                            <span className="historyFindRowVal">{item.find.hex}</span>
                                            <button
                                                type="button"
                                                className={`historyCopyBtn${copied === `${index}-hex` ? ' copied' : ''}`}
                                                onClick={(e) => copyToClipboard(item.find.hex, `${index}-hex`, e)}
                                                title="Copy HEX"
                                            >
                                                {copied === `${index}-hex` ? <Check size={12} /> : <Copy size={12} />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default History;
