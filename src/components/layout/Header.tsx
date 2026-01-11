import styles from './Header.module.css';

interface HeaderProps {
    title?: string;
    isConnected?: boolean;
}

export function Header({ title = 'Dashboard', isConnected = false }: HeaderProps) {
    return (
        <header className={styles.header}>
            <h1 className={styles.title}>{title}</h1>

            <div className={styles.actions}>
                <div className={`${styles.status} ${isConnected ? styles.connected : ''}`}>
                    <div className={styles.dot} />
                    <span>{isConnected ? 'OCI Connected' : 'Offline'}</span>
                </div>
            </div>
        </header>
    );
}
