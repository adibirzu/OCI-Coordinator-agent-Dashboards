"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
    Panel,
    NodeChange
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import styles from './ArchitectureCanvas.module.css';
import { NodeDetailsPanel } from './NodeDetailsPanel';

// -----------------------------------------------------------------------------
// Position Persistence Helpers
// -----------------------------------------------------------------------------
const POSITIONS_STORAGE_KEY = 'architecture-canvas-positions';

interface SavedPosition {
    x: number;
    y: number;
}

const getSavedPositions = (): Record<string, SavedPosition> => {
    if (typeof window === 'undefined') return {};
    try {
        const saved = localStorage.getItem(POSITIONS_STORAGE_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch {
        return {};
    }
};

const savePositions = (nodes: Node[]) => {
    if (typeof window === 'undefined') return;
    const positions: Record<string, SavedPosition> = {};
    nodes.forEach(node => {
        if (node.position) {
            positions[node.id] = { x: node.position.x, y: node.position.y };
        }
    });
    localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions));
};

// -----------------------------------------------------------------------------
// Layout Helper (Dagre) - Supports horizontal workflow layout
// -----------------------------------------------------------------------------
const getLayoutedElements = (
    nodes: Node[],
    edges: Edge[],
    direction = 'TB',
    nodeWidth = 180,
    nodeHeight = 100
) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    const isHorizontal = direction === 'LR';
    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 60,
        ranksep: 80,
        marginx: 50,
        marginy: 50
    });

    nodes.forEach((node) => {
        const width = node.data?.width || nodeWidth;
        const height = node.data?.height || nodeHeight;
        dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const width = node.data?.width || nodeWidth;
        const height = node.data?.height || nodeHeight;
        node.targetPosition = isHorizontal ? Position.Left : Position.Top;
        node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;
        node.position = {
            x: nodeWithPosition.x - width / 2,
            y: nodeWithPosition.y - height / 2,
        };
    });

    return { nodes, edges };
};

// -----------------------------------------------------------------------------
// Custom Node Types
// -----------------------------------------------------------------------------
const CustomNode = ({ data }: NodeProps) => {
    return (
        <div
            className={`${styles.node} ${styles[data.type]} ${data.highlight ? styles.highlight : ''}`}
            onClick={() => data.onClick?.(data)}
        >
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

// Group node for visual grouping (channels, agents, etc.)
const GroupNode = ({ data }: NodeProps) => {
    return (
        <div className={`${styles.groupNode} ${styles[data.type]}`}>
            <div className={styles.groupLabel}>{data.label}</div>
        </div>
    );
};

// -----------------------------------------------------------------------------
// Workflow Flow Types
// -----------------------------------------------------------------------------
type FlowStep =
    | 'channels'
    | 'coordinator'
    | 'llm'
    | 'agents'
    | 'mcp'
    | 'backend';

interface SlackStatus {
    configured?: boolean;
    connection?: {
        status: string;
        team?: string;
    };
}

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
    const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
    const [positionsModified, setPositionsModified] = useState(false);

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const nodesRef = useRef<Node[]>([]);

    const { settings } = useSettings();

    // Keep nodes ref updated for debounced save
    useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);

    // Handle node changes with position persistence
    const handleNodesChange = useCallback((changes: NodeChange[]) => {
        // Apply the changes
        onNodesChange(changes);

        // Check if any position changes (drag end)
        const hasPositionChange = changes.some(
            change => change.type === 'position' && (change as any).dragging === false
        );

        if (hasPositionChange) {
            setPositionsModified(true);
            // Debounce save to avoid excessive writes
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            saveTimeoutRef.current = setTimeout(() => {
                savePositions(nodesRef.current);
            }, 500);
        }
    }, [onNodesChange]);

    // Reset layout to auto-calculated positions
    const resetLayout = useCallback(() => {
        localStorage.removeItem(POSITIONS_STORAGE_KEY);
        setPositionsModified(false);
    }, []);

    const nodeTypes = useMemo(() => ({
        custom: CustomNode,
        group: GroupNode
    }), []);

    const fetchGraphData = useCallback(async () => {
        try {
            const [statusRes, toolsRes, agentsRes, architectureRes, slackRes] = await Promise.all([
                fetch('/api/status'),
                fetch('/api/tools?limit=100'),
                fetch('/api/agents'),
                fetch('/api/architecture'),
                fetch('/api/slack/status')
            ]);

            if (!statusRes.ok) throw new Error(`Status fetch failed: ${statusRes.status}`);

            const statusData = await statusRes.json();
            const toolsData = toolsRes.ok ? await toolsRes.json() : { tools: [] };
            const agentsData = agentsRes.ok ? await agentsRes.json() : { agents: [] };
            const architectureData = architectureRes.ok ? await architectureRes.json() : { agent_mcp_map: {} };
            const slackData: SlackStatus = slackRes.ok ? await slackRes.json() : { configured: false };

            setSlackStatus(slackData);

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

            // =====================================================================
            // LAYER 1: Communication Channels (Slack, Teams, Chat)
            // =====================================================================
            const slackConnected = slackData.connection?.status === 'connected';
            const slackTeam = slackData.connection?.team || 'Slack';

            rawNodes.push({
                id: 'channel-slack',
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                    label: slackTeam,
                    type: 'channel',
                    icon: '💬',
                    status: slackConnected ? 'connected' : 'disconnected',
                    subtext: 'User Messages',
                    onClick: setSelectedNode,
                    details: {
                        type: 'Slack Channel',
                        description: 'Receives user messages and sends responses',
                        status: slackConnected ? 'Connected' : 'Disconnected'
                    }
                }
            });

            // =====================================================================
            // LAYER 2: OCI Coordinator (Central Hub)
            // =====================================================================
            const rootId = 'coordinator';
            rawNodes.push({
                id: rootId,
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                    label: 'OCI Coordinator',
                    type: 'coordinator',
                    icon: '🧠',
                    status: 'running',
                    subtext: 'Orchestrates Agents',
                    onClick: setSelectedNode,
                    details: {
                        uptime: data.uptime_seconds,
                        description: 'Central orchestrator that routes requests to specialized agents',
                        totalAgents: Object.keys(data.agents || {}).length,
                        totalMcpServers: Object.keys(data.mcp_servers || {}).length,
                        totalTools: data.tools?.total_tools || 0
                    }
                }
            });

            // Channel -> Coordinator (bidirectional)
            rawEdges.push({
                id: 'e-slack-coordinator',
                source: 'channel-slack',
                target: rootId,
                type: 'smoothstep',
                animated: true,
                label: '① Request',
                labelStyle: { fill: 'var(--color-text-tertiary)', fontSize: 10 },
                labelBgStyle: { fill: 'var(--color-bg-primary)', fillOpacity: 0.8 },
                style: { stroke: 'var(--color-primary)', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-primary)' }
            });

            // =====================================================================
            // LAYER 3: LLM Provider (Claude/OCA)
            // =====================================================================
            rawNodes.push({
                id: 'llm',
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                    label: 'LLM (Claude)',
                    type: 'llm',
                    icon: '🤖',
                    status: 'healthy',
                    subtext: 'Intent & Response',
                    onClick: setSelectedNode,
                    details: {
                        provider: 'Anthropic Claude',
                        description: 'Processes natural language, determines intent, selects agents, and generates responses',
                        capabilities: ['Intent Classification', 'Agent Selection', 'Tool Calling', 'Response Generation']
                    }
                }
            });

            // Coordinator <-> LLM (bidirectional flow)
            rawEdges.push({
                id: 'e-coordinator-llm',
                source: rootId,
                target: 'llm',
                type: 'smoothstep',
                animated: true,
                label: '② Analyze',
                labelStyle: { fill: 'var(--color-text-tertiary)', fontSize: 10 },
                labelBgStyle: { fill: 'var(--color-bg-primary)', fillOpacity: 0.8 },
                style: { stroke: 'var(--color-accent-agent)', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-accent-agent)' }
            });

            // =====================================================================
            // LAYER 4: Specialized Agents
            // =====================================================================
            const agentsList = data.detailed_agents || [];
            const agentMcpMap: Record<string, string[]> = architectureData.agent_mcp_map || {};

            agentsList.forEach((agentInfo: any, index: number) => {
                const agentId = agentInfo.id || agentInfo.role || 'unknown';
                const nodeId = `agent-${agentId}`;

                const displayLabel = agentInfo.name ||
                    agentId.replace(/-agent$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

                const skillsCount = agentInfo.skills?.length || 0;
                const capabilitiesCount = agentInfo.capabilities?.length || 0;

                rawNodes.push({
                    id: nodeId,
                    type: 'custom',
                    position: { x: 0, y: 0 },
                    data: {
                        label: displayLabel,
                        type: 'agent',
                        icon: '🤖',
                        status: agentInfo.status || 'available',
                        subtext: `${skillsCount} Skills • ${capabilitiesCount} Capabilities`,
                        onClick: setSelectedNode,
                        details: {
                            ...agentInfo,
                            mcpServers: agentMcpMap[agentId] || []
                        }
                    }
                });

                // LLM -> Agent (routed by intent)
                rawEdges.push({
                    id: `e-llm-${nodeId}`,
                    source: 'llm',
                    target: nodeId,
                    type: 'smoothstep',
                    animated: index === 0, // Only animate first to show flow
                    label: index === 0 ? '③ Route' : undefined,
                    labelStyle: { fill: 'var(--color-text-tertiary)', fontSize: 10 },
                    labelBgStyle: { fill: 'var(--color-bg-primary)', fillOpacity: 0.8 },
                    style: { stroke: 'var(--color-accent-mcp)', strokeWidth: 1.5 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-accent-mcp)' }
                });
            });

            // =====================================================================
            // LAYER 5: MCP Servers
            // =====================================================================
            const mcps = data.mcp_servers || {};
            const tools = data.detailed_tools || [];

            Object.entries(mcps).forEach(([srvId, info]: [string, any], index: number) => {
                const id = `mcp-${srvId}`;
                const mcpTools = tools.filter((t: any) => t.server_id === srvId || t.mcp_server === srvId);
                const toolCount = info.tools_count || info.tool_count || info.tools || mcpTools.length;

                rawNodes.push({
                    id,
                    type: 'custom',
                    position: { x: 0, y: 0 },
                    data: {
                        label: srvId,
                        type: 'mcp',
                        icon: '🔌',
                        status: info.status || 'connected',
                        subtext: `${toolCount} Tools`,
                        onClick: setSelectedNode,
                        details: {
                            ...info,
                            tools: mcpTools,
                            domains: info.domains || []
                        }
                    }
                });

                // Connect Agents to their MCP servers
                let hasAgentConnection = false;
                agentsList.forEach((agentInfo: any) => {
                    const agentId = agentInfo.id || agentInfo.role;
                    // Ensure agentMcps is always an array (API might return object or undefined)
                    const rawMcps = agentMcpMap[agentId] || agentInfo.mcp_servers;
                    const agentMcps = Array.isArray(rawMcps) ? rawMcps : [];

                    if (agentMcps.includes(srvId)) {
                        hasAgentConnection = true;
                        rawEdges.push({
                            id: `e-agent-${agentId}-${id}`,
                            source: `agent-${agentId}`,
                            target: id,
                            type: 'smoothstep',
                            label: index === 0 && agentId === agentsList[0]?.role ? '④ Call Tools' : undefined,
                            labelStyle: { fill: 'var(--color-text-tertiary)', fontSize: 10 },
                            labelBgStyle: { fill: 'var(--color-bg-primary)', fillOpacity: 0.8 },
                            style: {
                                stroke: 'var(--color-success)',
                                strokeWidth: 1.5,
                                strokeDasharray: '5,5'
                            },
                            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-success)' }
                        });
                    }
                });

                // Fallback: Connect unlinked MCP servers to coordinator
                if (!hasAgentConnection) {
                    rawEdges.push({
                        id: `e-coordinator-${id}`,
                        source: rootId,
                        target: id,
                        type: 'smoothstep',
                        style: {
                            stroke: 'var(--color-text-tertiary)',
                            strokeWidth: 1,
                            strokeDasharray: '3,3',
                            opacity: 0.5
                        },
                        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-text-tertiary)' }
                    });
                }
            });

            // =====================================================================
            // LAYER 6: OCI Backend (Cloud APIs)
            // =====================================================================
            rawNodes.push({
                id: 'oci-backend',
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                    label: 'OCI Cloud APIs',
                    type: 'backend',
                    icon: '☁️',
                    status: 'healthy',
                    subtext: 'Infrastructure & Services',
                    onClick: setSelectedNode,
                    details: {
                        description: 'Oracle Cloud Infrastructure APIs',
                        services: [
                            'Compute', 'Database', 'Networking',
                            'Monitoring', 'Logging Analytics', 'OPSI',
                            'Cloud Guard', 'Cost Management', 'IAM'
                        ]
                    }
                }
            });

            // MCP Servers -> OCI Backend
            Object.keys(mcps).forEach((srvId, index) => {
                rawEdges.push({
                    id: `e-mcp-${srvId}-backend`,
                    source: `mcp-${srvId}`,
                    target: 'oci-backend',
                    type: 'smoothstep',
                    label: index === 0 ? '⑤ Execute' : undefined,
                    labelStyle: { fill: 'var(--color-text-tertiary)', fontSize: 10 },
                    labelBgStyle: { fill: 'var(--color-bg-primary)', fillOpacity: 0.8 },
                    style: {
                        stroke: 'var(--color-accent-oci)',
                        strokeWidth: 1.5
                    },
                    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-accent-oci)' }
                });
            });

            // =====================================================================
            // LAYER 7: Response Flow (Back to User)
            // =====================================================================
            // Add response edge from Coordinator back to Slack
            rawEdges.push({
                id: 'e-coordinator-slack-response',
                source: rootId,
                target: 'channel-slack',
                type: 'smoothstep',
                animated: true,
                label: '⑥ Response',
                labelStyle: { fill: 'var(--color-text-tertiary)', fontSize: 10 },
                labelBgStyle: { fill: 'var(--color-bg-primary)', fillOpacity: 0.8 },
                style: {
                    stroke: 'var(--color-success)',
                    strokeWidth: 2,
                    strokeDasharray: '8,4'
                },
                markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-success)' }
            });

            // Apply Layout (Top-to-Bottom for workflow clarity)
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                rawNodes,
                rawEdges,
                'TB'
            );

            // Apply saved positions for nodes that have been manually positioned
            const savedPositions = getSavedPositions();
            const finalNodes = layoutedNodes.map(node => {
                const savedPos = savedPositions[node.id];
                if (savedPos) {
                    return {
                        ...node,
                        position: { x: savedPos.x, y: savedPos.y }
                    };
                }
                return node;
            });

            setNodes(finalNodes);
            setEdges(layoutedEdges);
            setLastUpdated(new Date());

        } catch (e) {
            console.error('Failed to fetch graph data', e);
            setStatus('error');
            setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
        }
    }, [setNodes, setEdges]);

    useEffect(() => {
        fetchGraphData();
    }, [fetchGraphData]);

    useEffect(() => {
        const interval = setInterval(fetchGraphData, settings.refreshRate);
        return () => clearInterval(interval);
    }, [fetchGraphData, settings.refreshRate]);

    return (
        <div className={styles.container}>
            <div className={styles.canvas}>
                {/* Status Overlay */}
                {status !== 'connected' && nodes.length === 0 && (
                    <div className={styles.statusOverlay}>
                        <h3>{status === 'loading' ? 'Connecting to Coordinator...' : 'Backend Unavailable'}</h3>
                        {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}
                        {status === 'error' && (
                            <button onClick={() => window.location.reload()} className={styles.retryBtn}>
                                Retry
                            </button>
                        )}
                    </div>
                )}
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    attributionPosition="bottom-right"
                >
                    <Controls />
                    <Background color="#333" gap={20} />
                    <Panel position="top-left">
                        <div className={styles.legend}>
                            <div className={styles.legendTitle}>Request Flow</div>
                            <div className={styles.legendItems}>
                                <span>① User Message</span>
                                <span>② Intent Analysis</span>
                                <span>③ Agent Routing</span>
                                <span>④ Tool Calls</span>
                                <span>⑤ API Execution</span>
                                <span>⑥ Response</span>
                            </div>
                        </div>
                    </Panel>
                    <Panel position="top-right">
                        <div className={styles.updatePanel}>
                            <span>Last update: {lastUpdated ? lastUpdated.toLocaleTimeString() : '...'}</span>
                            {positionsModified && (
                                <button
                                    className={styles.resetLayoutBtn}
                                    onClick={() => {
                                        resetLayout();
                                        fetchGraphData();
                                    }}
                                    title="Reset node positions to auto-layout"
                                >
                                    ↺ Reset Layout
                                </button>
                            )}
                        </div>
                    </Panel>
                </ReactFlow>
            </div>

            <NodeDetailsPanel
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
            />
        </div>
    );
}

export function ArchitectureCanvas() {
    return (
        <ReactFlowProvider>
            <ArchitectureCanvasContent />
        </ReactFlowProvider>
    );
}
