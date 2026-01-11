"use client";

import React, { useEffect, useState } from 'react';
import { ToolsModal } from '../tools/ToolsModal';
import styles from './QuickOverview.module.css';

interface OverviewData {
    coordinatorStatus: 'online' | 'offline' | 'loading';
    agentCount: number;
    mcpServerCount: number;
    toolCount: number;
    lastUpdate: Date | null;
}

export function QuickOverview() {
    const [data, setData] = useState<OverviewData>({
        coordinatorStatus: 'loading',
        agentCount: 0,
        mcpServerCount: 0,
        toolCount: 0,
        lastUpdate: null
    });
    const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statusRes, agentsRes, toolsRes] = await Promise.all([
                    fetch('/api/status'),
                    fetch('/api/agents'),
                    fetch('/api/tools?limit=100')
                ]);

                const statusData = statusRes.ok ? await statusRes.json() : { status: 'offline' };
                const agentsData = agentsRes.ok ? await agentsRes.json() : { agents: [] };
                const toolsData = toolsRes.ok ? await toolsRes.json() : { tools: [] };

                setData({
                    coordinatorStatus: statusData.status === 'online' ? 'online' : 'offline',
                    agentCount: agentsData.agents?.length || 0,
                    mcpServerCount: Object.keys(statusData.mcp_servers || {}).length,
                    toolCount: toolsData.tools?.length || 0,
                    lastUpdate: new Date()
                });
            } catch (e) {
                setData(prev => ({ ...prev, coordinatorStatus: 'offline' }));
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const getStatusColor = () => {
        switch (data.coordinatorStatus) {
            case 'online': return 'var(--color-success)';
            case 'offline': return 'var(--color-error)';
            default: return 'var(--color-text-tertiary)';
        }
    };

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>System Overview</h3>

            <div className={styles.statusCard}>
                <div className={styles.statusIndicator} style={{ backgroundColor: getStatusColor() }} />
                <div className={styles.statusText}>
                    <span className={styles.statusLabel}>Coordinator</span>
                    <span className={styles.statusValue}>{data.coordinatorStatus}</span>
                </div>
            </div>

            <div className={styles.stats}>
                <div className={styles.stat}>
                    <span className={styles.statIcon}>🤖</span>
                    <div className={styles.statContent}>
                        <span className={styles.statValue}>{data.agentCount}</span>
                        <span className={styles.statLabel}>Agents</span>
                    </div>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statIcon}>🔌</span>
                    <div className={styles.statContent}>
                        <span className={styles.statValue}>{data.mcpServerCount}</span>
                        <span className={styles.statLabel}>MCP Servers</span>
                    </div>
                </div>
                <div
                    className={`${styles.stat} ${styles.statClickable}`}
                    onClick={() => setIsToolsModalOpen(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setIsToolsModalOpen(true)}
                >
                    <span className={styles.statIcon}>🛠️</span>
                    <div className={styles.statContent}>
                        <span className={styles.statValue}>{data.toolCount}</span>
                        <span className={styles.statLabel}>Tools</span>
                    </div>
                    <span className={styles.statAction}>View →</span>
                </div>
            </div>

            {data.lastUpdate && (
                <div className={styles.lastUpdate}>
                    Last updated: {data.lastUpdate.toLocaleTimeString()}
                </div>
            )}

            <ToolsModal
                isOpen={isToolsModalOpen}
                onClose={() => setIsToolsModalOpen(false)}
            />
        </div>
    );
}
