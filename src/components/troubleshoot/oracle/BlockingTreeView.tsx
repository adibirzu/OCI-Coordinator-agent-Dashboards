'use client';

import React, { useState, useEffect } from 'react';
import styles from './BlockingTreeView.module.css';

interface BlockingSession {
    sid: number;
    serial: number;
    inst_id: number;
    username: string;
    sql_id: string;
    wait_event: string;
    wait_time_secs: number;
    blocking_session?: number;
    blocking_instance?: number;
    level: number;
    is_root: boolean;
}

interface BlockingData {
    sessions: BlockingSession[];
    summary: {
        total_blocked: number;
        root_blockers: number;
        max_wait_time: number;
        affected_users: string[];
    };
    status: 'loading' | 'connected' | 'error' | 'mock';
}

interface BlockingTreeViewProps {
    database: string;
}

export function BlockingTreeView({ database }: BlockingTreeViewProps) {
    const [data, setData] = useState<BlockingData>({
        sessions: [],
        summary: { total_blocked: 0, root_blockers: 0, max_wait_time: 0, affected_users: [] },
        status: 'loading'
    });
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/troubleshoot/oracle/blocking?database=${encodeURIComponent(database)}`);
                if (res.ok) {
                    const result = await res.json();
                    setData({ ...result, status: 'connected' });
                } else {
                    // Use mock data for demonstration
                    setData(getMockData());
                }
            } catch {
                setData(getMockData());
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }, [database]);

    const toggleNode = (nodeId: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const renderSessionNode = (session: BlockingSession, children: BlockingSession[]) => {
        const nodeId = `${session.inst_id}-${session.sid}`;
        const hasChildren = children.length > 0;
        const isExpanded = expandedNodes.has(nodeId);

        return (
            <div key={nodeId} className={styles.treeNode}>
                <div
                    className={`${styles.nodeCard} ${session.is_root ? styles.rootBlocker : ''}`}
                    onClick={() => hasChildren && toggleNode(nodeId)}
                >
                    <div className={styles.nodeHeader}>
                        {hasChildren && (
                            <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
                                ▶
                            </span>
                        )}
                        <span className={styles.sessionId}>
                            SID: {session.sid},{session.serial}@{session.inst_id}
                        </span>
                        {session.is_root && <span className={styles.rootBadge}>ROOT BLOCKER</span>}
                    </div>
                    <div className={styles.nodeDetails}>
                        <div className={styles.detailRow}>
                            <span className={styles.label}>User:</span>
                            <span className={styles.value}>{session.username}</span>
                        </div>
                        <div className={styles.detailRow}>
                            <span className={styles.label}>SQL ID:</span>
                            <span className={styles.valueMono}>{session.sql_id || 'N/A'}</span>
                        </div>
                        <div className={styles.detailRow}>
                            <span className={styles.label}>Wait Event:</span>
                            <span className={styles.value}>{session.wait_event}</span>
                        </div>
                        <div className={styles.detailRow}>
                            <span className={styles.label}>Wait Time:</span>
                            <span className={`${styles.value} ${session.wait_time_secs > 300 ? styles.critical : ''}`}>
                                {formatWaitTime(session.wait_time_secs)}
                            </span>
                        </div>
                    </div>
                </div>
                {hasChildren && isExpanded && (
                    <div className={styles.childNodes}>
                        {children.map(child => {
                            const grandchildren = data.sessions.filter(
                                s => s.blocking_session === child.sid && s.blocking_instance === child.inst_id
                            );
                            return renderSessionNode(child, grandchildren);
                        })}
                    </div>
                )}
            </div>
        );
    };

    const rootBlockers = data.sessions.filter(s => s.is_root);

    return (
        <div className={styles.container}>
            {/* Summary Cards */}
            <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryValue}>{data.summary.total_blocked}</div>
                    <div className={styles.summaryLabel}>Blocked Sessions</div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryValue}>{data.summary.root_blockers}</div>
                    <div className={styles.summaryLabel}>Root Blockers</div>
                </div>
                <div className={`${styles.summaryCard} ${data.summary.max_wait_time > 300 ? styles.critical : ''}`}>
                    <div className={styles.summaryValue}>{formatWaitTime(data.summary.max_wait_time)}</div>
                    <div className={styles.summaryLabel}>Max Wait Time</div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryValue}>{data.summary.affected_users.length}</div>
                    <div className={styles.summaryLabel}>Affected Users</div>
                </div>
            </div>

            {/* Status Indicator */}
            <div className={styles.statusBar}>
                <span className={`${styles.statusDot} ${styles[data.status]}`} />
                <span className={styles.statusText}>
                    {data.status === 'loading' && 'Loading blocking tree...'}
                    {data.status === 'connected' && 'Connected to SQL MCP'}
                    {data.status === 'mock' && 'Demo Mode - Connect SQL MCP for live data'}
                    {data.status === 'error' && 'Connection error'}
                </span>
                <button className={styles.refreshButton} onClick={() => window.location.reload()}>
                    ↻ Refresh
                </button>
            </div>

            {/* Blocking Tree */}
            <div className={styles.treeContainer}>
                <h3 className={styles.sectionTitle}>Session Wait Chain</h3>
                {rootBlockers.length === 0 ? (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}>✓</span>
                        <p>No blocking sessions detected</p>
                    </div>
                ) : (
                    <div className={styles.tree}>
                        {rootBlockers.map(root => {
                            const children = data.sessions.filter(
                                s => s.blocking_session === root.sid && s.blocking_instance === root.inst_id
                            );
                            return renderSessionNode(root, children);
                        })}
                    </div>
                )}
            </div>

            {/* Affected Users */}
            {data.summary.affected_users.length > 0 && (
                <div className={styles.affectedSection}>
                    <h4>Affected Users</h4>
                    <div className={styles.userTags}>
                        {data.summary.affected_users.map(user => (
                            <span key={user} className={styles.userTag}>{user}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function formatWaitTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
}

function getMockData(): BlockingData {
    return {
        sessions: [
            { sid: 145, serial: 12345, inst_id: 1, username: 'BATCH_USER', sql_id: 'g8h7f6d5c4b3', wait_event: 'enq: TX - row lock contention', wait_time_secs: 847, level: 0, is_root: true },
            { sid: 287, serial: 54321, inst_id: 1, username: 'APP_USER', sql_id: 'a1b2c3d4e5f6', wait_event: 'enq: TX - row lock contention', wait_time_secs: 623, blocking_session: 145, blocking_instance: 1, level: 1, is_root: false },
            { sid: 412, serial: 98765, inst_id: 2, username: 'REPORT_USER', sql_id: 'z9y8x7w6v5u4', wait_event: 'enq: TX - row lock contention', wait_time_secs: 445, blocking_session: 145, blocking_instance: 1, level: 1, is_root: false },
            { sid: 156, serial: 11111, inst_id: 1, username: 'WEB_USER', sql_id: 'm5n6o7p8q9r0', wait_event: 'enq: TX - row lock contention', wait_time_secs: 212, blocking_session: 287, blocking_instance: 1, level: 2, is_root: false },
        ],
        summary: {
            total_blocked: 3,
            root_blockers: 1,
            max_wait_time: 847,
            affected_users: ['APP_USER', 'REPORT_USER', 'WEB_USER']
        },
        status: 'mock'
    };
}
