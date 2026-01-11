import styles from '../page.module.css';

export default function OCIPage() {
    return (
        <div className={styles.main}>
            <h1 className={styles.title}>OCI Services & Cost</h1>
            <div className={styles.grid}>
                <div style={{
                    background: 'var(--color-bg-glass)',
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-subtle)'
                }}>
                    <h3>Cost Overview</h3>
                    <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>
                        To be linked with OCI Cost Analysis API.
                    </p>
                </div>
                <div style={{
                    background: 'var(--color-bg-glass)',
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-subtle)'
                }}>
                    <h3>Active Regions</h3>
                    <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                        <span style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>us-ashburn-1</span>
                        <span style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>eu-frankfurt-1</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
