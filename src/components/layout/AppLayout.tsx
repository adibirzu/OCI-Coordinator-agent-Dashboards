import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { FloatingChat } from '@/components/chat/FloatingChat';
import styles from './AppLayout.module.css';

interface AppLayoutProps {
    children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
    return (
        <div className={styles.container}>
            <Sidebar />
            <div className={styles.contentWrapper}>
                <Header isConnected={true} /> {/* Mocking connection for visual test */}
                <main className={styles.main}>
                    {children}
                </main>
            </div>
            <FloatingChat />
        </div>
    );
}
