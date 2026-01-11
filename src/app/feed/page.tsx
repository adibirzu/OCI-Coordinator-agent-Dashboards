import { LogStream } from '@/components/dashboard/LogStream';
import styles from '../page.module.css';

export default function FeedPage() {
    return (
        <div className={styles.main}>
            <h1 className={styles.title}>Live Event Feed</h1>
            <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                <LogStream />
            </div>
        </div>
    );
}
