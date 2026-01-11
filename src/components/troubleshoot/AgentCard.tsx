import React from 'react';
import styles from './AgentCard.module.css';
import { ScenarioButton } from './ScenarioButton';

interface Scenario {
    label: string;
    prompt: string;
    icon?: string;
}

interface AgentCardProps {
    name: string;
    role: string;
    description: string;
    icon: string;
    scenarios: Scenario[];
    onScenarioClick: (scenario: Scenario, agentRole: string) => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({
    name,
    role,
    description,
    icon,
    scenarios,
    onScenarioClick
}) => {
    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <div className={styles.iconWrapper}>
                    {icon}
                </div>
                <div className={styles.titleWrapper}>
                    <h3 className={styles.title}>{name}</h3>
                    <span className={styles.role}>{role}</span>
                </div>
            </div>

            <p className={styles.description}>{description}</p>

            <div className={styles.scenarios}>
                <div className={styles.scenariosHeader}>Quick Workflows</div>
                {scenarios.map((scenario, index) => (
                    <ScenarioButton
                        key={index}
                        label={scenario.label}
                        icon={scenario.icon}
                        onClick={() => onScenarioClick(scenario, role)}
                    />
                ))}
            </div>
        </div>
    );
};
