"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSettings } from '@/hooks/useSettings';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    MarkerType,
    NodeProps,
    Handle,
    Position,
    ReactFlowProvider,
    Panel
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import styles from './ArchitectureCanvas.module.css';
import { NodeDetailsPanel } from './NodeDetailsPanel';

// -----------------------------------------------------------------------------
// Layout Helper (Dagre)
// -----------------------------------------------------------------------------
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    const isHorizontal = direction === 'LR';
    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        // Approximate width/height for layout
        dagreGraph.setNode(node.id, { width: 180, height: 100 });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = isHorizontal ? Position.Left : Position.Top;
        node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

        // Shift position so it's centered
        node.position = {
            x: nodeWithPosition.x - 90,
            y: nodeWithPosition.y - 50,
        };
    });

    return { nodes, edges };
};

// -----------------------------------------------------------------------------
// Custom Node Types
// -----------------------------------------------------------------------------
const CustomNode = ({ data }: NodeProps) => {
    return (
        <div className={`${styles.node} ${styles[data.type]}`} onClick={() => data.onClick(data)}>
            <div className={styles.nodeHeader}>
                <span className={styles.nodeIcon}>{data.icon}</span>
                <span className={styles.nodeTitle}>{data.label}</span>
            </div>
            {data.status && (
                <div className={`${styles.nodeStatus} ${styles[data.status] || ''}`}>
                    <span className={`${styles.statusDot} ${styles[data.status] || ''}`}>●</span>
                    {data.status}
                </div>
            )}
            {data.subtext && <div className={styles.nodeSubtext}>{data.subtext}</div>}

            <Handle type="target" position={Position.Top} className={styles.handle} />
            <Handle type="source" position={Position.Bottom} className={styles.handle} />
        </div>
    );
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
function ArchitectureCanvasContent() {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const [status, setStatus] = useState<string>('loading');
    const [errorMsg, setErrorMsg] = useState<string>('');

    const { settings } = useSettings();

    const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);

    const fetchGraphData = useCallback(async () => {
        try {
            // Use the Next.js proxy to avoid CORS and port issues
            // The proxy is configured in next.config.ts to forward /api/* to http://localhost:3001/*
            const [statusRes, toolsRes, agentsRes, architectureRes] = await Promise.all([
                fetch('/api/status'),
                fetch('/api/tools?limit=100'),
                fetch('/api/agents'),
                fetch('/api/architecture')
            ]);

            if (!statusRes.ok) throw new Error(`Status fetch failed: ${statusRes.status}`);

            const statusData = await statusRes.json();
            const toolsData = toolsRes.ok ? await toolsRes.json() : { tools: [] };
            const agentsData = agentsRes.ok ? await agentsRes.json() : { agents: [] };
            const architectureData = architectureRes.ok ? await architectureRes.json() : { agent_mcp_map: {} };

            const data = {
                ...statusData,
                detailed_tools: toolsData.tools || [],
                detailed_agents: agentsData.agents || []
            };

            if (data.status === 'offline') {
                setStatus('offline');
                return;
            }

            setStatus('connected');
            setErrorMsg('');

            const rawNodes: Node[] = [];
            const rawEdges: Edge[] = [];

            // 1. Coordinator (Root)
            const rootId = 'coordinator';
            rawNodes.push({
                id: rootId,
                type: 'custom',
                position: { x: 0, y: 0 }, // Will be set by dagre
                data: {
                    label: 'OCI Coordinator',
                    type: 'coordinator',
                    icon: '🧠',
                    status: 'running',
                    onClick: setSelectedNode,
                    details: {
                        uptime: data.uptime_seconds,
                    }
                }
            });

            // 2. Agents
            const agentsList = data.detailed_agents || [];

            agentsList.forEach((agentInfo: any) => {
                // Handle both static (id) and dynamic (role) data structures
                const agentId = agentInfo.id || agentInfo.role || 'unknown';
                const nodeId = `agent-${agentId}`;

                // Generate display label from id/role
                const displayLabel = agentInfo.name ||
                    agentId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) + ' Agent';

                // Get capabilities count from either capabilities array or skills array
                const capabilitiesCount = agentInfo.capabilities?.length || agentInfo.skills?.length || 0;

                rawNodes.push({
                    id: nodeId,
                    type: 'custom',
                    position: { x: 0, y: 0 },
                    data: {
                        label: displayLabel,
                        type: 'agent',
                        icon: '🤖',
                        status: agentInfo.status || 'healthy',
                        subtext: `${capabilitiesCount} Capabilities`,
                        onClick: setSelectedNode,
                        details: agentInfo
                    }
                });
                // Link Coordinator -> Agent
                rawEdges.push({
                    id: `e-${rootId}-${nodeId}`,
                    source: rootId,
                    target: nodeId,
                    type: 'smoothstep',
                    animated: true,
                    style: { stroke: 'var(--color-primary)' }
                });
            });

            // 3. MCP Servers
            const mcps = data.mcp_servers || {};
            const tools = data.detailed_tools || [];

            Object.entries(mcps).forEach(([srvId, info]: [string, any]) => {
                const id = `mcp-${srvId}`;
                // Match both server_id (coordinator) and mcp_server (static) field names
                const mcpTools = tools.filter((t: any) => t.server_id === srvId || t.mcp_server === srvId);

                rawNodes.push({
                    id,
                    type: 'custom',
                    position: { x: 0, y: 0 },
                    data: {
                        label: srvId,
                        type: 'mcp',
                        icon: '🔌',
                        status: info.status,
                        subtext: `${info.tools_count || info.tool_count || mcpTools.length} Tools`,
                        onClick: setSelectedNode,
                        details: {
                            ...info,
                            tools: mcpTools
                        }
                    }
                });

                // Link Agents -> MCPs using either:
                // 1. Agent's mcp_servers array (from static data)
                // 2. agent_mcp_map from architecture endpoint
                const agentMcpMap: Record<string, any> = architectureData.agent_mcp_map || {};

                // Find agents that use this MCP server
                const linkedAgents: string[] = [];

                // Check agentsList (static/dynamic agents with mcp_servers array)
                agentsList.forEach((agentInfo: any) => {
                    const agentIdentifier = agentInfo.id || agentInfo.role;
                    const mcpServers = agentInfo.mcp_servers || [];
                    if (mcpServers.includes(srvId)) {
                        linkedAgents.push(agentIdentifier);
                    }
                });

                // Also check agent_mcp_map structure (may have mcp_servers nested)
                Object.entries(agentMcpMap).forEach(([agentKey, value]: [string, any]) => {
                    const servers = Array.isArray(value) ? value : (value?.mcp_servers || []);
                    if (servers.includes(srvId) && !linkedAgents.includes(agentKey)) {
                        linkedAgents.push(agentKey);
                    }
                });

                if (linkedAgents.length > 0) {
                    linkedAgents.forEach(agentKey => {
                        rawEdges.push({
                            id: `e-agent-${agentKey}-${id}`,
                            source: `agent-${agentKey}`,
                            target: id,
                            type: 'default',
                            markerEnd: { type: MarkerType.ArrowClosed },
                            style: { stroke: 'var(--color-text-tertiary)', strokeDasharray: 5 }
                        });
                    });
                } else {
                    // Fallback: Link from Coordinator if no specific agent claims this MCP
                    rawEdges.push({
                        id: `e-${rootId}-${id}`,
                        source: rootId,
                        target: id,
                        type: 'default',
                        markerEnd: { type: MarkerType.ArrowClosed },
                        style: { stroke: 'var(--color-text-secondary)', opacity: 0.5 }
                    });
                }
            });

            // Apply Layout
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                rawNodes,
                rawEdges
            );

            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            setLastUpdated(new Date());

        } catch (e) {
            console.error('Failed to fetch graph data', e);
            setStatus('error');
            setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
        }
    }, [setNodes, setEdges]);

    // Initial fetch
    useEffect(() => {
        fetchGraphData();
    }, [fetchGraphData]);

    // Polling using settings
    useEffect(() => {
        const interval = setInterval(fetchGraphData, settings.refreshRate);
        return () => clearInterval(interval);
    }, [fetchGraphData, settings.refreshRate]);

    return (
        <div className={styles.container}>
            <div className={styles.canvas}>
                {/* Status Overlay */}
                {status !== 'connected' && nodes.length === 0 && (
                    <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        zIndex: 10,
                        background: 'rgba(5, 5, 5, 0.9)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-text-secondary)'
                    }}>
                        <h3 style={{ color: 'var(--color-text-primary)' }}>{status === 'loading' ? 'Connecting to Coordinator...' : 'Backend Unavailable'}</h3>
                        {errorMsg && <p style={{ color: 'var(--color-accent-oci)', fontSize: '0.9em' }}>{errorMsg}</p>}
                        {status === 'error' && (
                            <button
                                onClick={() => window.location.reload()}
                                style={{
                                    marginTop: 10,
                                    padding: '8px 16px',
                                    background: 'var(--color-bg-tertiary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '6px',
                                    color: 'var(--color-text-primary)',
                                    cursor: 'pointer'
                                }}
                            >
                                Retry
                            </button>
                        )}
                    </div>
                )}
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    fitView
                    attributionPosition="bottom-right"
                >
                    <Controls />
                    <Background color="#aaa" gap={16} />
                    <Panel position="top-right">
                        <div style={{
                            background: 'var(--color-bg-tertiary)',
                            padding: '6px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            color: 'var(--color-text-secondary)',
                            border: '1px solid var(--border-subtle)'
                        }}>
                            Last update: {lastUpdated ? lastUpdated.toLocaleTimeString() : '...'}
                        </div>
                    </Panel>
                </ReactFlow>
            </div>

            {/* Details Panel */}
            <NodeDetailsPanel
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
            />
        </div>
    );
}

// Wrap in Provider
export function ArchitectureCanvas() {
    return (
        <ReactFlowProvider>
            <ArchitectureCanvasContent />
        </ReactFlowProvider>
    );
}
