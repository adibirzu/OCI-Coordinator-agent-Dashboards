"use client";

import { ArchitectureCanvas } from '@/components/dashboard/ArchitectureCanvas';
import styles from './page.module.css';

export default function ArchitecturePage() {
    return (
        <main className={styles.main}>
            <h1 className={styles.title}>System Architecture</h1>
            <div className={styles.content}>
                <ArchitectureCanvas />
            </div>
        </main>
    );
}
