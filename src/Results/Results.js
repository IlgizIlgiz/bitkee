import React from 'react';
import { X, BarChart3 } from 'lucide-react';
import './Style.css';
import ResultItem from './ResultItem';
import { useTranslation } from '../hooks/useTranslation';

function Results(props) {
    const { t } = useTranslation();

    const getResultPriority = (item) => {
        const hasBalance = (item.publicKeyAddress?.final_balance > 0) ||
                          (item.compressedPublicKeyAddress?.final_balance > 0);
        const hasHistory = (item.publicKeyAddress?.total_received > 0) ||
                          (item.compressedPublicKeyAddress?.total_received > 0);

        if (hasBalance || hasHistory) {
            const maxBalance = Math.max(
                item.publicKeyAddress?.final_balance || 0,
                item.compressedPublicKeyAddress?.final_balance || 0,
                item.publicKeyAddress?.total_received || 0,
                item.compressedPublicKeyAddress?.total_received || 0
            );
            return { priority: 1, maxBalance };
        }

        return { priority: 0, maxBalance: 0 };
    };

    const sortedResults = props.balancesResult ? [...props.balancesResult].sort((a, b) => {
        const priorityA = getResultPriority(a);
        const priorityB = getResultPriority(b);

        if (priorityA.priority !== priorityB.priority) {
            return priorityB.priority - priorityA.priority;
        }

        if (priorityA.priority === 1) {
            return priorityB.maxBalance - priorityA.maxBalance;
        }

        return 0;
    }) : [];

    return (
        <div className='r-w'>
            <div className='resultsclose' onClick={() => {
                if (props.onInitializeAudio) {
                    props.onInitializeAudio();
                }
                props.setShowResults(false);
            }}></div>
            <div className='results'>
                <div className="resH">
                    <div className="resHT">
                        <BarChart3 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {t('resultsTitle')}
                    </div>
                    <div className="resultsC" onClick={() => {
                        if (props.onInitializeAudio) {
                            props.onInitializeAudio();
                        }
                        props.setShowResults(false);
                    }}>
                        <X size={14} className="closeSvg" />
                    </div>
                </div>
                <div className="resData">
                    {sortedResults && sortedResults.length > 0 ? (
                        sortedResults.map((item, index) => (
                            <ResultItem key={index} {...item} formatBalance={props.formatBalance} onInitializeAudio={props.onInitializeAudio}/>
                        ))
                    ) : (
                        <div style={{ color: 'var(--color-primary)', textAlign: 'center', padding: '20px' }}>
                            {t('noResults')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Results;