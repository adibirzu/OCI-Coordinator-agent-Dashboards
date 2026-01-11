'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './CpuAwrView.module.css';

interface AwrSnapshot {
    snap_id: number;
    end_time: string;
    db_time: number;
    cpu_time: number;
    wait_time: number;
}

interface TopEvent {
    event: string;
    waits: number;
    time_waited_secs: number;
    pct_db_time: number;
    wait_class: string;
}

interface CpuData {
    snapshots: AwrSnapshot[];
    topEvents: TopEvent[];
    loadProfile: {
        db_time_per_sec: number;
        cpu_per_sec: number;
        redo_per_sec: number;
        logical_reads_per_sec: number;
    };
    resourceManager: {
        throttle_pct: number;
        consumer_group: string;
        cpu_limit: number;
    };
    status: 'loading' | 'connected' | 'mock' | 'error';
}

interface CpuAwrViewProps {
    database: string;
}

export function CpuAwrView({ database }: CpuAwrViewProps) {
    const [data, setData] = useState<CpuData>({
        snapshots: [],
        topEvents: [],
        loadProfile: { db_time_per_sec: 0, cpu_per_sec: 0, redo_per_sec: 0, logical_reads_per_sec: 0 },
        resourceManager: { throttle_pct: 0, consumer_group: '', cpu_limit: 100 },
        status: 'loading'
    });
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<unknown>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/troubleshoot/oracle/awr?database=${encodeURIComponent(database)}`);
                const result = await res.json();
                // Preserve the status from the API (connected, error, etc.)
                setData(result);
            } catch {
                setData({
                    snapshots: [],
                    topEvents: [],
                    loadProfile: { db_time_per_sec: 0, cpu_per_sec: 0, redo_per_sec: 0, logical_reads_per_sec: 0 },
                    resourceManager: { throttle_pct: 0, consumer_group: '', cpu_limit: 100 },
                    status: 'error'
                });
            }
        };

        fetchData();
    }, [database]);

    useEffect(() => {
        if (!chartRef.current || data.snapshots.length === 0) return;

        const loadChart = async () => {
            const { Chart, registerables } = await import('chart.js');
            Chart.register(...registerables);

            if (chartInstance.current) {
                (chartInstance.current as { destroy: () => void }).destroy();
            }

            const ctx = chartRef.current?.getContext('2d');
            if (!ctx) return;

            chartInstance.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.snapshots.map(s => s.end_time),
                    datasets: [
                        {
                            label: 'DB Time (s)',
                            data: data.snapshots.map(s => s.db_time),
                            borderColor: '#c74634',
                            backgroundColor: 'rgba(199, 70, 52, 0.1)',
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'CPU Time (s)',
                            data: data.snapshots.map(s => s.cpu_time),
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'Wait Time (s)',
                            data: data.snapshots.map(s => s.wait_time),
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            fill: true,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { color: '#94a3b8', font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#64748b', font: { size: 10 } }
                        },
                        y: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#64748b', font: { size: 10 } }
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
    }, [data.snapshots]);

    const getWaitClassColor = (waitClass: string): string => {
        const colors: Record<string, string> = {
            'CPU': '#3b82f6',
            'User I/O': '#22c55e',
            'System I/O': '#10b981',
            'Concurrency': '#f59e0b',
            'Application': '#ef4444',
            'Cluster': '#8b5cf6',
            'Configuration': '#ec4899',
            'Network': '#06b6d4'
        };
        return colors[waitClass] || '#64748b';
    };

    return (
        <div className={styles.container}>
            {/* Status Bar */}
            <div className={styles.statusBar}>
                <span className={`${styles.statusDot} ${styles[data.status]}`} />
                <span className={styles.statusText}>
                    {data.status === 'loading' && 'Loading AWR data...'}
                    {data.status === 'connected' && 'Connected to OPSI MCP'}
                    {data.status === 'mock' && 'Demo Mode - Connect OPSI MCP for live AWR reports'}
                    {data.status === 'error' && 'Connection error'}
                </span>
            </div>

            {/* Load Profile Cards */}
            <div className={styles.loadProfileGrid}>
                <div className={styles.loadCard}>
                    <div className={styles.loadValue}>{data.loadProfile.db_time_per_sec.toFixed(2)}</div>
                    <div className={styles.loadLabel}>DB Time / sec</div>
                </div>
                <div className={styles.loadCard}>
                    <div className={styles.loadValue}>{data.loadProfile.cpu_per_sec.toFixed(2)}</div>
                    <div className={styles.loadLabel}>CPU / sec</div>
                </div>
                <div className={styles.loadCard}>
                    <div className={styles.loadValue}>{formatBytes(data.loadProfile.redo_per_sec)}</div>
                    <div className={styles.loadLabel}>Redo / sec</div>
                </div>
                <div className={styles.loadCard}>
                    <div className={styles.loadValue}>{formatNumber(data.loadProfile.logical_reads_per_sec)}</div>
                    <div className={styles.loadLabel}>Logical Reads / sec</div>
                </div>
            </div>

            {/* Resource Manager Warning */}
            {data.resourceManager.throttle_pct > 0 && (
                <div className={styles.throttleWarning}>
                    <span className={styles.warningIcon}>⚠️</span>
                    <div className={styles.warningContent}>
                        <strong>Resource Manager Throttling Detected</strong>
                        <p>
                            Consumer Group <code>{data.resourceManager.consumer_group}</code> is being
                            throttled at {data.resourceManager.throttle_pct.toFixed(1)}%
                            (CPU Limit: {data.resourceManager.cpu_limit}%)
                        </p>
                    </div>
                </div>
            )}

            <div className={styles.chartsRow}>
                {/* DB Time Chart */}
                <div className={styles.chartCard}>
                    <h3>DB Time Analysis (AWR)</h3>
                    <div className={styles.chartContainer}>
                        <canvas ref={chartRef} />
                    </div>
                </div>

                {/* Top 5 Timed Events */}
                <div className={styles.eventsCard}>
                    <h3>Top 5 Timed Events</h3>
                    <div className={styles.eventsList}>
                        {data.topEvents.slice(0, 5).map((event, idx) => (
                            <div key={idx} className={styles.eventRow}>
                                <div className={styles.eventRank}>{idx + 1}</div>
                                <div className={styles.eventInfo}>
                                    <div className={styles.eventName}>{event.event}</div>
                                    <div className={styles.eventMeta}>
                                        <span
                                            className={styles.eventClass}
                                            style={{ backgroundColor: getWaitClassColor(event.wait_class) }}
                                        >
                                            {event.wait_class}
                                        </span>
                                        <span>{formatNumber(event.waits)} waits</span>
                                        <span>{event.time_waited_secs.toFixed(1)}s</span>
                                    </div>
                                </div>
                                <div className={styles.eventPct}>
                                    <div className={styles.pctValue}>{event.pct_db_time.toFixed(1)}%</div>
                                    <div
                                        className={styles.pctBar}
                                        style={{
                                            width: `${Math.min(event.pct_db_time, 100)}%`,
                                            backgroundColor: getWaitClassColor(event.wait_class)
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* AWR Snapshots Table */}
            <div className={styles.tableCard}>
                <h3>AWR Snapshots</h3>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Snap ID</th>
                                <th>End Time</th>
                                <th>DB Time (s)</th>
                                <th>CPU Time (s)</th>
                                <th>Wait Time (s)</th>
                                <th>CPU %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.snapshots.map(snap => (
                                <tr key={snap.snap_id}>
                                    <td className={styles.mono}>{snap.snap_id}</td>
                                    <td>{snap.end_time}</td>
                                    <td>{snap.db_time.toFixed(1)}</td>
                                    <td>{snap.cpu_time.toFixed(1)}</td>
                                    <td>{snap.wait_time.toFixed(1)}</td>
                                    <td className={snap.db_time > 0 ? styles.highlight : ''}>
                                        {snap.db_time > 0 ? ((snap.cpu_time / snap.db_time) * 100).toFixed(1) : 0}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes.toFixed(1)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
}
