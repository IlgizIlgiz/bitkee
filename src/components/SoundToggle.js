import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import './SoundToggle.css';

const SoundToggle = ({ soundEnabled, setSoundEnabled }) => {
  const { t } = useTranslation();

  const handleToggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  return (
    <button
      className={`sound-toggle-btn ${soundEnabled ? 'enabled' : 'disabled'}`}
      onClick={handleToggleSound}
      title={soundEnabled ? t('soundDisable') : t('soundEnable')}
    >
      {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </button>
  );
};

export default SoundToggle;