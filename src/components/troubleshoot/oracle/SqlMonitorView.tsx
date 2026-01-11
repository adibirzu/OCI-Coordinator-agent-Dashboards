'use client';

import React, { useState, useEffect } from 'react';
import styles from './SqlMonitorView.module.css';

interface SqlExecution {
    sql_id: string;
    sql_exec_id: number;
    status: 'EXECUTING' | 'DONE' | 'DONE (ERROR)' | 'QUEUED';
    username: string;
    sql_text: string;
    elapsed_time_secs: number;
    cpu_time_secs: number;
    buffer_gets: number;
    disk_reads: number;
    rows_processed: number;
    dop: number;
    px_servers_allocated: number;
    last_refresh_time: string;
    velocity?: number; // rows/sec
    is_hung?: boolean;
}

interface SqlMonitorData {
    executions: SqlExecution[];
    summary: {
        total_executing: number;
        total_hung: number;
        avg_elapsed_time: number;
    };
    status: 'loading' | 'connected' | 'mock' | 'error';
}

interface SqlMonitorViewProps {
    database: string;
}

export function SqlMonitorView({ database }: SqlMonitorViewProps) {
    const [data, setData] = useState<SqlMonitorData>({
        executions: [],
        summary: { total_executing: 0, total_hung: 0, avg_elapsed_time: 0 },
        status: 'loading'
    });
    const [selectedSql, setSelectedSql] = useState<SqlExecution | null>(null);
    const [filter, setFilter] = useState<'all' | 'executing' | 'hung'>('all');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/troubleshoot/oracle/sqlmon?database=${encodeURIComponent(database)}`);
                const result = await res.json();
                // Preserve the status from the API (connected, error, etc.)
                setData(result);
            } catch {
                setData({
                    executions: [],
                    summary: { total_executing: 0, total_hung: 0, avg_elapsed_time: 0 },
                    status: 'error'
                });
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [database]);

    const filteredExecutions = data.executions.filter(exec => {
        if (filter === 'executing') return exec.status === 'EXECUTING';
        if (filter === 'hung') return exec.is_hung;
        return true;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'EXECUTING': return '#3b82f6';
            case 'DONE': return '#22c55e';
            case 'DONE (ERROR)': return '#ef4444';
            case 'QUEUED': return '#f59e0b';
            default: return '#64748b';
        }
    };

    return (
        <div className={styles.container}>
            {/* Summary Cards */}
            <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryValue}>{data.summary.total_executing}</div>
                    <div className={styles.summaryLabel}>Currently Executing</div>
                </div>
                <div className={`${styles.summaryCard} ${data.summary.total_hung > 0 ? styles.alert : ''}`}>
                    <div className={styles.summaryValue}>{data.summary.total_hung}</div>
                    <div className={styles.summaryLabel}>Potentially Hung</div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryValue}>{data.summary.avg_elapsed_time.toFixed(1)}s</div>
                    <div className={styles.summaryLabel}>Avg Elapsed Time</div>
                </div>
            </div>

            {/* Status and Filters */}
            <div className={styles.toolbar}>
                <div className={styles.statusIndicator}>
                    <span className={`${styles.statusDot} ${styles[data.status]}`} />
                    <span className={styles.statusText}>
                        {data.status === 'mock' && 'Demo Mode - Connect SQL MCP for live monitoring'}
                        {data.status === 'connected' && 'Connected to SQL MCP'}
                        {data.status === 'loading' && 'Loading...'}
                    </span>
                </div>
                <div className={styles.filterGroup}>
                    <button
                        className={`${styles.filterBtn} ${filter === 'all' ? styles.active : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All ({data.executions.length})
                    </button>
                    <button
                        className={`${styles.filterBtn} ${filter === 'executing' ? styles.active : ''}`}
                        onClick={() => setFilter('executing')}
                    >
                        Executing
                    </button>
                    <button
                        className={`${styles.filterBtn} ${filter === 'hung' ? styles.active : ''}`}
                        onClick={() => setFilter('hung')}
                    >
                        Hung
                    </button>
                </div>
            </div>

            <div className={styles.content}>
                {/* SQL Executions Table */}
                <div className={styles.tableCard}>
                    <h3>Active SQL Executions</h3>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>SQL ID</th>
                                    <th>Status</th>
                                    <th>User</th>
                                    <th>Elapsed</th>
                                    <th>CPU</th>
                                    <th>Buffer Gets</th>
                                    <th>Rows</th>
                                    <th>Velocity</th>
                                    <th>DOP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredExecutions.map(exec => (
                                    <tr
                                        key={`${exec.sql_id}-${exec.sql_exec_id}`}
                                        className={`${exec.is_hung ? styles.hungRow : ''} ${selectedSql?.sql_id === exec.sql_id ? styles.selectedRow : ''}`}
                                        onClick={() => setSelectedSql(exec)}
                                    >
                                        <td className={styles.mono}>{exec.sql_id}</td>
                                        <td>
                                            <span
                                                className={styles.statusBadge}
                                                style={{ backgroundColor: getStatusColor(exec.status) }}
                                            >
                                                {exec.status}
                                            </span>
                                            {exec.is_hung && <span className={styles.hungBadge}>HUNG?</span>}
                                        </td>
                                        <td>{exec.username}</td>
                                        <td>{formatDuration(exec.elapsed_time_secs)}</td>
                                        <td>{formatDuration(exec.cpu_time_secs)}</td>
                                        <td>{formatNumber(exec.buffer_gets)}</td>
                                        <td>{formatNumber(exec.rows_processed)}</td>
                                        <td className={exec.velocity === 0 ? styles.warning : ''}>
                                            {exec.velocity !== undefined ? `${formatNumber(exec.velocity)}/s` : 'N/A'}
                                        </td>
                                        <td>
                                            {exec.dop > 1 ? (
                                                <span className={styles.dopBadge}>
                                                    {exec.px_servers_allocated}/{exec.dop}
                                                </span>
                                            ) : (
                                                'Serial'
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* SQL Detail Panel */}
                {selectedSql && (
                    <div className={styles.detailPanel}>
                        <div className={styles.detailHeader}>
                            <h3>SQL Details</h3>
                            <button className={styles.closeBtn} onClick={() => setSelectedSql(null)}>×</button>
                        </div>
                        <div className={styles.detailContent}>
                            <div className={styles.detailRow}>
                                <span className={styles.label}>SQL ID:</span>
                                <span className={styles.valueMono}>{selectedSql.sql_id}</span>
                            </div>
                            <div className={styles.detailRow}>
                                <span className={styles.label}>Exec ID:</span>
                                <span className={styles.value}>{selectedSql.sql_exec_id}</span>
                            </div>
                            <div className={styles.detailRow}>
                                <span className={styles.label}>Last Refresh:</span>
                                <span className={styles.value}>{selectedSql.last_refresh_time}</span>
                            </div>
                            <div className={styles.sqlText}>
                                <span className={styles.label}>SQL Text:</span>
                                <pre>{selectedSql.sql_text}</pre>
                            </div>
                            {selectedSql.is_hung && (
                                <div className={styles.hungAlert}>
                                    <strong>⚠️ Potentially Hung</strong>
                                    <p>Velocity is 0 rows/sec for extended period. Check for blocking or resource contention.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function formatDuration(secs: number): string {
    if (secs < 60) return `${secs.toFixed(1)}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}m ${remainSecs.toFixed(0)}s`;
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}
