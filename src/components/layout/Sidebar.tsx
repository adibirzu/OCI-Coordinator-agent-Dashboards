'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
    { label: 'Dashboard', href: '/' },
    { label: 'Observability', href: '/observability' },
    { label: 'Architecture', href: '/architecture' },
    { label: 'Troubleshoot', href: '/troubleshoot' },
    { label: 'Live Feed', href: '/feed' },
    { label: 'OCI Service/Cost', href: '/oci' },
    { label: 'Settings', href: '/settings' },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className={styles.sidebar}>
            <div className={styles.brand}>
                <span className={styles.brandText}>OCI/MCP View</span>
            </div>

            <nav className={styles.nav}>
                {NAV_ITEMS.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
                    >
                        {item.label}
                    </Link>
                ))}
            </nav>

            <div className={styles.footer}>
                v1.0.0
            </div>
        </aside>
    );
}
