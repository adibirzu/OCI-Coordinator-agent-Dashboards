'use client';

import React, { useEffect, useState, useRef } from 'react';

interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    source: string;
    raw?: string;
}

interface LogsResponse {
    logs: LogEntry[];
    status: string;
    source: string;
    message?: string;
}

export function LiveLogFeed() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [status, setStatus] = useState<string>('loading');
    const [source, setSource] = useState<string>('');
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [filter, setFilter] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);

    const fetchLogs = async () => {
        try {
            const res = await fetch('/api/logs?limit=50&live=true');
            if (res.ok) {
                const data: LogsResponse = await res.json();
                setLogs(data.logs || []);
                setStatus(data.status || 'connected');
                setSource(data.source || '');
                setStatusMessage(data.message || '');
            } else {
                setStatus('error');
                setStatusMessage('Failed to fetch logs');
            }
        } catch (e) {
            console.error("Failed to fetch logs", e);
            setStatus('error');
            setStatusMessage('Connection failed');
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const filteredLogs = logs.filter(l =>
        l.message.toLowerCase().includes(filter.toLowerCase()) ||
        l.source.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div style={{
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            padding: '1rem',
            height: '400px',
            display: 'flex',
            flexDirection: 'column',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '0.85rem'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Live Coordinator Logs</h3>
                <input
                    type="text"
                    placeholder="Filter logs..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.8rem'
                    }}
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {status === 'loading' && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        color: '#9ca3af'
                    }}>
                        <span>Loading logs...</span>
                    </div>
                )}

                {status !== 'loading' && filteredLogs.length === 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        color: '#9ca3af',
                        gap: '8px'
                    }}>
                        <span style={{ fontSize: '2rem' }}>📋</span>
                        <span style={{ fontWeight: 'bold' }}>
                            {status === 'unavailable' ? 'Logs Unavailable' :
                             status === 'pending_config' ? 'Configuration Required' :
                             status === 'error' ? 'Connection Error' :
                             'No Recent Logs'}
                        </span>
                        <span style={{ fontSize: '0.75rem', textAlign: 'center', maxWidth: '300px' }}>
                            {statusMessage || (
                                status === 'pending_config'
                                    ? 'Set OCI_LOG_GROUP_ID and OCI_COMPARTMENT_ID environment variables'
                                    : status === 'error'
                                    ? 'Unable to connect to log sources. Check coordinator service.'
                                    : 'No logs found in the current time window.'
                            )}
                        </span>
                        {source && (
                            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                                Source: {source}
                            </span>
                        )}
                    </div>
                )}

                {filteredLogs.map((log, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        gap: '8px',
                        padding: '2px 4px',
                        background: log.level === 'ERROR' ? 'rgba(220, 38, 38, 0.2)' : 'transparent',
                        borderLeft: log.level === 'ERROR' ? '3px solid #dc2626' : '3px solid transparent'
                    }}>
                        <span style={{ color: '#9ca3af', minWidth: '140px' }}>
                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                        </span>
                        <span style={{
                            color: log.level === 'ERROR' ? '#ef4444' :
                                log.level === 'WARNING' ? '#f59e0b' : '#3b82f6',
                            fontWeight: 'bold',
                            minWidth: '60px'
                        }}>
                            {log.level}
                        </span>
                        <span style={{ color: '#d1d5db' }}>{log.message}</span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
