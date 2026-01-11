'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSettings } from '@/hooks/useSettings';
import styles from './ServiceStatusGrid.module.css';

interface ServiceStatus {
    id: string;
    name: string;
    category: 'backend' | 'mcp' | 'agent' | 'core';
    status: 'healthy' | 'degraded' | 'error' | 'unknown';
    details?: string;
    latency?: number;
}

interface BackendService {
    name: string;
    url: string;
    status: 'online' | 'offline' | 'error';
    latency_ms?: number;
    error?: string;
}

interface BackendStatusData {
    overall_status: 'healthy' | 'degraded' | 'offline';
    services: BackendService[];
}

interface HealthData {
    status: string;
    components?: {
        mcp?: { status: string; connected_servers: number };
        agents?: { status: string; count: number };
    };
}

interface StatusData {
    agents?: Record<string, { capabilities: string[]; skills: string[] }>;
    mcp_servers?: Record<string, { status: string; tools?: number; tools_count?: number }> | { error: string };
}

interface SlackData {
    configured: boolean;
    connection?: { status: string; team: string };
}

export function ServiceStatusGrid() {
    const [services, setServices] = useState<ServiceStatus[]>([]);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { settings } = useSettings();

    const fetchStatuses = useCallback(async () => {
        try {
            // Fetch all status endpoints in parallel
            const [healthRes, statusRes, slackRes, backendRes] = await Promise.allSettled([
                fetch('/api/health'),
                fetch('/api/status'),
                fetch('/api/slack/status'),
                fetch('/api/backend-status'),
            ]);

            const statuses: ServiceStatus[] = [];

            // Process Backend Services first (most important)
            if (backendRes.status === 'fulfilled' && backendRes.value.ok) {
                const backendData: BackendStatusData = await backendRes.value.json();
                backendData.services.forEach((svc) => {
                    const shortName = svc.name.includes('(')
                        ? svc.name.split('(')[0].trim()
                        : svc.name;
                    statuses.push({
                        id: `backend-${shortName.toLowerCase().replace(/\s+/g, '-')}`,
                        name: shortName,
                        category: 'backend',
                        status: svc.status === 'online' ? 'healthy' : 'error',
                        details: svc.status === 'online'
                            ? `${svc.latency_ms}ms latency`
                            : svc.error || 'Offline',
                        latency: svc.latency_ms,
                    });
                });
            } else {
                // Backend status endpoint itself failed
                statuses.push({
                    id: 'backend-coordinator',
                    name: 'Coordinator',
                    category: 'backend',
                    status: 'error',
                    details: 'Cannot reach backend',
                });
            }

            let hasDetailedMcp = false;

            // 1. Parse status data (Agents + MCP details)
            if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
                const status: StatusData = await statusRes.value.json();

                // Process Individual MCP Servers
                if (status.mcp_servers && !('error' in status.mcp_servers)) {
                    Object.entries(status.mcp_servers).forEach(([srvId, info]) => {
                        hasDetailedMcp = true;
                        // Accept 'running', 'connected', 'available', or 'healthy' as healthy status
                        const isHealthy = ['running', 'connected', 'available', 'healthy'].includes(info.status);
                        // Support both 'tools' and 'tools_count' field names
                        const toolCount = info.tools_count ?? info.tools ?? 0;
                        statuses.push({
                            id: `mcp-${srvId}`,
                            name: srvId,
                            category: 'mcp',
                            status: isHealthy ? 'healthy' : 'error',
                            details: `${toolCount} tools`,
                        });
                    });
                }

                // Process Agents
                if (status.agents) {
                    Object.entries(status.agents).forEach(([id, info]) => {
                        // Shorten agent name for display
                        const shortName = id.replace('-agent', '').split('-').map(
                            w => w.charAt(0).toUpperCase() + w.slice(1)
                        ).join(' ');

                        statuses.push({
                            id,
                            name: shortName,
                            category: 'agent',
                            status: 'healthy',
                            details: `${info.skills?.length || 0} skills`,
                        });
                    });
                }
            }

            // 2. Parse health data (Fallback for MCP summary)
            if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
                const health: HealthData = await healthRes.value.json();

                // If no detailed MCP info, use the health summary
                if (!hasDetailedMcp && health.components?.mcp) {
                    statuses.push({
                        id: 'mcp-servers',
                        name: `MCP Servers (${health.components.mcp.connected_servers})`,
                        category: 'mcp',
                        status: health.components.mcp.status === 'healthy' ? 'healthy' : 'error',
                        details: `${health.components.mcp.connected_servers} servers connected`,
                    });
                }
            }

            // Parse Slack status
            if (slackRes.status === 'fulfilled' && slackRes.value.ok) {
                const slack: SlackData = await slackRes.value.json();
                statuses.push({
                    id: 'slack',
                    name: 'Slack',
                    category: 'core',
                    status: slack.connection?.status === 'connected' ? 'healthy' :
                        slack.configured ? 'degraded' : 'error',
                    details: slack.connection?.team || 'Not connected',
                });
            } else {
                statuses.push({
                    id: 'slack',
                    name: 'Slack',
                    category: 'core',
                    status: 'unknown',
                    details: 'Unable to fetch status',
                });
            }

            // Add core services (static for now, can be enhanced with real checks)
            statuses.push({
                id: 'llm',
                name: 'LLM Provider',
                category: 'core',
                status: 'healthy',
                details: 'OCA/Claude',
            });

            setServices(statuses);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Failed to fetch statuses:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatuses();
        // Refresh using settings
        const interval = setInterval(fetchStatuses, settings.refreshRate);
        return () => clearInterval(interval);
    }, [fetchStatuses, settings.refreshRate]);

    const getStatusIcon = (status: ServiceStatus['status']) => {
        switch (status) {
            case 'healthy': return '●';
            case 'degraded': return '●';
            case 'error': return '●';
            default: return '○';
        }
    };

    const getCategoryIcon = (category: ServiceStatus['category']) => {
        switch (category) {
            case 'backend': return '🖥️';
            case 'mcp': return '🔌';
            case 'agent': return '🤖';
            case 'core': return '⚙️';
        }
    };

    // Group services by category
    const grouped = services.reduce((acc, svc) => {
        if (!acc[svc.category]) acc[svc.category] = [];
        acc[svc.category].push(svc);
        return acc;
    }, {} as Record<string, ServiceStatus[]>);

    const categoryOrder: ServiceStatus['category'][] = ['backend', 'core', 'mcp', 'agent'];
    const categoryLabels: Record<string, string> = {
        backend: 'Backend Connectivity',
        core: 'Core Services',
        mcp: 'MCP Servers',
        agent: 'AI Agents',
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Service Status</h2>
                {lastUpdate && (
                    <span className={styles.lastUpdate}>
                        Updated: {lastUpdate.toLocaleTimeString()}
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className={styles.loading}>Loading services...</div>
            ) : (
                <div className={styles.categories}>
                    {categoryOrder.map(category => (
                        grouped[category] && (
                            <div key={category} className={styles.category}>
                                <h3 className={styles.categoryTitle}>
                                    {getCategoryIcon(category)} {categoryLabels[category]}
                                </h3>
                                <div className={styles.grid}>
                                    {grouped[category].map(svc => (
                                        <div
                                            key={svc.id}
                                            className={`${styles.card} ${styles[svc.status]}`}
                                            title={svc.details}
                                        >
                                            <span className={`${styles.indicator} ${styles[svc.status]}`}>
                                                {getStatusIcon(svc.status)}
                                            </span>
                                            <div className={styles.cardContent}>
                                                <span className={styles.serviceName}>{svc.name}</span>
                                                {svc.details && (
                                                    <span className={styles.details}>{svc.details}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            )}
        </div>
    );
}
