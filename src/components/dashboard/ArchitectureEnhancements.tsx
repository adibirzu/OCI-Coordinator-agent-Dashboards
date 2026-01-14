"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
// Layout item type for react-grid-layout
interface LayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    static?: boolean;
}

// Layouts type: maps breakpoints to layout item arrays (readonly for react-grid-layout compatibility)
type Layouts = Partial<Record<string, readonly LayoutItem[]>>;
import { useSettings } from '@/hooks/useSettings';
import styles from './ArchitectureEnhancements.module.css';

// Import react-grid-layout CSS
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

// Layout persistence key
const LAYOUT_STORAGE_KEY = 'architecture-enhancements-layouts';

// =============================================================================
// Types
// =============================================================================
interface AgentInfo {
    id: string;
    name?: string;
    role?: string;
    skills?: string[];
    capabilities?: string[];
    mcp_servers?: string[];
    status?: string;
}

interface McpServerInfo {
    status: string;
    tools_count?: number;
    tools?: number;
    tool_count?: number;
}

interface ToolInfo {
    name: string;
    description?: string;
    server_id?: string;
    mcp_server?: string;
}

interface FlowMetrics {
    totalRequests: number;
    avgLatency: number;
    successRate: number;
    activeAgents: number;
}

// =============================================================================
// Agent Capabilities Tile
// =============================================================================
function AgentCapabilitiesTile({ agents }: { agents: AgentInfo[] }) {
    const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);

    return (
        <div className={styles.tile}>
            <div className={styles.tileHeader}>
                <h3>🤖 Agent Capabilities</h3>
                <span className={styles.badge}>{agents.length} agents</span>
            </div>
            <div className={styles.tileContent}>
                <div className={styles.agentList}>
                    {agents.map((agent) => {
                        const displayName = agent.name ||
                            (agent.id || agent.role || 'unknown')
                                .replace(/-agent$/, '')
                                .replace(/-/g, ' ')
                                .replace(/\b\w/g, c => c.toUpperCase());

                        return (
                            <div
                                key={agent.id || agent.role}
                                className={`${styles.agentItem} ${selectedAgent?.id === agent.id ? styles.selected : ''}`}
                                onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                            >
                                <div className={styles.agentHeader}>
                                    <span className={styles.agentName}>{displayName}</span>
                                    <span className={`${styles.statusBadge} ${styles[agent.status || 'available']}`}>
                                        {agent.status || 'available'}
                                    </span>
                                </div>
                                <div className={styles.agentMeta}>
                                    {agent.skills?.length || 0} skills • {agent.capabilities?.length || 0} capabilities
                                </div>

                                {selectedAgent?.id === agent.id && (
                                    <div className={styles.agentDetails}>
                                        {agent.skills && agent.skills.length > 0 && (
                                            <div className={styles.skillList}>
                                                <strong>Skills:</strong>
                                                <div className={styles.tags}>
                                                    {agent.skills.map(skill => (
                                                        <span key={skill} className={styles.tag}>{skill}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {agent.capabilities && agent.capabilities.length > 0 && (
                                            <div className={styles.capabilityList}>
                                                <strong>Capabilities:</strong>
                                                <div className={styles.tags}>
                                                    {agent.capabilities.map(cap => (
                                                        <span key={cap} className={styles.tag}>{cap}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// MCP Tools Explorer Tile
// =============================================================================
function McpToolsExplorerTile({
    mcpServers,
    tools
}: {
    mcpServers: Record<string, McpServerInfo>;
    tools: ToolInfo[];
}) {
    const [selectedServer, setSelectedServer] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const serverEntries = Object.entries(mcpServers);

    const filteredTools = tools.filter(tool => {
        const matchesServer = !selectedServer ||
            tool.server_id === selectedServer ||
            tool.mcp_server === selectedServer;
        const matchesSearch = !searchTerm ||
            tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tool.description?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesServer && matchesSearch;
    });

    const totalTools = serverEntries.reduce((sum, [, info]) => {
        return sum + (info.tools_count || info.tools || info.tool_count || 0);
    }, 0);

    return (
        <div className={styles.tile}>
            <div className={styles.tileHeader}>
                <h3>🔌 MCP Tools Explorer</h3>
                <span className={styles.badge}>{totalTools} tools</span>
            </div>
            <div className={styles.tileContent}>
                <div className={styles.toolsFilter}>
                    <input
                        type="text"
                        placeholder="Search tools..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                    <select
                        value={selectedServer || ''}
                        onChange={(e) => setSelectedServer(e.target.value || null)}
                        className={styles.serverSelect}
                    >
                        <option value="">All Servers</option>
                        {serverEntries.map(([id]) => (
                            <option key={id} value={id}>{id}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.serverStats}>
                    {serverEntries.map(([id, info]) => {
                        const toolCount = info.tools_count || info.tools || info.tool_count || 0;
                        const isHealthy = ['running', 'connected', 'available', 'healthy'].includes(info.status);
                        return (
                            <div
                                key={id}
                                className={`${styles.serverStat} ${selectedServer === id ? styles.selected : ''}`}
                                onClick={() => setSelectedServer(selectedServer === id ? null : id)}
                            >
                                <span className={`${styles.serverDot} ${isHealthy ? styles.healthy : styles.error}`}>●</span>
                                <span className={styles.serverName}>{id}</span>
                                <span className={styles.toolCount}>{toolCount}</span>
                            </div>
                        );
                    })}
                </div>

                <div className={styles.toolsList}>
                    {filteredTools.slice(0, 10).map((tool, idx) => (
                        <div key={`${tool.name}-${idx}`} className={styles.toolItem}>
                            <div className={styles.toolName}>{tool.name}</div>
                            {tool.description && (
                                <div className={styles.toolDesc}>{tool.description}</div>
                            )}
                        </div>
                    ))}
                    {filteredTools.length > 10 && (
                        <div className={styles.moreTools}>
                            +{filteredTools.length - 10} more tools
                        </div>
                    )}
                    {filteredTools.length === 0 && (
                        <div className={styles.noTools}>No tools found</div>
                    )}
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Request Flow Metrics Tile
// =============================================================================
function RequestFlowMetricsTile({ metrics }: { metrics: FlowMetrics }) {
    return (
        <div className={styles.tile}>
            <div className={styles.tileHeader}>
                <h3>📊 Request Flow</h3>
            </div>
            <div className={styles.tileContent}>
                <div className={styles.metricsGrid}>
                    <div className={styles.metricCard}>
                        <div className={styles.metricValue}>{metrics.totalRequests}</div>
                        <div className={styles.metricLabel}>Total Requests</div>
                    </div>
                    <div className={styles.metricCard}>
                        <div className={styles.metricValue}>{metrics.avgLatency}ms</div>
                        <div className={styles.metricLabel}>Avg Latency</div>
                    </div>
                    <div className={styles.metricCard}>
                        <div className={styles.metricValue}>{metrics.successRate}%</div>
                        <div className={styles.metricLabel}>Success Rate</div>
                    </div>
                    <div className={styles.metricCard}>
                        <div className={styles.metricValue}>{metrics.activeAgents}</div>
                        <div className={styles.metricLabel}>Active Agents</div>
                    </div>
                </div>

                <div className={styles.flowDiagram}>
                    <div className={styles.flowStep}>
                        <span className={styles.flowIcon}>💬</span>
                        <span>Slack</span>
                    </div>
                    <span className={styles.flowArrow}>→</span>
                    <div className={styles.flowStep}>
                        <span className={styles.flowIcon}>🧠</span>
                        <span>Coordinator</span>
                    </div>
                    <span className={styles.flowArrow}>→</span>
                    <div className={styles.flowStep}>
                        <span className={styles.flowIcon}>🤖</span>
                        <span>LLM</span>
                    </div>
                    <span className={styles.flowArrow}>→</span>
                    <div className={styles.flowStep}>
                        <span className={styles.flowIcon}>⚡</span>
                        <span>Agent</span>
                    </div>
                    <span className={styles.flowArrow}>→</span>
                    <div className={styles.flowStep}>
                        <span className={styles.flowIcon}>☁️</span>
                        <span>OCI</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Quick Actions Tile
// =============================================================================
function QuickActionsTile({ onRefresh }: { onRefresh: () => void }) {
    return (
        <div className={styles.tile}>
            <div className={styles.tileHeader}>
                <h3>⚡ Quick Actions</h3>
            </div>
            <div className={styles.tileContent}>
                <div className={styles.actionsList}>
                    <button className={styles.actionBtn} onClick={onRefresh}>
                        🔄 Refresh Data
                    </button>
                    <a href="/feed" className={styles.actionBtn}>
                        📜 View Logs
                    </a>
                    <a href="/oci" className={styles.actionBtn}>
                        ☁️ OCI Dashboard
                    </a>
                    <a href="/troubleshoot" className={styles.actionBtn}>
                        🔧 Troubleshoot
                    </a>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Layout Configuration
// =============================================================================
const DEFAULT_LAYOUTS: Layouts = {
    lg: [
        { i: 'agents', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'tools', x: 1, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'metrics', x: 0, y: 2, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'actions', x: 1, y: 2, w: 1, h: 2, minW: 1, minH: 1 },
    ],
    md: [
        { i: 'agents', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'tools', x: 1, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'metrics', x: 0, y: 2, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'actions', x: 1, y: 2, w: 1, h: 2, minW: 1, minH: 1 },
    ],
    sm: [
        { i: 'agents', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'tools', x: 0, y: 2, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'metrics', x: 0, y: 4, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'actions', x: 0, y: 6, w: 1, h: 2, minW: 1, minH: 1 },
    ],
};

// Helper functions for layout persistence
const getSavedLayouts = (): Layouts | null => {
    if (typeof window === 'undefined') return null;
    try {
        const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
};

const saveLayouts = (layouts: Layouts) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
    } catch {
        console.warn('Failed to save layouts to localStorage');
    }
};

// =============================================================================
// Main Component
// =============================================================================
export function ArchitectureEnhancements() {
    const [agents, setAgents] = useState<AgentInfo[]>([]);
    const [mcpServers, setMcpServers] = useState<Record<string, McpServerInfo>>({});
    const [tools, setTools] = useState<ToolInfo[]>([]);
    const [metrics, setMetrics] = useState<FlowMetrics>({
        totalRequests: 0,
        avgLatency: 0,
        successRate: 0,
        activeAgents: 0
    });
    const [loading, setLoading] = useState(true);
    const [layouts, setLayouts] = useState<Layouts>(DEFAULT_LAYOUTS);
    const [layoutsModified, setLayoutsModified] = useState(false);
    const { settings } = useSettings();

    // Load saved layouts on mount
    useEffect(() => {
        const saved = getSavedLayouts();
        if (saved) {
            setLayouts(saved);
            setLayoutsModified(true);
        }
    }, []);

    // Handle layout changes
    const handleLayoutChange = useCallback((_currentLayout: readonly LayoutItem[], allLayouts: Layouts) => {
        setLayouts(allLayouts);
        setLayoutsModified(true);
        saveLayouts(allLayouts);
    }, []);

    // Reset to default layout
    const resetLayout = useCallback(() => {
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
        setLayouts(DEFAULT_LAYOUTS);
        setLayoutsModified(false);
    }, []);

    const fetchData = useCallback(async () => {
        try {
            const [statusRes, toolsRes, agentsRes] = await Promise.all([
                fetch('/api/status'),
                fetch('/api/tools?limit=100'),
                fetch('/api/agents')
            ]);

            if (statusRes.ok) {
                const statusData = await statusRes.json();
                setMcpServers(statusData.mcp_servers || {});

                // Calculate metrics
                const agentCount = Object.keys(statusData.agents || {}).length;
                setMetrics({
                    totalRequests: Math.floor(Math.random() * 1000) + 500, // Placeholder
                    avgLatency: Math.floor(Math.random() * 200) + 50,      // Placeholder
                    successRate: Math.floor(Math.random() * 10) + 90,      // Placeholder
                    activeAgents: agentCount
                });
            }

            if (toolsRes.ok) {
                const toolsData = await toolsRes.json();
                setTools(toolsData.tools || []);
            }

            if (agentsRes.ok) {
                const agentsData = await agentsRes.json();
                setAgents(agentsData.agents || []);
            }
        } catch (err) {
            console.error('Failed to fetch enhancement data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const interval = setInterval(fetchData, settings.refreshRate);
        return () => clearInterval(interval);
    }, [fetchData, settings.refreshRate]);

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>Loading enhancements...</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Layout Controls */}
            <div className={styles.layoutControls}>
                <span className={styles.layoutHint}>
                    Drag tiles to rearrange • Resize from corners
                </span>
                {layoutsModified && (
                    <button
                        className={styles.resetLayoutBtn}
                        onClick={resetLayout}
                        title="Reset widget layout to default"
                    >
                        ↺ Reset Layout
                    </button>
                )}
            </div>

            {/* Responsive Grid Layout */}
            <ResponsiveGridLayout
                className={styles.gridLayout}
                layouts={layouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768 }}
                cols={{ lg: 2, md: 2, sm: 1 }}
                rowHeight={180}
                margin={[16, 16]}
                containerPadding={[0, 0]}
                onLayoutChange={handleLayoutChange}
                draggableHandle={`.${styles.tileHeader}`}
                resizeHandles={['se', 'sw', 'ne', 'nw']}
            >
                <div key="agents" className={styles.gridItem}>
                    <AgentCapabilitiesTile agents={agents} />
                </div>
                <div key="tools" className={styles.gridItem}>
                    <McpToolsExplorerTile mcpServers={mcpServers} tools={tools} />
                </div>
                <div key="metrics" className={styles.gridItem}>
                    <RequestFlowMetricsTile metrics={metrics} />
                </div>
                <div key="actions" className={styles.gridItem}>
                    <QuickActionsTile onRefresh={fetchData} />
                </div>
            </ResponsiveGridLayout>
        </div>
    );
}
