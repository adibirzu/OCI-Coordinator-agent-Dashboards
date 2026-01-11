'use client';

import React, { useEffect, useState } from 'react';
import styles from './DashboardView.module.css';

interface ConnectionStatus {
    sqlMcp: boolean;
    opsiMcp: boolean;
    coordinator: boolean;
}

interface DashboardViewProps {
    connectionStatus: ConnectionStatus;
}

interface McpServerInfo {
    tools_count?: number;
    status?: string;
    connected?: boolean;
}

interface CoordinatorData {
    status: string;
    agents: Record<string, { status: string; last_activity?: string }>;
    mcp_servers: Record<string, McpServerInfo | boolean>;
    uptime_seconds: number;
    detailed_tools?: Array<{ name: string; server?: string }>;
}

// MCP server display configuration
const MCP_SERVER_CONFIG: Record<string, { icon: string; label: string; description: string }> = {
    'database-observatory': {
        icon: '🗄️',
        label: 'Database Observatory',
        description: 'AWR, OPSI, SQL tuning tools'
    },
    'finopsai': {
        icon: '💰',
        label: 'FinOps AI',
        description: 'Cost analysis & optimization'
    },
    'oci-security': {
        icon: '🔒',
        label: 'OCI Security',
        description: 'Cloud Guard, security scans'
    },
    'mcp-oci': {
        icon: '☁️',
        label: 'OCI Core',
        description: 'Compute, database, network'
    },
    'oci-logan': {
        icon: '📋',
        label: 'Log Analytics',
        description: 'OCI Logging Analytics queries'
    }
};

export function DashboardView({ connectionStatus }: DashboardViewProps) {
    const [coordinatorData, setCoordinatorData] = useState<CoordinatorData | null>(null);
    const [incidentId] = useState(`INC-${Math.floor(Math.random() * 10000)}`);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/coordinator/status');
                const data = await res.json();
                if (data.status === 'running') {
                    setCoordinatorData(data);
                }
            } catch {
                // Coordinator offline
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    const formatUptime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    return (
        <div className={styles.container}>
            <div className={styles.welcomeCard}>
                <h3>Welcome to the Troubleshooting Agent</h3>
                <p>
                    This system implements the <strong>Model Context Protocol (MCP)</strong> architecture
                    to automate Oracle Database diagnostics. Select a workflow from the sidebar to
                    begin analysis.
                </p>

                <div className={styles.infoGrid}>
                    <div className={styles.infoCard} data-type="architecture">
                        <h4>Architecture Overview</h4>
                        <p>
                            The Agent acts as an orchestrator, routing &quot;inside-out&quot; queries to the
                            <strong> SQL MCP Server</strong> and &quot;outside-in&quot; infrastructure checks to the
                            <strong> OCI OPSI MCP Server</strong>.
                        </p>
                    </div>
                    <div className={styles.infoCard} data-type="incident">
                        <h4>Current Incident Context</h4>
                        <p>
                            Incident ID: #{incidentId}<br />
                            Symptom: &quot;Application Slowdown&quot;<br />
                            Status: Triage Required
                        </p>
                    </div>
                </div>
            </div>

            {/* Live Status Cards */}
            <div className={styles.statusGrid}>
                {/* Coordinator Status - Always shown */}
                <div className={`${styles.statusCard} ${connectionStatus.coordinator ? styles.online : styles.offline}`}>
                    <div className={styles.statusIcon}>🎯</div>
                    <div className={styles.statusContent}>
                        <h4>Coordinator</h4>
                        <span className={styles.statusBadge}>
                            {connectionStatus.coordinator ? 'Connected' : 'Offline'}
                        </span>
                        {coordinatorData && (
                            <p className={styles.statusDetail}>
                                Uptime: {formatUptime(coordinatorData.uptime_seconds)}
                            </p>
                        )}
                    </div>
                </div>

                {/* Dynamic MCP Server Cards */}
                {Object.entries(MCP_SERVER_CONFIG).map(([serverId, config]) => {
                    const serverInfo = coordinatorData?.mcp_servers[serverId];
                    const isConnected = serverInfo !== undefined && serverInfo !== false;
                    const toolsCount = typeof serverInfo === 'object' ? serverInfo.tools_count : undefined;

                    return (
                        <div
                            key={serverId}
                            className={`${styles.statusCard} ${isConnected ? styles.online : styles.offline}`}
                        >
                            <div className={styles.statusIcon}>{config.icon}</div>
                            <div className={styles.statusContent}>
                                <h4>{config.label}</h4>
                                <span className={styles.statusBadge}>
                                    {isConnected ? 'Active' : 'Unavailable'}
                                </span>
                                <p className={styles.statusDetail}>
                                    {isConnected && toolsCount
                                        ? `${toolsCount} tools`
                                        : config.description}
                                </p>
                            </div>
                        </div>
                    );
                })}

                {/* Active Agents - Always shown */}
                <div className={styles.statusCard}>
                    <div className={styles.statusIcon}>🤖</div>
                    <div className={styles.statusContent}>
                        <h4>Active Agents</h4>
                        <span className={styles.statusBadge}>
                            {coordinatorData ? Object.keys(coordinatorData.agents).length : 0}
                        </span>
                        <p className={styles.statusDetail}>
                            Ready for workflows
                        </p>
                    </div>
                </div>
            </div>

            {/* Available Workflows */}
            <div className={styles.workflowSection}>
                <h3>Available Workflows</h3>
                <div className={styles.workflowGrid}>
                    <div className={styles.workflowCard}>
                        <span className={styles.workflowIcon}>🔒</span>
                        <h4>Blocking Tree Analysis</h4>
                        <p>Recursive wait chain analysis to identify root blockers and zombie transactions.</p>
                    </div>
                    <div className={styles.workflowCard}>
                        <span className={styles.workflowIcon}>📈</span>
                        <h4>CPU / AWR Analysis</h4>
                        <p>AWR-based CPU saturation detection with Resource Manager throttling analysis.</p>
                    </div>
                    <div className={styles.workflowCard}>
                        <span className={styles.workflowIcon}>⏱️</span>
                        <h4>Active SQL Monitoring</h4>
                        <p>Real-time SQL execution tracking with velocity calculations for hung detection.</p>
                    </div>
                    <div className={styles.workflowCard}>
                        <span className={styles.workflowIcon}>⚡</span>
                        <h4>Parallel Execution</h4>
                        <p>DOP downgrade detection, TQ skew analysis, and serial scan identification.</p>
                    </div>
                    <div className={styles.workflowCard}>
                        <span className={styles.workflowIcon}>📦</span>
                        <h4>Archive Diagnostics</h4>
                        <p>Bundle all artifacts into a downloadable archive for incident documentation.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
