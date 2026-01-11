'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './AgentTerminal.module.css';

interface ToolCall {
    id: string;
    timestamp: string;
    tool_name: string;
    parameters: Record<string, unknown>;
    result?: unknown;
    status: 'pending' | 'success' | 'error';
    duration_ms?: number;
    error_message?: string;
}

interface TerminalData {
    calls: ToolCall[];
    status: 'connected' | 'disconnected' | 'mock';
    mcp_server: string;
}

interface AgentTerminalProps {
    maxEntries?: number;
}

export function AgentTerminal({ maxEntries = 100 }: AgentTerminalProps) {
    const [data, setData] = useState<TerminalData>({
        calls: [],
        status: 'disconnected',
        mcp_server: 'unknown'
    });
    const [isPaused, setIsPaused] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<'all' | 'success' | 'error' | 'pending'>('all');
    const terminalRef = useRef<HTMLDivElement>(null);
    const autoScrollRef = useRef(true);

    useEffect(() => {
        if (isPaused) return;

        const fetchData = async () => {
            try {
                const res = await fetch('/api/troubleshoot/oracle/terminal');
                if (res.ok) {
                    const result = await res.json();
                    setData(result);
                } else {
                    setData(getMockData());
                }
            } catch {
                setData(getMockData());
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 2000);
        return () => clearInterval(interval);
    }, [isPaused]);

    useEffect(() => {
        if (autoScrollRef.current && terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [data.calls]);

    const handleScroll = () => {
        if (!terminalRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
        autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
    };

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedIds(newExpanded);
    };

    const clearTerminal = () => {
        setData(prev => ({ ...prev, calls: [] }));
        setExpandedIds(new Set());
    };

    const filteredCalls = data.calls.filter(call => {
        if (filter === 'all') return true;
        return call.status === filter;
    }).slice(-maxEntries);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success': return '✓';
            case 'error': return '✗';
            case 'pending': return '○';
            default: return '?';
        }
    };

    const formatDuration = (ms?: number) => {
        if (ms === undefined) return '';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    return (
        <div className={styles.container}>
            {/* Terminal Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <span className={styles.terminalIcon}>⌨️</span>
                    <span className={styles.title}>Agent Terminal</span>
                    <span className={`${styles.connectionDot} ${styles[data.status]}`} />
                    <span className={styles.serverName}>{data.mcp_server}</span>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.filterGroup}>
                        {(['all', 'success', 'error', 'pending'] as const).map(f => (
                            <button
                                key={f}
                                className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`}
                                onClick={() => setFilter(f)}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    <div className={styles.controls}>
                        <button
                            className={`${styles.controlBtn} ${isPaused ? styles.paused : ''}`}
                            onClick={() => setIsPaused(!isPaused)}
                            title={isPaused ? 'Resume' : 'Pause'}
                        >
                            {isPaused ? '▶' : '⏸'}
                        </button>
                        <button
                            className={styles.controlBtn}
                            onClick={clearTerminal}
                            title="Clear"
                        >
                            🗑️
                        </button>
                    </div>
                </div>
            </div>

            {/* Terminal Body */}
            <div
                ref={terminalRef}
                className={styles.terminal}
                onScroll={handleScroll}
            >
                {filteredCalls.map(call => (
                    <div
                        key={call.id}
                        className={`${styles.entry} ${styles[call.status]} ${expandedIds.has(call.id) ? styles.expanded : ''}`}
                    >
                        <div
                            className={styles.entryHeader}
                            onClick={() => toggleExpand(call.id)}
                        >
                            <span className={styles.expandIcon}>
                                {expandedIds.has(call.id) ? '▼' : '▶'}
                            </span>
                            <span className={`${styles.statusIcon} ${styles[call.status]}`}>
                                {getStatusIcon(call.status)}
                            </span>
                            <span className={styles.timestamp}>{call.timestamp}</span>
                            <span className={styles.toolName}>{call.tool_name}</span>
                            {call.duration_ms !== undefined && (
                                <span className={styles.duration}>{formatDuration(call.duration_ms)}</span>
                            )}
                            {call.status === 'error' && call.error_message && (
                                <span className={styles.errorHint}>{call.error_message.slice(0, 50)}...</span>
                            )}
                        </div>
                        {expandedIds.has(call.id) && (
                            <div className={styles.entryBody}>
                                <div className={styles.section}>
                                    <div className={styles.sectionLabel}>Parameters:</div>
                                    <pre className={styles.json}>
                                        {JSON.stringify(call.parameters, null, 2)}
                                    </pre>
                                </div>
                                {call.result !== undefined && (
                                    <div className={styles.section}>
                                        <div className={styles.sectionLabel}>Result:</div>
                                        <pre className={`${styles.json} ${call.status === 'error' ? styles.error : ''}`}>
                                            {typeof call.result === 'string'
                                                ? call.result
                                                : JSON.stringify(call.result, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                {call.error_message && (
                                    <div className={styles.section}>
                                        <div className={styles.sectionLabel}>Error:</div>
                                        <pre className={`${styles.json} ${styles.error}`}>
                                            {call.error_message}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {filteredCalls.length === 0 && (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}>📭</span>
                        <p>No tool calls yet</p>
                        <span className={styles.emptyHint}>
                            {data.status === 'mock'
                                ? 'Connect MCP server to see live tool calls'
                                : 'Tool calls will appear here as they execute'}
                        </span>
                    </div>
                )}
            </div>

            {/* Terminal Footer */}
            <div className={styles.footer}>
                <span className={styles.stats}>
                    {filteredCalls.length} calls
                    {filter !== 'all' && ` (${filter})`}
                </span>
                {isPaused && <span className={styles.pausedIndicator}>⏸ Paused</span>}
                {!autoScrollRef.current && (
                    <button
                        className={styles.scrollBtn}
                        onClick={() => {
                            autoScrollRef.current = true;
                            if (terminalRef.current) {
                                terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                            }
                        }}
                    >
                        ↓ Scroll to bottom
                    </button>
                )}
            </div>
        </div>
    );
}

function getMockData(): TerminalData {
    const now = new Date();
    const makeTimestamp = (offsetSecs: number) => {
        const d = new Date(now.getTime() - offsetSecs * 1000);
        return d.toLocaleTimeString('en-US', { hour12: false });
    };

    return {
        status: 'mock',
        mcp_server: 'oracle-troubleshoot-mcp',
        calls: [
            {
                id: '1',
                timestamp: makeTimestamp(120),
                tool_name: 'get_blocking_tree',
                parameters: { instance_filter: null, include_waiters: true },
                result: { root_blockers: 2, total_sessions: 8, tree_depth: 3 },
                status: 'success',
                duration_ms: 234
            },
            {
                id: '2',
                timestamp: makeTimestamp(90),
                tool_name: 'get_awr_snapshots',
                parameters: { hours_back: 4, instance_id: 1 },
                result: { snapshots: [100, 101, 102, 103, 104, 105] },
                status: 'success',
                duration_ms: 156
            },
            {
                id: '3',
                timestamp: makeTimestamp(60),
                tool_name: 'execute_sql',
                parameters: {
                    query: 'SELECT sql_id, elapsed_time FROM v$sqlmon WHERE status = \'EXECUTING\'',
                    max_rows: 100
                },
                result: { rows: 3, columns: ['sql_id', 'elapsed_time'] },
                status: 'success',
                duration_ms: 89
            },
            {
                id: '4',
                timestamp: makeTimestamp(45),
                tool_name: 'get_px_status',
                parameters: { include_downgrades: true },
                status: 'pending'
            },
            {
                id: '5',
                timestamp: makeTimestamp(30),
                tool_name: 'generate_awr_report',
                parameters: { begin_snap: 100, end_snap: 105, format: 'html' },
                result: null,
                status: 'error',
                duration_ms: 1234,
                error_message: 'ORA-20001: Snapshot range spans instance restart. Please select a valid snapshot range.'
            },
            {
                id: '6',
                timestamp: makeTimestamp(15),
                tool_name: 'get_session_longops',
                parameters: { sid: 145, serial: 12345 },
                result: { operations: 2, total_work: 1500000, sofar: 750000, pct_complete: 50 },
                status: 'success',
                duration_ms: 67
            },
            {
                id: '7',
                timestamp: makeTimestamp(5),
                tool_name: 'get_wait_events',
                parameters: { top_n: 10, instance_id: 1 },
                result: { events: ['db file sequential read', 'log file sync', 'gc buffer busy acquire'] },
                status: 'success',
                duration_ms: 112
            }
        ]
    };
}
