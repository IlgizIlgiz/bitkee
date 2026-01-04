/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
import { X, BookOpen } from 'lucide-react';
import './Style.css';
import { useTranslation } from '../hooks/useTranslation';

function History(props) {
    const { t } = useTranslation();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [currentOffset, setCurrentOffset] = useState(0);
    const LIMIT = 20;

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

    useEffect(() => {
        loadHistory();
    }, []);

    const handleScroll = (e) => {
        if (!hasMore || loading) return;
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            loadHistory(currentOffset);
        }
    };

    const showHistoryPosition = (pageNumber) => {
        props.setShowHistory(false);
        props.switchToPage(pageNumber, false);
    }

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

    return (
        <div className='r-w'>
            <div className='resultsclose' onClick={() => {
                if (props.onInitializeAudio) {
                    props.onInitializeAudio();
                }
                props.setShowHistory(false);
            }}></div>
            <div className='results' onScroll={handleScroll}>
                <div className="resH">
                    <div className="resHT">
                        <BookOpen size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {t('historyTitle')}
                    </div>
                    <div className="resultsC" onClick={() => {
                        if (props.onInitializeAudio) {
                            props.onInitializeAudio();
                        }
                        props.setShowHistory(false);
                    }}>
                        <X size={14} className="closeSvg" />
                    </div>
                </div>
                <div className="resData">
                    {history.length === 0 && !loading && !hasMore && (
                        <div className="emptyHistoryText">
                            {t('historyEmpty')}
                            <br />
                            <span style={{ fontSize: '11px', opacity: 0.7 }}>
                                {t('historyEmptySubtext')}
                            </span>
                        </div>
                    )}
                    {history.map((item, index) => (
                        <div key={index} className="historyItem" onClick={() => {
                            if (props.onInitializeAudio) {
                                props.onInitializeAudio();
                            }
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
                        <div className="loadingText">
                            {t('historyLoading')}
                        </div>
                    )}
                    {!hasMore && history.length > 0 && (
                        <div className="endText">
                            {t('historyEnd')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default History;