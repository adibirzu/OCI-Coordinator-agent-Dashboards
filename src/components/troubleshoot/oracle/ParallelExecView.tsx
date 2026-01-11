'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './ParallelExecView.module.css';

interface PxSession {
    qcsid: number;
    qcserial: number;
    qcinst: number;
    username: string;
    sql_id: string;
    req_dop: number;
    actual_dop: number;
    px_servers_active: number;
    status: 'ACTIVE' | 'DONE' | 'ERROR';
    elapsed_secs: number;
    start_time: string;
}

interface PxStats {
    px_servers_total: number;
    px_servers_active: number;
    px_servers_idle: number;
    parallel_max_servers: number;
}

interface DowngradeEvent {
    sql_id: string;
    timestamp: string;
    requested_dop: number;
    actual_dop: number;
    reason: string;
}

interface PxData {
    sessions: PxSession[];
    stats: PxStats;
    downgrades: DowngradeEvent[];
    status: 'loading' | 'connected' | 'mock' | 'error';
}

interface ParallelExecViewProps {
    database: string;
}

export function ParallelExecView({ database }: ParallelExecViewProps) {
    const [data, setData] = useState<PxData>({
        sessions: [],
        stats: { px_servers_total: 0, px_servers_active: 0, px_servers_idle: 0, parallel_max_servers: 0 },
        downgrades: [],
        status: 'loading'
    });
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<unknown>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/troubleshoot/oracle/px?database=${encodeURIComponent(database)}`);
                const result = await res.json();
                // Map API response to component's expected format
                setData({
                    sessions: (result.sessions || []).map((s: Record<string, unknown>) => ({
                        qcsid: s.qc_sid || 0,
                        qcserial: s.qc_serial || 0,
                        qcinst: 1,
                        username: s.username || 'UNKNOWN',
                        sql_id: s.sql_id || '',
                        req_dop: s.requested_dop || 1,
                        actual_dop: s.actual_dop || 1,
                        px_servers_active: s.servers_allocated || 0,
                        status: s.status || 'DONE',
                        elapsed_secs: s.elapsed_seconds || 0,
                        start_time: ''
                    })),
                    stats: {
                        px_servers_total: result.servers_in_use || 0,
                        px_servers_active: result.servers_in_use || 0,
                        px_servers_idle: result.servers_available || 0,
                        parallel_max_servers: result.max_parallel_servers || 0
                    },
                    downgrades: (result.recent_downgrades || []).map((d: Record<string, unknown>) => ({
                        sql_id: d.sql_id || '',
                        timestamp: d.timestamp || '',
                        requested_dop: d.requested_dop || 0,
                        actual_dop: d.actual_dop || 0,
                        reason: d.reason || 'Unknown'
                    })),
                    status: result.status || 'error'
                });
            } catch {
                setData({
                    sessions: [],
                    stats: { px_servers_total: 0, px_servers_active: 0, px_servers_idle: 0, parallel_max_servers: 0 },
                    downgrades: [],
                    status: 'error'
                });
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [database]);

    useEffect(() => {
        if (!chartRef.current || !data.stats.parallel_max_servers) return;

        const loadChart = async () => {
            const { Chart, registerables } = await import('chart.js');
            Chart.register(...registerables);

            if (chartInstance.current) {
                (chartInstance.current as { destroy: () => void }).destroy();
            }

            const ctx = chartRef.current?.getContext('2d');
            if (!ctx) return;

            chartInstance.current = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Active', 'Idle', 'Available'],
                    datasets: [{
                        data: [
                            data.stats.px_servers_active,
                            data.stats.px_servers_idle,
                            data.stats.parallel_max_servers - data.stats.px_servers_total
                        ],
                        backgroundColor: ['#c74634', '#3b82f6', '#1e293b'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#94a3b8', font: { size: 11 } }
                        }
                    }
                }
            });
        };

        loadChart();

        return () => {
            if (chartInstance.current) {
                (chartInstance.current as { destroy: () => void }).destroy();
            }
        };
    }, [data.stats]);

    const getUtilizationPct = () => {
        if (data.stats.parallel_max_servers === 0) return 0;
        return (data.stats.px_servers_active / data.stats.parallel_max_servers) * 100;
    };

    const getDopEfficiency = (session: PxSession) => {
        if (session.req_dop === 0) return 100;
        return (session.actual_dop / session.req_dop) * 100;
    };

    return (
        <div className={styles.container}>
            {/* Status Bar */}
            <div className={styles.statusBar}>
                <span className={`${styles.statusDot} ${styles[data.status]}`} />
                <span className={styles.statusText}>
                    {data.status === 'loading' && 'Loading PX data...'}
                    {data.status === 'connected' && 'Connected to SQL MCP'}
                    {data.status === 'mock' && 'Demo Mode - Connect SQL MCP for live PX monitoring'}
                    {data.status === 'error' && 'Connection error'}
                </span>
            </div>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statValue}>{data.stats.px_servers_active}</div>
                    <div className={styles.statLabel}>Active PX Servers</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statValue}>{data.stats.px_servers_idle}</div>
                    <div className={styles.statLabel}>Idle PX Servers</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statValue}>{data.stats.parallel_max_servers}</div>
                    <div className={styles.statLabel}>Max PX Servers</div>
                </div>
                <div className={`${styles.statCard} ${getUtilizationPct() > 80 ? styles.warning : ''}`}>
                    <div className={styles.statValue}>{getUtilizationPct().toFixed(1)}%</div>
                    <div className={styles.statLabel}>PX Utilization</div>
                </div>
            </div>

            <div className={styles.mainContent}>
                {/* PX Server Chart */}
                <div className={styles.chartCard}>
                    <h3>PX Server Allocation</h3>
                    <div className={styles.chartContainer}>
                        <canvas ref={chartRef} />
                    </div>
                    <div className={styles.chartCenter}>
                        <div className={styles.centerValue}>{data.stats.px_servers_total}</div>
                        <div className={styles.centerLabel}>Total Allocated</div>
                    </div>
                </div>

                {/* Active PX Sessions */}
                <div className={styles.sessionsCard}>
                    <h3>Active Parallel Operations ({data.sessions.filter(s => s.status === 'ACTIVE').length})</h3>
                    <div className={styles.sessionsList}>
                        {data.sessions.filter(s => s.status === 'ACTIVE').map(session => (
                            <div key={`${session.qcinst}-${session.qcsid}`} className={styles.sessionItem}>
                                <div className={styles.sessionHeader}>
                                    <span className={styles.sessionId}>
                                        QC: {session.qcsid},{session.qcserial}@{session.qcinst}
                                    </span>
                                    <span className={styles.sqlId}>{session.sql_id}</span>
                                </div>
                                <div className={styles.sessionDetails}>
                                    <div className={styles.detailItem}>
                                        <span className={styles.label}>User:</span>
                                        <span className={styles.value}>{session.username}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.label}>DOP:</span>
                                        <span className={`${styles.value} ${getDopEfficiency(session) < 100 ? styles.degraded : ''}`}>
                                            {session.actual_dop}/{session.req_dop}
                                            {getDopEfficiency(session) < 100 && (
                                                <span className={styles.degradeBadge}>
                                                    {getDopEfficiency(session).toFixed(0)}%
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.label}>PX Active:</span>
                                        <span className={styles.value}>{session.px_servers_active}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.label}>Elapsed:</span>
                                        <span className={styles.value}>{formatDuration(session.elapsed_secs)}</span>
                                    </div>
                                </div>
                                <div className={styles.dopBar}>
                                    <div
                                        className={styles.dopFill}
                                        style={{ width: `${getDopEfficiency(session)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                        {data.sessions.filter(s => s.status === 'ACTIVE').length === 0 && (
                            <div className={styles.emptyState}>
                                <span className={styles.emptyIcon}>⚡</span>
                                <p>No active parallel operations</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Downgrade Events */}
            {data.downgrades.length > 0 && (
                <div className={styles.downgradeCard}>
                    <h3>Recent DOP Downgrade Events</h3>
                    <div className={styles.downgradeList}>
                        {data.downgrades.map((event, idx) => (
                            <div key={idx} className={styles.downgradeItem}>
                                <div className={styles.downgradeHeader}>
                                    <span className={styles.sqlId}>{event.sql_id}</span>
                                    <span className={styles.timestamp}>{event.timestamp}</span>
                                </div>
                                <div className={styles.downgradeDetails}>
                                    <span className={styles.dopChange}>
                                        DOP: {event.requested_dop} → {event.actual_dop}
                                    </span>
                                    <span className={styles.reason}>{event.reason}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function formatDuration(secs: number): string {
    if (secs < 60) return `${secs.toFixed(0)}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = Math.floor(secs % 60);
    return `${mins}m ${remainSecs}s`;
}
