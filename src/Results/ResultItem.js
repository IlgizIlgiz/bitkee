import React from 'react';
import { ExternalLink, Wallet, Copy, Check } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

function ResultItem(props) {
    const { t } = useTranslation();
    const [copied, setCopied] = React.useState(null);

    if (!props.publicKeyAddress || !props.compressedPublicKeyAddress) {
        console.error('Missing required data in ResultItem:', props);
        return (
            <div className='resultItem'>
                <div style={{ color: '#ef4444', textAlign: 'center' }}>
                    {t('dataError')}
                </div>
            </div>
        );
    }

    const openExplorer = (address) => {
        window.open(`https://www.blockchain.com/explorer/addresses/btc/${address}`, '_blank');
    };

    const copyToClipboard = async (text, id) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(id);
            setTimeout(() => setCopied(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const isPositive = (addr) => (addr.final_balance > 0 || addr.total_received > 0);
    const hasAddress = (addr) => addr.address && addr.address.length > 0;

    // Check if any address has balance or history
    const hasAnyBalance = isPositive(props.publicKeyAddress) || isPositive(props.compressedPublicKeyAddress);

    // Render address section (only if address exists and has data)
    const renderAddressSection = (addr, label, key) => {
        if (!hasAddress(addr)) return null;

        const positive = isPositive(addr);

        return (
            <div className="address-section" key={key}>
                <div className="address-header">
                    <span className="address-label">{label}</span>
                    <div className="address-actions">
                        <button
                            className="icon-btn"
                            onClick={() => {
                                if (props.onInitializeAudio) props.onInitializeAudio();
                                openExplorer(addr.address);
                            }}
                            title={t('openExplorer')}
                        >
                            <ExternalLink size={12} />
                        </button>
                    </div>
                </div>
                <div className={`address-value${positive ? ' positive' : ''}`}>
                    {addr.address}
                </div>
                <div className="balance-row">
                    <div className={`balance-item${addr.final_balance > 0 ? ' has-balance' : ''}`}>
                        <Wallet size={10} />
                        <span className="balance-label">{t('finalBalance')}</span>
                        <span className="balance-value">
                            {props.formatBalance(addr.final_balance)} <span className="btc">BTC</span>
                        </span>
                    </div>
                    <div className={`balance-item${addr.total_received > 0 ? ' has-received' : ''}`}>
                        <Wallet size={10} />
                        <span className="balance-label">{t('totalReceived')}</span>
                        <span className="balance-value">
                            {props.formatBalance(addr.total_received)} <span className="btc">BTC</span>
                        </span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className='resultItem compact'>
            {renderAddressSection(props.publicKeyAddress, t('walletAddress'), 'uncompressed')}
            {renderAddressSection(props.compressedPublicKeyAddress, t('compressedAddress'), 'compressed')}

            <div className="private-key-section">
                <div className="private-key-header">
                    <span className="private-key-label">{t('privateKey')}</span>
                    <button
                        className={`icon-btn copy-btn${copied === 'wif' ? ' copied' : ''}`}
                        onClick={() => {
                            if (props.onInitializeAudio) props.onInitializeAudio();
                            copyToClipboard(props.privateKeyWIFUncompressed, 'wif');
                        }}
                        title={copied === 'wif' ? 'Copied!' : 'Copy'}
                    >
                        {copied === 'wif' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                </div>
                <div className={`private-key-value${hasAnyBalance ? ' has-balance' : ''}`}>
                    {props.privateKeyWIFUncompressed}
                </div>
            </div>
        </div>
    );
}

export default ResultItem;
