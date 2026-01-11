'use client';

import React, { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    MarkerType,
    Handle,
    Position,
    NodeProps,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import styles from './AgentWorkflowGraph.module.css';
import type { AgentWorkflow, AgentWorkflowNode, AgentNodeType } from '@/lib/llm-observability/types';

// ============================================
// Node Configuration
// ============================================

const NODE_CONFIG: Record<AgentNodeType, {
    icon: string;
    color: string;
    bgColor: string;
    label: string;
}> = {
    llm_call: {
        icon: '🤖',
        color: '#00d4ff',
        bgColor: 'rgba(0, 212, 255, 0.15)',
        label: 'LLM Call',
    },
    tool_invocation: {
        icon: '🔧',
        color: '#ffd93d',
        bgColor: 'rgba(255, 217, 61, 0.15)',
        label: 'Tool',
    },
    agent_handoff: {
        icon: '🤝',
        color: '#c56cf0',
        bgColor: 'rgba(197, 108, 240, 0.15)',
        label: 'Handoff',
    },
    memory_read: {
        icon: '📖',
        color: '#4ecdc4',
        bgColor: 'rgba(78, 205, 196, 0.15)',
        label: 'Memory Read',
    },
    memory_write: {
        icon: '✏️',
        color: '#6bcb77',
        bgColor: 'rgba(107, 203, 119, 0.15)',
        label: 'Memory Write',
    },
    decision: {
        icon: '🔀',
        color: '#ff9f43',
        bgColor: 'rgba(255, 159, 67, 0.15)',
        label: 'Decision',
    },
    input: {
        icon: '📥',
        color: '#54a0ff',
        bgColor: 'rgba(84, 160, 255, 0.15)',
        label: 'Input',
    },
    output: {
        icon: '📤',
        color: '#ff6b6b',
        bgColor: 'rgba(255, 107, 107, 0.15)',
        label: 'Output',
    },
};

// ============================================
// Helper Functions
// ============================================

function formatDuration(ms?: number): string {
    if (!ms || ms < 1) return '<1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
}

function formatTokens(tokens?: number): string {
    if (!tokens) return '';
    if (tokens < 1000) return `${tokens}`;
    return `${(tokens / 1000).toFixed(1)}k`;
}

function formatCost(cost?: number): string {
    if (!cost) return '';
    if (cost < 0.01) return `<$0.01`;
    return `$${cost.toFixed(2)}`;
}

// ============================================
// Custom Node Components
// ============================================

interface WorkflowNodeData {
    type: AgentNodeType;
    label: string;
    durationMs?: number;
    isError?: boolean;
    data?: {
        model?: string;
        toolName?: string;
        agentName?: string;
        tokens?: number;
        cost?: number;
        inputTokens?: number;
        outputTokens?: number;
        [key: string]: any;
    };
    onNodeClick?: (nodeId: string) => void;
}

function WorkflowNode({ id, data }: NodeProps<WorkflowNodeData>) {
    const config = NODE_CONFIG[data.type] || NODE_CONFIG.llm_call;
    const hasMetrics = data.durationMs || data.data?.tokens || data.data?.cost;

    return (
        <div
            className={`${styles.workflowNode} ${data.isError ? styles.nodeError : ''}`}
            style={{
                borderColor: data.isError ? '#ff6b6b' : config.color,
                backgroundColor: data.isError ? 'rgba(255, 107, 107, 0.1)' : config.bgColor,
            }}
            onClick={() => data.onNodeClick?.(id)}
        >
            <Handle type="target" position={Position.Top} className={styles.handle} />

            <div className={styles.nodeHeader}>
                <span className={styles.nodeIcon}>{config.icon}</span>
                <span className={styles.nodeType} style={{ color: config.color }}>
                    {config.label}
                </span>
                {data.isError && <span className={styles.errorBadge}>⚠</span>}
            </div>

            <div className={styles.nodeLabel} title={data.label}>
                {data.label}
            </div>

            {/* Model or Tool Info */}
            {data.data?.model && (
                <div className={styles.nodeDetail}>
                    <span className={styles.detailIcon}>🧠</span>
                    <span className={styles.detailText}>{data.data.model}</span>
                </div>
            )}
            {data.data?.toolName && (
                <div className={styles.nodeDetail}>
                    <span className={styles.detailIcon}>🔧</span>
                    <span className={styles.detailText}>{data.data.toolName}</span>
                </div>
            )}
            {data.data?.agentName && (
                <div className={styles.nodeDetail}>
                    <span className={styles.detailIcon}>🤖</span>
                    <span className={styles.detailText}>{data.data.agentName}</span>
                </div>
            )}

            {/* Metrics Bar */}
            {hasMetrics && (
                <div className={styles.nodeMetrics}>
                    {data.durationMs !== undefined && (
                        <span className={styles.metric} title="Duration">
                            ⏱ {formatDuration(data.durationMs)}
                        </span>
                    )}
                    {data.data?.tokens !== undefined && (
                        <span className={styles.metric} title={`Input: ${data.data.inputTokens || 0} / Output: ${data.data.outputTokens || 0}`}>
                            🔤 {formatTokens(data.data.tokens)}
                        </span>
                    )}
                    {data.data?.cost !== undefined && (
                        <span className={styles.metricCost} title="Estimated Cost">
                            💰 {formatCost(data.data.cost)}
                        </span>
                    )}
                </div>
            )}

            <Handle type="source" position={Position.Bottom} className={styles.handle} />
        </div>
    );
}

// Register custom node types
const nodeTypes = {
    workflowNode: WorkflowNode,
};

// ============================================
// Dagre Layout Function
// ============================================

function getLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const nodeWidth = 220;
    const nodeHeight = 120;

    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 50,
        ranksep: 80,
        marginx: 20,
        marginy: 20,
    });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
}

// ============================================
// Convert AgentWorkflow to ReactFlow Elements
// ============================================

function convertToReactFlow(
    workflow: AgentWorkflow,
    onNodeClick?: (nodeId: string, spanKey?: string) => void
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = workflow.nodes.map((node) => ({
        id: node.id,
        type: 'workflowNode',
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
            type: node.type,
            label: node.label,
            durationMs: node.durationMs,
            isError: node.isError,
            data: node.data,
            onNodeClick: (nodeId: string) => onNodeClick?.(nodeId, node.spanKey),
        } as WorkflowNodeData,
    }));

    const edges: Edge[] = workflow.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#555', strokeWidth: 2 },
        labelStyle: { fill: '#aaa', fontSize: 11 },
        labelBgStyle: { fill: '#1a1a2e', fillOpacity: 0.8 },
        markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#555',
        },
    }));

    return getLayoutedElements(nodes, edges);
}

// ============================================
// Summary Stats Component
// ============================================

interface WorkflowStatsProps {
    workflow: AgentWorkflow;
}

function WorkflowStats({ workflow }: WorkflowStatsProps) {
    const stats = useMemo(() => {
        let totalDuration = 0;
        let totalTokens = 0;
        let totalCost = 0;
        let llmCalls = 0;
        let toolCalls = 0;
        let errorCount = 0;

        workflow.nodes.forEach((node) => {
            if (node.durationMs) totalDuration += node.durationMs;
            if (node.data?.tokens) totalTokens += node.data.tokens;
            if (node.data?.cost) totalCost += node.data.cost;
            if (node.isError) errorCount++;

            if (node.type === 'llm_call') llmCalls++;
            if (node.type === 'tool_invocation') toolCalls++;
        });

        return { totalDuration, totalTokens, totalCost, llmCalls, toolCalls, errorCount };
    }, [workflow]);

    return (
        <div className={styles.statsBar}>
            <div className={styles.statItem}>
                <span className={styles.statLabel}>Total Duration</span>
                <span className={styles.statValue}>{formatDuration(stats.totalDuration)}</span>
            </div>
            <div className={styles.statItem}>
                <span className={styles.statLabel}>LLM Calls</span>
                <span className={styles.statValue}>{stats.llmCalls}</span>
            </div>
            <div className={styles.statItem}>
                <span className={styles.statLabel}>Tool Calls</span>
                <span className={styles.statValue}>{stats.toolCalls}</span>
            </div>
            <div className={styles.statItem}>
                <span className={styles.statLabel}>Total Tokens</span>
                <span className={styles.statValue}>{formatTokens(stats.totalTokens) || '0'}</span>
            </div>
            {stats.totalCost > 0 && (
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>Est. Cost</span>
                    <span className={styles.statValueCost}>{formatCost(stats.totalCost)}</span>
                </div>
            )}
            {stats.errorCount > 0 && (
                <div className={`${styles.statItem} ${styles.statError}`}>
                    <span className={styles.statLabel}>Errors</span>
                    <span className={styles.statValue}>{stats.errorCount}</span>
                </div>
            )}
        </div>
    );
}

// ============================================
// Node Detail Panel
// ============================================

interface NodeDetailPanelProps {
    node: AgentWorkflowNode;
    onClose: () => void;
    onViewSpan?: (spanKey: string) => void;
}

function NodeDetailPanel({ node, onClose, onViewSpan }: NodeDetailPanelProps) {
    const config = NODE_CONFIG[node.type] || NODE_CONFIG.llm_call;

    return (
        <div className={styles.detailPanel}>
            <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>
                    <span className={styles.panelIcon}>{config.icon}</span>
                    <span>{node.label}</span>
                </div>
                <button className={styles.closeBtn} onClick={onClose}>×</button>
            </div>

            <div className={styles.panelContent}>
                <div className={styles.panelSection}>
                    <div className={styles.panelRow}>
                        <span className={styles.panelLabel}>Type</span>
                        <span className={styles.panelValue} style={{ color: config.color }}>
                            {config.label}
                        </span>
                    </div>
                    {node.durationMs !== undefined && (
                        <div className={styles.panelRow}>
                            <span className={styles.panelLabel}>Duration</span>
                            <span className={styles.panelValue}>{formatDuration(node.durationMs)}</span>
                        </div>
                    )}
                    {node.isError && (
                        <div className={styles.panelRow}>
                            <span className={styles.panelLabel}>Status</span>
                            <span className={`${styles.panelValue} ${styles.errorText}`}>Error</span>
                        </div>
                    )}
                </div>

                {node.data && Object.keys(node.data).length > 0 && (
                    <div className={styles.panelSection}>
                        <h5 className={styles.sectionTitle}>Details</h5>
                        {node.data.model && (
                            <div className={styles.panelRow}>
                                <span className={styles.panelLabel}>Model</span>
                                <span className={styles.panelValue}>{node.data.model}</span>
                            </div>
                        )}
                        {node.data.toolName && (
                            <div className={styles.panelRow}>
                                <span className={styles.panelLabel}>Tool</span>
                                <span className={styles.panelValue}>{node.data.toolName}</span>
                            </div>
                        )}
                        {node.data.agentName && (
                            <div className={styles.panelRow}>
                                <span className={styles.panelLabel}>Agent</span>
                                <span className={styles.panelValue}>{node.data.agentName}</span>
                            </div>
                        )}
                        {node.data.inputTokens !== undefined && (
                            <div className={styles.panelRow}>
                                <span className={styles.panelLabel}>Input Tokens</span>
                                <span className={styles.panelValue}>{node.data.inputTokens.toLocaleString()}</span>
                            </div>
                        )}
                        {node.data.outputTokens !== undefined && (
                            <div className={styles.panelRow}>
                                <span className={styles.panelLabel}>Output Tokens</span>
                                <span className={styles.panelValue}>{node.data.outputTokens.toLocaleString()}</span>
                            </div>
                        )}
                        {node.data.tokens !== undefined && (
                            <div className={styles.panelRow}>
                                <span className={styles.panelLabel}>Total Tokens</span>
                                <span className={styles.panelValue}>{node.data.tokens.toLocaleString()}</span>
                            </div>
                        )}
                        {node.data.cost !== undefined && (
                            <div className={styles.panelRow}>
                                <span className={styles.panelLabel}>Est. Cost</span>
                                <span className={styles.panelValueCost}>{formatCost(node.data.cost)}</span>
                            </div>
                        )}
                    </div>
                )}

                {node.spanKey && onViewSpan && (
                    <div className={styles.panelActions}>
                        <button
                            className={styles.viewSpanBtn}
                            onClick={() => onViewSpan(node.spanKey!)}
                        >
                            View Span Details →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================
// Main Component
// ============================================

interface AgentWorkflowGraphProps {
    workflow: AgentWorkflow;
    title?: string;
    onNodeSelect?: (nodeId: string, spanKey?: string) => void;
    onViewSpan?: (spanKey: string) => void;
    className?: string;
}

export function AgentWorkflowGraph({
    workflow,
    title = 'Agent Workflow',
    onNodeSelect,
    onViewSpan,
    className,
}: AgentWorkflowGraphProps) {
    const [selectedNode, setSelectedNode] = useState<AgentWorkflowNode | null>(null);

    // Convert workflow to ReactFlow elements
    const { initialNodes, initialEdges } = useMemo(() => {
        const handleNodeClick = (nodeId: string, spanKey?: string) => {
            const node = workflow.nodes.find((n) => n.id === nodeId);
            if (node) {
                setSelectedNode(node);
                onNodeSelect?.(nodeId, spanKey);
            }
        };

        const { nodes, edges } = convertToReactFlow(workflow, handleNodeClick);
        return { initialNodes: nodes, initialEdges: edges };
    }, [workflow, onNodeSelect]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Empty state
    if (!workflow.nodes.length) {
        return (
            <div className={`${styles.container} ${className || ''}`}>
                <div className={styles.header}>
                    <span className={styles.headerIcon}>🔄</span>
                    <h3>{title}</h3>
                </div>
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>📊</div>
                    <div className={styles.emptyText}>No workflow data available</div>
                    <div className={styles.emptySubtext}>
                        Agent workflow visualization will appear here when trace data includes agent activity
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`${styles.container} ${className || ''}`}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <span className={styles.headerIcon}>🔄</span>
                    <h3>{title}</h3>
                </div>
                <div className={styles.headerRight}>
                    <span className={styles.nodeCount}>
                        {workflow.nodes.length} steps
                    </span>
                </div>
            </div>

            <WorkflowStats workflow={workflow} />

            <div className={styles.graphContainer}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    minZoom={0.3}
                    maxZoom={1.5}
                    attributionPosition="bottom-left"
                    proOptions={{ hideAttribution: true }}
                >
                    <Background color="#333" gap={20} />
                    <Controls
                        showInteractive={false}
                        className={styles.controls}
                    />
                    <MiniMap
                        nodeColor={(node) => {
                            const data = node.data as WorkflowNodeData;
                            if (data.isError) return '#ff6b6b';
                            return NODE_CONFIG[data.type]?.color || '#555';
                        }}
                        maskColor="rgba(0, 0, 0, 0.8)"
                        className={styles.minimap}
                    />
                </ReactFlow>
            </div>

            {selectedNode && (
                <NodeDetailPanel
                    node={selectedNode}
                    onClose={() => setSelectedNode(null)}
                    onViewSpan={onViewSpan}
                />
            )}
        </div>
    );
}

// Export a demo/mock workflow for testing
export function createMockWorkflow(): AgentWorkflow {
    return {
        nodes: [
            {
                id: 'input-1',
                type: 'input',
                label: 'User Query',
                durationMs: 5,
                data: {},
            },
            {
                id: 'llm-1',
                type: 'llm_call',
                label: 'Plan Generation',
                durationMs: 1250,
                data: {
                    model: 'gpt-4-turbo',
                    inputTokens: 512,
                    outputTokens: 256,
                    tokens: 768,
                    cost: 0.012,
                },
            },
            {
                id: 'decision-1',
                type: 'decision',
                label: 'Route Decision',
                durationMs: 15,
                data: {},
            },
            {
                id: 'tool-1',
                type: 'tool_invocation',
                label: 'Database Query',
                durationMs: 350,
                data: { toolName: 'sql_query' },
            },
            {
                id: 'tool-2',
                type: 'tool_invocation',
                label: 'Web Search',
                durationMs: 820,
                data: { toolName: 'web_search' },
            },
            {
                id: 'memory-1',
                type: 'memory_write',
                label: 'Store Context',
                durationMs: 25,
                data: {},
            },
            {
                id: 'llm-2',
                type: 'llm_call',
                label: 'Response Synthesis',
                durationMs: 1800,
                data: {
                    model: 'gpt-4-turbo',
                    inputTokens: 1024,
                    outputTokens: 512,
                    tokens: 1536,
                    cost: 0.025,
                },
            },
            {
                id: 'output-1',
                type: 'output',
                label: 'Final Response',
                durationMs: 10,
                data: {},
            },
        ],
        edges: [
            { id: 'e1', source: 'input-1', target: 'llm-1' },
            { id: 'e2', source: 'llm-1', target: 'decision-1' },
            { id: 'e3', source: 'decision-1', target: 'tool-1', label: 'DB' },
            { id: 'e4', source: 'decision-1', target: 'tool-2', label: 'Web' },
            { id: 'e5', source: 'tool-1', target: 'memory-1' },
            { id: 'e6', source: 'tool-2', target: 'memory-1' },
            { id: 'e7', source: 'memory-1', target: 'llm-2' },
            { id: 'e8', source: 'llm-2', target: 'output-1' },
        ],
    };
}
