"use client";

import { ArchitectureCanvas } from '@/components/dashboard/ArchitectureCanvas';
import styles from './page.module.css';
import { LiveLogFeed } from '@/components/observability/LiveLogFeed';
import { ApmMetrics } from '@/components/observability/ApmMetrics';

export default function ArchitecturePage() {
    return (
        <main className={styles.main}>
            <h1 className={styles.title}>System Architecture</h1>
            <div className={styles.content}>
                <ArchitectureCanvas />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem', marginTop: '2rem' }}>
                <LiveLogFeed />
                <div>
                    <ApmMetrics />
                </div>
            </div>
        </main>
    );
}
