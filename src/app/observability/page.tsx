'use client';

import React, { useState } from 'react';
import { TraceViewer } from '@/components/observability/TraceViewer';
import { ApmMetrics } from '@/components/observability/ApmMetrics';
import { InstanceSelector } from '@/components/observability/InstanceSelector';
import styles from './page.module.css';

type ViewMode = 'traces' | 'metrics' | 'both';

interface Instance {
    id: string;
    displayName: string;
    lifecycleState: string;
    shape: string;
}

export default function ObservabilityPage() {
    const [viewMode, setViewMode] = useState<ViewMode>('both');
    const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.titleSection}>
                    <h1 className={styles.title}>
                        <span className={styles.titleIcon}>📊</span>
                        Observability
                    </h1>
                    <p className={styles.subtitle}>
                        Distributed traces, APM metrics, and performance insights
                    </p>
                </div>
                <div className={styles.headerControls}>
                    <InstanceSelector
                        onInstanceChange={setSelectedInstance}
                        selectedInstanceId={selectedInstance?.id}
                        showAllOption={true}
                        filterRunning={false}
                    />
                </div>
                <div className={styles.viewToggle}>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'both' ? styles.active : ''}`}
                        onClick={() => setViewMode('both')}
                    >
                        <span className={styles.toggleIcon}>◫</span>
                        Split View
                    </button>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'traces' ? styles.active : ''}`}
                        onClick={() => setViewMode('traces')}
                    >
                        <span className={styles.toggleIcon}>⋮</span>
                        Traces Only
                    </button>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'metrics' ? styles.active : ''}`}
                        onClick={() => setViewMode('metrics')}
                    >
                        <span className={styles.toggleIcon}>◔</span>
                        Metrics Only
                    </button>
                </div>
            </header>

            <main className={styles.main}>
                {viewMode === 'both' && (
                    <div className={styles.splitLayout}>
                        <div className={styles.metricsPanel}>
                            <div className={styles.sectionHeader}>
                                <span className={styles.sectionIcon}>📈</span>
                                APM Metrics
                            </div>
                            <ApmMetrics
                                instanceId={selectedInstance?.id}
                                instanceName={selectedInstance?.displayName}
                            />
                        </div>
                        <div className={styles.tracesPanel}>
                            <div className={styles.sectionHeader}>
                                <span className={styles.sectionIcon}>🔗</span>
                                Distributed Traces
                            </div>
                            <TraceViewer
                                instanceId={selectedInstance?.id}
                                instanceName={selectedInstance?.displayName}
                            />
                        </div>
                    </div>
                )}

                {viewMode === 'traces' && (
                    <div className={styles.fullLayout}>
                        <TraceViewer
                            instanceId={selectedInstance?.id}
                            instanceName={selectedInstance?.displayName}
                        />
                    </div>
                )}

                {viewMode === 'metrics' && (
                    <div className={styles.fullLayout}>
                        <ApmMetrics
                            instanceId={selectedInstance?.id}
                            instanceName={selectedInstance?.displayName}
                        />
                    </div>
                )}
            </main>
        </div>
    );
}
