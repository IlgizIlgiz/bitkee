import React from 'react';
import { Send, HelpCircle, History } from 'lucide-react';
import './Style.css';
import LanguageSwitcher from '../components/LanguageSwitcher';
import SoundToggle from '../components/SoundToggle';
import { useTranslation } from '../hooks/useTranslation';

function Community(props) {
    const { t } = useTranslation();

    return (
        <div className="header-menu">
            <div className="menu-left">
                <a className="menu-item community-link" href="https://t.me/bitkeysapp" target="_blank" rel="noopener noreferrer">
                    <Send size={14} className="menu-icon" />
                    <span className="menu-text">{t('community')}</span>
                </a>
                <button
                    className="menu-item about-btn"
                    onClick={() => {
                        if (props.onInitializeAudio) {
                            props.onInitializeAudio();
                        }
                        props.setShowIntro(true);
                    }}
                    title={t('about')}
                >
                    <HelpCircle size={14} className="menu-icon" />
                    <span className="menu-text">{t('about')}</span>
                </button>
                <button className="menu-item history-link" onClick={() => {
                    if (props.onInitializeAudio) {
                        props.onInitializeAudio();
                    }
                    props.setShowHistory(true);
                }}>
                    <History size={14} className="menu-icon" />
                    <span className="menu-text">{t('history')}</span>
                </button>
            </div>
            <div className="menu-right">
                <SoundToggle
                    soundEnabled={props.soundEnabled}
                    setSoundEnabled={props.setSoundEnabled}
                />
                <LanguageSwitcher />
            </div>
        </div>
    );
}

export default Community;