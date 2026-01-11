import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ociService, LogEntry } from '@/services/OCIService';
import styles from './NodeDetailsPanel.module.css';

interface NodeDetailsPanelProps {
    node: any;
    onClose: () => void;
}

export function NodeDetailsPanel({ node, onClose }: NodeDetailsPanelProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    // The node prop is actually the data object passed directly from onClick
    // Handle both cases: when node IS the data, or when node has a data property
    const data = node?.data || node;

    useEffect(() => {
        if (!node || !data) return;

        let mounted = true;
        const fetchLogs = async () => {
            setLoadingLogs(true);
            try {
                // Fetch more logs to ensure we find relevant ones
                const allLogs = await ociService.getLogs(100);
                if (!mounted) return;

                const relevantLogs = allLogs.filter(log => {
                    if (data.type === 'coordinator') {
                        return log.source === 'coordinator';
                    }
                    if (data.type === 'agent') {
                        // Match any agent log or specific agent role if possible
                        // Log source for agents usually contains 'agent'
                        // If we had specific sources like 'finops-agent', we'd match that.
                        // For now, match 'agent' generally or if message mentions it.
                        return log.source.includes('agent');
                    }
                    if (data.type === 'mcp') {
                        // Match mcp specific logs if they exist, or system logs about this MCP
                        return log.message.includes(data.label) || log.source === data.label;
                    }
                    return false;
                });

                setLogs(relevantLogs.slice(0, 5)); // Show most recent 5
            } catch (e) {
                console.error('Failed to fetch node logs', e);
            } finally {
                if (mounted) setLoadingLogs(false);
            }
        };

        fetchLogs();
        return () => { mounted = false; };
    }, [node, data]);

    if (!node || !data) return null;

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <h3>{data.label}</h3>
                <button className={styles.closeButton} onClick={onClose}>×</button>
            </div>
            <div className={styles.content}>

                {/* Agent Details */}
                {data.type === 'agent' && (
                    <>
                        {/* Description if available */}
                        {data.details.description && (
                            <div className={styles.section}>
                                <p className={styles.description}>{data.details.description}</p>
                            </div>
                        )}

                        {/* Capabilities */}
                        {data.details.capabilities && data.details.capabilities.length > 0 && (
                            <div className={styles.section}>
                                <h4>Capabilities</h4>
                                <div className={styles.tags}>
                                    {data.details.capabilities.map((c: string) => (
                                        <span key={c} className={styles.tag}>{c}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* MCP Servers this agent uses */}
                        {data.details.mcp_servers && data.details.mcp_servers.length > 0 && (
                            <div className={styles.section}>
                                <h4>MCP Servers</h4>
                                <div className={styles.tags}>
                                    {data.details.mcp_servers.map((s: string) => (
                                        <span key={s} className={`${styles.tag} ${styles.mcpTag}`}>{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tools count */}
                        {data.details.tools_count && (
                            <div className={styles.section}>
                                <h4>Tools Available</h4>
                                <p className={styles.stat}>{data.details.tools_count} tools</p>
                            </div>
                        )}

                        <div className={styles.footer}>
                            <Link href={`/agents/${data.details.id || data.details.role || data.label.toLowerCase().replace(/ agent$/i, '')}`} className={styles.linkButton}>
                                View Full Dashboard →
                            </Link>
                        </div>
                    </>
                )}

                {/* MCP Server Details */}
                {data.type === 'mcp' && (
                    <div className={styles.section}>
                        <h4>Tools ({data.details.tools?.length || 0})</h4>
                        <ul className={`${styles.list} ${styles.toolList}`}>
                            {data.details.tools?.map((t: any) => (
                                <li key={t.name}>
                                    <strong>{t.name}</strong>
                                    <p>{t.description}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Coordinator Details */}
                {data.type === 'coordinator' && (
                    <div className={styles.section}>
                        <h4>Status</h4>
                        <p>Orchestrator is running.</p>
                        <ul className={styles.list}>
                            <li>Uptime: {Math.floor(data.details.uptime / 60)} minutes</li>
                            <li>Status: {data.status}</li>
                        </ul>
                    </div>
                )}

                {/* Recent Logs Section - Common to all */}
                <div className={`${styles.section} ${styles.activitySection}`}>
                    <h4>Recent Activity</h4>
                    {loadingLogs ? (
                        <div className={styles.loading}>Loading logs...</div>
                    ) : logs.length > 0 ? (
                        <ul className={styles.logList}>
                            {logs.map(log => (
                                <li key={log.id} className={styles.logItem}>
                                    <span className={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    <span className={`${styles.logLevel} ${styles[log.level]}`}>{log.level}</span>
                                    <span className={styles.logMessage}>{log.message}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className={styles.noLogs}>No recent activity found.</p>
                    )}
                </div>

            </div>
        </div>
    );
}
