import React from 'react';
import styles from './ScenarioButton.module.css';

interface ScenarioButtonProps {
    label: string;
    icon?: string;
    onClick: () => void;
    disabled?: boolean;
}

export const ScenarioButton: React.FC<ScenarioButtonProps> = ({
    label,
    icon = '🔧',
    onClick,
    disabled = false
}) => {
    return (
        <button
            className={styles.button}
            onClick={onClick}
            disabled={disabled}
        >
            <span>
                <span className={styles.icon}>{icon}</span>
                {label}
            </span>
            <span className={styles.arrow}>→</span>
        </button>
    );
};
