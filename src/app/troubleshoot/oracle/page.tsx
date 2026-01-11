'use client';

import React, { useState, useEffect } from 'react';
import styles from './page.module.css';
import { BlockingTreeView } from '@/components/troubleshoot/oracle/BlockingTreeView';
import { CpuAwrView } from '@/components/troubleshoot/oracle/CpuAwrView';
import { SqlMonitorView } from '@/components/troubleshoot/oracle/SqlMonitorView';
import { ParallelExecView } from '@/components/troubleshoot/oracle/ParallelExecView';
import { ArchiveView } from '@/components/troubleshoot/oracle/ArchiveView';
import { DashboardView } from '@/components/troubleshoot/oracle/DashboardView';
import { AgentTerminal } from '@/components/troubleshoot/oracle/AgentTerminal';

type ViewType = 'dashboard' | 'blocking' | 'cpu' | 'sqlmon' | 'px' | 'archive';

interface ConnectionStatus {
    sqlMcp: boolean;
    opsiMcp: boolean;
    coordinator: boolean;
}

interface AvailableDatabase {
    id: string;
    name: string;
    type: string;
}

// Default databases - will be populated from coordinator
const DEFAULT_DATABASES: AvailableDatabase[] = [
    { id: 'ATPAdi', name: 'ATPAdi', type: 'Autonomous' },
];

export default function OracleTroubleshootPage() {
    const [currentView, setCurrentView] = useState<ViewType>('dashboard');
    const [selectedDatabase, setSelectedDatabase] = useState<string>('ATPAdi');
    const [availableDatabases, setAvailableDatabases] = useState<AvailableDatabase[]>(DEFAULT_DATABASES);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
        sqlMcp: false,
        opsiMcp: false,
        coordinator: false
    });

    // Check coordinator status on mount
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch('/api/coordinator/status');
                const data = await res.json();

                const mcpServers = data.mcp_servers || {};
                setConnectionStatus({
                    coordinator: data.status === 'running',
                    sqlMcp: !!mcpServers['database-observatory'],
                    opsiMcp: !!mcpServers['mcp-oci'] || !!mcpServers['database-observatory']
                });
            } catch {
                setConnectionStatus({ sqlMcp: false, opsiMcp: false, coordinator: false });
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className={styles.container}>
            {/* Sidebar Navigation */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.logoBox}>MCP</div>
                    <div className={styles.logoText}>
                        <h1>Orchestrator</h1>
                        <p>Oracle Troubleshooting Agent</p>
                    </div>
                </div>

                <nav className={styles.nav}>
                    <button
                        onClick={() => { setCurrentView('dashboard'); }}
                        className={`${styles.navButton} ${currentView === 'dashboard' ? styles.navButtonActive : ''}`}
                    >
                        <span className={styles.navIcon}>📊</span> Dashboard
                    </button>

                    <div className={styles.navSection}>Workflows</div>

                    <button
                        onClick={() => setCurrentView('blocking')}
                        className={`${styles.navButton} ${currentView === 'blocking' ? styles.navButtonActive : ''}`}
                    >
                        <span className={styles.navIcon}>🔒</span> 1. Blocking Tree
                    </button>
                    <button
                        onClick={() => setCurrentView('cpu')}
                        className={`${styles.navButton} ${currentView === 'cpu' ? styles.navButtonActive : ''}`}
                    >
                        <span className={styles.navIcon}>📈</span> 2. CPU / AWR (OPSI)
                    </button>
                    <button
                        onClick={() => setCurrentView('sqlmon')}
                        className={`${styles.navButton} ${currentView === 'sqlmon' ? styles.navButtonActive : ''}`}
                    >
                        <span className={styles.navIcon}>⏱️</span> 3/4. Active SQL
                    </button>
                    <button
                        onClick={() => setCurrentView('px')}
                        className={`${styles.navButton} ${currentView === 'px' ? styles.navButtonActive : ''}`}
                    >
                        <span className={styles.navIcon}>⚡</span> 5/6. Parallel Exec
                    </button>
                    <button
                        onClick={() => setCurrentView('archive')}
                        className={`${styles.navButton} ${currentView === 'archive' ? styles.navButtonActive : ''}`}
                    >
                        <span className={styles.navIcon}>📦</span> 7. Archive Diagnostics
                    </button>
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.statusIndicator}>
                        <div className={`${styles.statusDot} ${connectionStatus.coordinator ? styles.statusOnline : styles.statusOffline}`} />
                        <span>{connectionStatus.coordinator ? 'Agent Online' : 'Agent Offline'}</span>
                    </div>
                    <div className={styles.connectionInfo}>
                        {connectionStatus.sqlMcp && <span>SQL_MCP</span>}
                        {connectionStatus.opsiMcp && <span>OPSI_MCP</span>}
                        {!connectionStatus.sqlMcp && !connectionStatus.opsiMcp && <span>No MCP Connected</span>}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className={styles.main}>
                {/* Header */}
                <header className={styles.header}>
                    <h2 className={styles.pageTitle}>
                        {currentView === 'dashboard' && 'Operational Dashboard'}
                        {currentView === 'blocking' && 'Blocking Session Analysis'}
                        {currentView === 'cpu' && 'CPU Saturation Analysis'}
                        {currentView === 'sqlmon' && 'Real-Time SQL Monitoring'}
                        {currentView === 'px' && 'Parallel Execution Diagnostics'}
                        {currentView === 'archive' && 'Diagnostics Archive'}
                    </h2>
                    <div className={styles.databaseSelector}>
                        <label htmlFor="database-select">Target Database:</label>
                        <select
                            id="database-select"
                            value={selectedDatabase}
                            onChange={(e) => setSelectedDatabase(e.target.value)}
                            className={styles.databaseSelect}
                        >
                            {availableDatabases.map((db) => (
                                <option key={db.id} value={db.id}>
                                    {db.name} ({db.type})
                                </option>
                            ))}
                        </select>
                    </div>
                </header>

                {/* Content Viewport */}
                <div className={styles.viewport}>
                    {currentView === 'dashboard' && <DashboardView connectionStatus={connectionStatus} />}
                    {currentView === 'blocking' && <BlockingTreeView database={selectedDatabase} />}
                    {currentView === 'cpu' && <CpuAwrView database={selectedDatabase} />}
                    {currentView === 'sqlmon' && <SqlMonitorView database={selectedDatabase} />}
                    {currentView === 'px' && <ParallelExecView database={selectedDatabase} />}
                    {currentView === 'archive' && <ArchiveView database={selectedDatabase} />}
                </div>

                {/* Agent Terminal - Self-contained component with its own API polling */}
                <AgentTerminal />
            </main>
        </div>
    );
}
