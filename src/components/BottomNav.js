import React from 'react';
import { FileText, Puzzle, Send, Info, BookOpen } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import './BottomNav.css';

function BottomNav({ puzzleMode, onSwitchToPages, onSwitchToPuzzle, onOpenCommunity, onOpenInfo, onOpenHistory }) {
    const { t } = useTranslation();

    return (
        <nav className="bottom-nav">
            <button
                className={`bottom-nav-item ${!puzzleMode ? 'active' : ''}`}
                onClick={onSwitchToPages}
            >
                <FileText size={20} />
                <span>{t('pagesMode')}</span>
            </button>
            <button
                className={`bottom-nav-item ${puzzleMode ? 'active' : ''}`}
                onClick={onSwitchToPuzzle}
            >
                <Puzzle size={20} />
                <span>{t('puzzleMode')}</span>
            </button>
            <a
                className="bottom-nav-item"
                href="https://t.me/bitkeysapp"
                target="_blank"
                rel="noopener noreferrer"
            >
                <Send size={20} />
                <span>{t('community')}</span>
            </a>
            <button className="bottom-nav-item" onClick={onOpenInfo}>
                <Info size={20} />
                <span>{t('about')}</span>
            </button>
            <button className="bottom-nav-item" onClick={onOpenHistory}>
                <BookOpen size={20} />
                <span>{t('history')}</span>
            </button>
        </nav>
    );
}

export default BottomNav;
