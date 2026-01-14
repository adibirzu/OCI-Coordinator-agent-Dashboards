"use client";

import { useState } from 'react';
import { ArchitectureCanvas } from '@/components/dashboard/ArchitectureCanvas';
import { ArchitectureEnhancements } from '@/components/dashboard/ArchitectureEnhancements';
import styles from './page.module.css';

type ViewMode = 'split' | 'canvas' | 'enhancements';

export default function ArchitecturePage() {
    const [viewMode, setViewMode] = useState<ViewMode>('split');

    const getContainerClass = () => {
        switch (viewMode) {
            case 'canvas':
                return `${styles.splitContainer} ${styles.canvasOnly}`;
            case 'enhancements':
                return `${styles.splitContainer} ${styles.enhancementsOnly}`;
            default:
                return styles.splitContainer;
        }
    };

    return (
        <main className={styles.main}>
            <div className={styles.header}>
                <h1 className={styles.title}>System Architecture</h1>
                <div className={styles.viewToggle}>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'split' ? styles.active : ''}`}
                        onClick={() => setViewMode('split')}
                    >
                        Split View
                    </button>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'canvas' ? styles.active : ''}`}
                        onClick={() => setViewMode('canvas')}
                    >
                        Canvas Only
                    </button>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'enhancements' ? styles.active : ''}`}
                        onClick={() => setViewMode('enhancements')}
                    >
                        Dashboard
                    </button>
                </div>
            </div>

            <div className={getContainerClass()}>
                {/* Architecture Canvas Section */}
                <section className={styles.canvasSection}>
                    <div className={styles.canvasSectionHeader}>
                        <h2>Workflow Visualization</h2>
                    </div>
                    <div className={styles.content}>
                        <ArchitectureCanvas />
                    </div>
                </section>

                {/* Enhancements Dashboard Section */}
                <section className={styles.enhancementsSection}>
                    <div className={styles.enhancementsSectionHeader}>
                        <h2>System Dashboard</h2>
                    </div>
                    <div className={styles.enhancementsContent}>
                        <ArchitectureEnhancements />
                    </div>
                </section>
            </div>
        </main>
    );
}
