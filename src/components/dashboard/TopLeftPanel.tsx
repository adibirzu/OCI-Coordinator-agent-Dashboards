"use client";

import { useState } from 'react';
import { ServiceStatusGrid } from '@/components/dashboard/ServiceStatusGrid';
import { ArchitectureCanvas } from '@/components/dashboard/ArchitectureCanvas';
import styles from './TopLeftPanel.module.css';

export function TopLeftPanel() {
    const [activeTab, setActiveTab] = useState<'status' | 'architecture'>('status');

    return (
        <div className={styles.container}>
            <div className={styles.tabBar}>
                <button
                    onClick={() => setActiveTab('status')}
                    className={`${styles.tab} ${activeTab === 'status' ? styles.tabActive : ''}`}
                >
                    <span className={styles.tabIcon}>📊</span>
                    Service Status
                </button>
                <button
                    onClick={() => setActiveTab('architecture')}
                    className={`${styles.tab} ${activeTab === 'architecture' ? styles.tabActive : ''}`}
                >
                    <span className={styles.tabIcon}>🏗️</span>
                    Architecture
                </button>
            </div>
            <div className={styles.content}>
                {activeTab === 'status' ? <ServiceStatusGrid /> : <ArchitectureCanvas />}
            </div>
        </div>
    );
}
