'use client';

import { useEffect, useState, useMemo } from 'react';
import { ociService, LogEntry } from '@/services/OCIService';
import { useSettings } from '@/hooks/useSettings';
import styles from './LogStream.module.css';

export function LogStream() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [sourceFilter, setSourceFilter] = useState<string>('ALL');
    const [levelFilter, setLevelFilter] = useState<string>('ALL');
    const { settings } = useSettings();

    useEffect(() => {
        const interval = setInterval(async () => {
            const latest = await ociService.getLogs(settings.maxLogLines);
            setLogs(latest);
        }, settings.refreshRate);

        return () => clearInterval(interval);
    }, [settings.refreshRate, settings.maxLogLines]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchSource = sourceFilter === 'ALL' ||
                (sourceFilter === 'AGENT' && log.source.includes('agent')) ||
                (sourceFilter === 'COORDINATOR' && log.source === 'coordinator') ||
                (sourceFilter === 'SYSTEM' && log.source === 'system');

            const matchLevel = levelFilter === 'ALL' || log.level === levelFilter;

            return matchSource && matchLevel;
        });
    }, [logs, sourceFilter, levelFilter]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.title}>
                    <span>OCI Logging Stream</span>
                    <span className={styles.liveIndicator}>● Live</span>
                </div>

                <div className={styles.controls}>
                    <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className={styles.select}
                    >
                        <option value="ALL">All Sources</option>
                        <option value="COORDINATOR">Coordinator</option>
                        <option value="AGENT">Agents</option>
                        <option value="SYSTEM">System</option>
                    </select>

                    <select
                        value={levelFilter}
                        onChange={(e) => setLevelFilter(e.target.value)}
                        className={styles.select}
                    >
                        <option value="ALL">All Levels</option>
                        <option value="INFO">Info</option>
                        <option value="WARN">Warn</option>
                        <option value="ERROR">Error</option>
                    </select>
                </div>
            </div>

            <div className={styles.logList}>
                {filteredLogs.map(log => (
                    <div key={log.id} className={styles.logEntry}>
                        <span className={styles.timestamp}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={styles.source}>[{log.source}]</span>
                        <span className={styles[log.level]}>{log.message}</span>
                    </div>
                ))}
                {logs.length === 0 && (
                    <div className={styles.emptyState}>
                        Connecting to log stream...
                    </div>
                )}
                {logs.length > 0 && filteredLogs.length === 0 && (
                    <div className={styles.emptyState}>
                        No logs match current filters.
                    </div>
                )}
            </div>
        </div>
    );
}
