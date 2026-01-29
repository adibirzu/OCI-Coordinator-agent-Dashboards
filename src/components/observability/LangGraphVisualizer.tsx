'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import styles from './LangGraphVisualizer.module.css';

// Types
interface WorkflowNode {
    id: string;
    name: string;
    description: string;
    status: 'idle' | 'active' | 'completed' | 'skipped' | 'error';
    duration_ms?: number;
    stage?: string;
}

interface WorkflowEdge {
    source: string;
    target: string;
    edge_type: 'sequential' | 'conditional' | 'loop';
    label?: string;
}

interface NodeDetail {
    id: string;
    name: string;
    description: string;
    stage: string;
    spanName: string;
    dataIn: string;
    dataOut: string;
    operations: string[];
    metrics: {
        avgLatency: string;
        successRate: string;
    };
    routingPaths?: Record<string, string>;
    availableWorkflows?: string[];
    availableAgents?: string[];
    mcpServers?: string[];
}

interface MessageFlow {
    from: string;
    to: string;
    message: string;
    type: 'request' | 'response' | 'internal' | 'branch' | 'loop';
    condition?: string;
}

interface Stage {
    name: string;
    nodes: string[];
    color: string;
    description: string;
}

interface ExampleQuery {
    query: string;
    description: string;
    workflow?: string;
    agent?: string;
    agents?: string[];
    reason?: string;
}

interface ToolCall {
    toolName: string;
    durationMs: number;
    status: string;
}

interface NodeExecution {
    nodeId: string;
    nodeName: string;
    spanKey?: string;
    startTime: string;
    endTime: string;
    durationMs: number;
    status: 'success' | 'error' | 'skipped';
    dataIn?: string;
    dataOut?: string;
    toolCalls?: ToolCall[];
}

interface WorkflowTrace {
    traceKey: string;
    totalDurationMs: number;
    startTime: string;
    endTime: string;
    status: 'success' | 'error' | 'pending';
    routingType: string;
    nodeExecutions: NodeExecution[];
    query?: string;
    response?: string;
}

interface VisualizerData {
    status: string;
    message?: string;
    viewMode?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    mermaid_diagram: string;
    nodeDetails?: Record<string, NodeDetail>;
    messageFlows?: MessageFlow[];
    stages?: Stage[];
    example_queries?: Record<string, ExampleQuery[]>;
}

interface TracesData {
    status: string;
    traces: WorkflowTrace[];
    source: string;
}

interface LangGraphVisualizerProps {
    onTraceSelect?: (traceKey: string) => void;
    selectedTraceKey?: string;
}

// Node icons mapping
const NODE_ICONS: Record<string, string> = {
    __start__: '▶️',
    __end__: '⏹️',
    input: '📥',
    classifier: '🎯',
    router: '🔀',
    workflow: '📋',
    parallel: '🔄',
    agent: '🤖',
    action: '🔧',
    output: '📤',
};

// Node colors for timeline
const NODE_COLORS: Record<string, string> = {
    input: '#6366f1',
    classifier: '#8b5cf6',
    router: '#a855f7',
    workflow: '#10b981',
    parallel: '#f59e0b',
    agent: '#3b82f6',
    action: '#6366f1',
    output: '#f97316',
};

// Agent definitions with colors
const AGENTS = [
    { id: 'db', name: 'DbTroubleshoot', domain: 'Database', icon: '🗄️', color: '#3b82f6' },
    { id: 'log', name: 'LogAnalytics', domain: 'Observability', icon: '📊', color: '#8b5cf6' },
    { id: 'sec', name: 'SecurityThreat', domain: 'Security', icon: '🛡️', color: '#ef4444' },
    { id: 'fin', name: 'FinOps', domain: 'Cost', icon: '💰', color: '#10b981' },
    { id: 'infra', name: 'Infrastructure', domain: 'Compute', icon: '🖥️', color: '#f59e0b' },
    { id: 'err', name: 'ErrorAnalysis', domain: 'Debugging', icon: '🔍', color: '#ec4899' },
    { id: 'ai', name: 'SelectAI', domain: 'Data/AI', icon: '🤖', color: '#06b6d4' },
];

type ViewMode = 'flowchart' | 'sequence' | 'timeline';
type RouteFilter = 'all' | 'workflow' | 'parallel' | 'agent';

export function LangGraphVisualizer({ onTraceSelect, selectedTraceKey }: LangGraphVisualizerProps) {
    const [data, setData] = useState<VisualizerData | null>(null);
    const [traces, setTraces] = useState<WorkflowTrace[]>([]);
    const [selectedTrace, setSelectedTrace] = useState<WorkflowTrace | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('flowchart');
    const [routeFilter, setRouteFilter] = useState<RouteFilter>('all');
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [showTracePanel, setShowTracePanel] = useState(true);
    const diagramRef = useRef<HTMLDivElement>(null);

    // Fetch visualization data
    const fetchData = useCallback(async () => {
        try {
            setRefreshing(true);
            const params = new URLSearchParams();
            if (routeFilter !== 'all') params.set('routing_type', routeFilter);
            params.set('view', viewMode === 'timeline' ? 'flowchart' : viewMode);

            const url = `/api/visualizer?${params.toString()}`;
            const response = await fetch(url);
            const result = await response.json();

            setData(result);
            setError(null);
        } catch (err) {
            console.error('Fetch error:', err);
            setError(err instanceof Error ? err.message : 'Failed to load visualization');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [routeFilter, viewMode]);

    // Fetch APM traces
    const fetchTraces = useCallback(async () => {
        try {
            const response = await fetch('/api/visualizer/traces?limit=5');
            const result: TracesData = await response.json();
            setTraces(result.traces || []);
            if (result.traces?.length > 0 && !selectedTrace) {
                setSelectedTrace(result.traces[0]);
            }
        } catch (err) {
            console.error('Traces fetch error:', err);
        }
    }, [selectedTrace]);

    // Render Mermaid diagram
    const renderMermaid = useCallback(async (diagram: string) => {
        if (!diagramRef.current || !diagram) return;

        try {
            const mermaid = (await import('mermaid')).default;

            mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                securityLevel: 'loose',
                fontFamily: 'Inter, system-ui, sans-serif',
                flowchart: {
                    useMaxWidth: true,
                    htmlLabels: true,
                    curve: 'basis',
                    padding: 20,
                    nodeSpacing: 50,
                    rankSpacing: 80,
                },
                sequence: {
                    useMaxWidth: true,
                    boxMargin: 10,
                    noteMargin: 10,
                    messageMargin: 35,
                },
            });

            diagramRef.current.innerHTML = '';
            const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const { svg } = await mermaid.render(id, diagram);

            if (diagramRef.current) {
                diagramRef.current.innerHTML = svg;
                const svgElement = diagramRef.current.querySelector('svg');
                if (svgElement) {
                    svgElement.style.maxWidth = '100%';
                    svgElement.style.height = 'auto';
                    svgElement.style.minHeight = '350px';
                }
            }
        } catch (err) {
            console.error('Mermaid render error:', err);
            if (diagramRef.current) {
                diagramRef.current.innerHTML = `
                    <div class="${styles.renderError}">
                        <div class="${styles.renderErrorTitle}">⚠️ Diagram Rendering Error</div>
                        <pre class="${styles.renderErrorCode}">${String(err)}</pre>
                    </div>
                `;
            }
        }
    }, []);

    // Initial load
    useEffect(() => {
        fetchData();
        fetchTraces();
    }, [fetchData, fetchTraces]);

    // Re-render diagram when data changes
    useEffect(() => {
        if (data?.mermaid_diagram && viewMode !== 'timeline') {
            renderMermaid(data.mermaid_diagram);
        }
    }, [data?.mermaid_diagram, renderMermaid, viewMode]);

    // Get selected node details
    const selectedNodeDetail = selectedNode && data?.nodeDetails ? data.nodeDetails[selectedNode] : null;

    // Filter nodes for display (exclude start/end)
    const displayNodes = data?.nodes?.filter(n => !n.id.startsWith('__')) || [];

    // Get examples for current route
    const currentExamples = data?.example_queries?.[routeFilter === 'all' ? 'workflow' : routeFilter] || [];

    // Format duration
    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    // Format time
    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString();
    };

    // Calculate timeline position
    const getTimelinePosition = (startTime: string, endTime: string, traceStart: string, traceDuration: number) => {
        const start = new Date(startTime).getTime() - new Date(traceStart).getTime();
        const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
        return {
            left: `${(start / traceDuration) * 100}%`,
            width: `${Math.max((duration / traceDuration) * 100, 2)}%`,
        };
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingFull}>
                    <div className={styles.spinner} />
                    <span>Loading LangGraph workflow visualization...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h3 className={styles.title}>
                        <span className={styles.titleIcon}>🔄</span>
                        LangGraph Coordinator Workflow
                    </h3>
                    <span className={styles.subtitle}>
                        {data?.status === 'ok' ? 'Live from coordinator' : 'Reference diagram with mock traces'}
                    </span>
                </div>

                <div className={styles.headerControls}>
                    {/* View Mode Toggle */}
                    <div className={styles.viewModeToggle}>
                        <button
                            className={`${styles.viewModeBtn} ${viewMode === 'flowchart' ? styles.viewModeBtnActive : ''}`}
                            onClick={() => setViewMode('flowchart')}
                            title="Graph View"
                        >
                            <span>📊</span> Graph
                        </button>
                        <button
                            className={`${styles.viewModeBtn} ${viewMode === 'sequence' ? styles.viewModeBtnActive : ''}`}
                            onClick={() => setViewMode('sequence')}
                            title="Sequence Diagram"
                        >
                            <span>📈</span> Sequence
                        </button>
                        <button
                            className={`${styles.viewModeBtn} ${viewMode === 'timeline' ? styles.viewModeBtnActive : ''}`}
                            onClick={() => setViewMode('timeline')}
                            title="Execution Timeline"
                        >
                            <span>⏱️</span> Timeline
                        </button>
                    </div>

                    {/* Route Filter */}
                    <div className={styles.routeFilter}>
                        {(['all', 'workflow', 'parallel', 'agent'] as RouteFilter[]).map(route => (
                            <button
                                key={route}
                                className={`${styles.routeBtn} ${routeFilter === route ? styles.routeBtnActive : ''}`}
                                onClick={() => setRouteFilter(route)}
                            >
                                {route === 'all' ? 'All' : route.charAt(0).toUpperCase() + route.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Refresh */}
                    <button
                        className={`${styles.refreshBtn} ${refreshing ? styles.refreshBtnLoading : ''}`}
                        onClick={() => { fetchData(); fetchTraces(); }}
                        disabled={refreshing}
                    >
                        ↻
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className={styles.mainContent}>
                {/* Diagram/Timeline Panel */}
                <div className={styles.diagramPanel}>
                    {viewMode === 'timeline' ? (
                        /* Timeline View */
                        <div className={styles.timelineContainer}>
                            {/* Trace Selector */}
                            <div className={styles.traceSelector}>
                                <span className={styles.traceSelectorLabel}>Recent Traces:</span>
                                <div className={styles.traceList}>
                                    {traces.map((trace, i) => (
                                        <button
                                            key={trace.traceKey}
                                            className={`${styles.traceBtn} ${selectedTrace?.traceKey === trace.traceKey ? styles.traceBtnActive : ''}`}
                                            onClick={() => setSelectedTrace(trace)}
                                        >
                                            <span className={`${styles.traceStatus} ${trace.status === 'error' ? styles.traceStatusError : styles.traceStatusSuccess}`} />
                                            <span className={styles.traceRoute}>{trace.routingType}</span>
                                            <span className={styles.traceDuration}>{formatDuration(trace.totalDurationMs)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Timeline */}
                            {selectedTrace && (
                                <div className={styles.timeline}>
                                    <div className={styles.timelineHeader}>
                                        <div className={styles.timelineTitle}>
                                            <span className={`${styles.traceStatusLarge} ${selectedTrace.status === 'error' ? styles.traceStatusError : styles.traceStatusSuccess}`} />
                                            <span>Execution Timeline</span>
                                        </div>
                                        <div className={styles.timelineMeta}>
                                            <span className={styles.timelineMetaItem}>
                                                <strong>Route:</strong> {selectedTrace.routingType}
                                            </span>
                                            <span className={styles.timelineMetaItem}>
                                                <strong>Duration:</strong> {formatDuration(selectedTrace.totalDurationMs)}
                                            </span>
                                            <span className={styles.timelineMetaItem}>
                                                <strong>Time:</strong> {formatTime(selectedTrace.startTime)}
                                            </span>
                                        </div>
                                    </div>

                                    {selectedTrace.query && (
                                        <div className={styles.timelineQuery}>
                                            <span className={styles.timelineQueryLabel}>Query:</span>
                                            <span className={styles.timelineQueryText}>"{selectedTrace.query}"</span>
                                        </div>
                                    )}

                                    {/* Timeline Bars */}
                                    <div className={styles.timelineBars}>
                                        {selectedTrace.nodeExecutions.map((exec, i) => (
                                            <div
                                                key={`${exec.nodeId}-${i}`}
                                                className={styles.timelineRow}
                                                onClick={() => setSelectedNode(exec.nodeId)}
                                            >
                                                <div className={styles.timelineRowLabel}>
                                                    <span className={styles.timelineRowIcon}>{NODE_ICONS[exec.nodeId] || '📌'}</span>
                                                    <span className={styles.timelineRowName}>{exec.nodeName}</span>
                                                </div>
                                                <div className={styles.timelineRowTrack}>
                                                    <div
                                                        className={`${styles.timelineBar} ${exec.status === 'error' ? styles.timelineBarError : ''}`}
                                                        style={{
                                                            ...getTimelinePosition(
                                                                exec.startTime,
                                                                exec.endTime,
                                                                selectedTrace.startTime,
                                                                selectedTrace.totalDurationMs
                                                            ),
                                                            backgroundColor: NODE_COLORS[exec.nodeId] || '#64748b',
                                                        }}
                                                        title={`${exec.nodeName}: ${formatDuration(exec.durationMs)}`}
                                                    >
                                                        <span className={styles.timelineBarDuration}>
                                                            {formatDuration(exec.durationMs)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className={styles.timelineRowData}>
                                                    {exec.dataIn && (
                                                        <div className={styles.timelineDataFlow}>
                                                            <span className={styles.timelineDataIn}>→ {exec.dataIn}</span>
                                                        </div>
                                                    )}
                                                    {exec.dataOut && (
                                                        <div className={styles.timelineDataFlow}>
                                                            <span className={styles.timelineDataOut}>← {exec.dataOut}</span>
                                                        </div>
                                                    )}
                                                    {exec.toolCalls && exec.toolCalls.length > 0 && (
                                                        <div className={styles.timelineTools}>
                                                            {exec.toolCalls.map((tool, j) => (
                                                                <span key={j} className={styles.timelineToolBadge}>
                                                                    🔧 {tool.toolName}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Timeline Scale */}
                                    <div className={styles.timelineScale}>
                                        <span>0ms</span>
                                        <span>{formatDuration(selectedTrace.totalDurationMs / 2)}</span>
                                        <span>{formatDuration(selectedTrace.totalDurationMs)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Mermaid Diagram View */
                        <>
                            {error ? (
                                <div className={styles.diagramContainer}>
                                    <div className={styles.error}>
                                        <span className={styles.errorIcon}>⚠️</span>
                                        <span>{error}</span>
                                    </div>
                                </div>
                            ) : !data?.mermaid_diagram ? (
                                <div className={styles.diagramContainer}>
                                    <div className={styles.loading}>
                                        <div className={styles.spinner} />
                                        <span>Loading diagram...</span>
                                    </div>
                                </div>
                            ) : (
                                <div ref={diagramRef} className={styles.diagramContainer} />
                            )}
                        </>
                    )}

                    {/* Legend */}
                    <div className={styles.legend}>
                        <div className={styles.legendSection}>
                            <span className={styles.legendTitle}>Stages:</span>
                            <div className={styles.legendItem}>
                                <div className={styles.legendDot} style={{ background: '#4f46e5' }} />
                                <span>Processing</span>
                            </div>
                            <div className={styles.legendItem}>
                                <div className={styles.legendDot} style={{ background: '#10b981' }} />
                                <span>Execution</span>
                            </div>
                            <div className={styles.legendItem}>
                                <div className={styles.legendDot} style={{ background: '#f59e0b' }} />
                                <span>Completion</span>
                            </div>
                        </div>
                        <div className={styles.legendSection}>
                            <span className={styles.legendTitle}>Routing:</span>
                            <div className={styles.legendItem}>
                                <span className={styles.legendBadge} style={{ background: '#10b981' }}>70%</span>
                                <span>Workflow</span>
                            </div>
                            <div className={styles.legendItem}>
                                <span className={styles.legendBadge} style={{ background: '#3b82f6' }}>25%</span>
                                <span>Agent</span>
                            </div>
                            <div className={styles.legendItem}>
                                <span className={styles.legendBadge} style={{ background: '#f59e0b' }}>4%</span>
                                <span>Parallel</span>
                            </div>
                        </div>
                        {data?.status === 'unavailable' && (
                            <div className={styles.connectionStatus}>
                                <div className={`${styles.connectionDot} ${styles.connectionOffline}`} />
                                <span>Offline</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <div className={styles.sidebar}>
                    {/* Node Details (when selected) */}
                    {selectedNodeDetail && (
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <span>{NODE_ICONS[selectedNode || ''] || '📌'}</span>
                                <span>{selectedNodeDetail.name}</span>
                                <button className={styles.closeBtn} onClick={() => setSelectedNode(null)}>×</button>
                            </div>
                            <div className={styles.cardBody}>
                                <div className={styles.nodeDetailSection}>
                                    <div className={styles.nodeDetailLabel}>Description</div>
                                    <div className={styles.nodeDetailValue}>{selectedNodeDetail.description}</div>
                                </div>
                                <div className={styles.nodeDetailGrid}>
                                    <div className={styles.nodeDetailSection}>
                                        <div className={styles.nodeDetailLabel}>Data In</div>
                                        <div className={styles.nodeDetailCode}>{selectedNodeDetail.dataIn}</div>
                                    </div>
                                    <div className={styles.nodeDetailSection}>
                                        <div className={styles.nodeDetailLabel}>Data Out</div>
                                        <div className={styles.nodeDetailCode}>{selectedNodeDetail.dataOut}</div>
                                    </div>
                                </div>
                                <div className={styles.nodeDetailSection}>
                                    <div className={styles.nodeDetailLabel}>Operations</div>
                                    <ul className={styles.operationsList}>
                                        {selectedNodeDetail.operations.slice(0, 4).map((op, i) => (
                                            <li key={i}>{op}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className={styles.metricsRow}>
                                    <div className={styles.metric}>
                                        <span className={styles.metricLabel}>Latency</span>
                                        <span className={styles.metricValue}>{selectedNodeDetail.metrics.avgLatency}</span>
                                    </div>
                                    <div className={styles.metric}>
                                        <span className={styles.metricLabel}>Success</span>
                                        <span className={styles.metricValue}>{selectedNodeDetail.metrics.successRate}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Workflow Stages */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <span>🔄</span> Workflow Stages
                        </div>
                        <div className={styles.cardBody}>
                            {data?.stages?.map(stage => (
                                <div key={stage.name} className={styles.stageSection}>
                                    <div className={styles.stageHeader}>
                                        <div className={styles.stageDot} style={{ background: stage.color }} />
                                        <span className={styles.stageName}>{stage.name}</span>
                                    </div>
                                    <div className={styles.stageDescription}>{stage.description}</div>
                                    <div className={styles.stageNodes}>
                                        {stage.nodes.map(nodeId => {
                                            const node = displayNodes.find(n => n.id === nodeId);
                                            if (!node) return null;
                                            return (
                                                <button
                                                    key={nodeId}
                                                    className={`${styles.stageNodeBtn} ${selectedNode === nodeId ? styles.stageNodeBtnActive : ''}`}
                                                    onClick={() => setSelectedNode(nodeId)}
                                                >
                                                    {NODE_ICONS[nodeId]} {node.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Message Flow */}
                    {data?.messageFlows && (
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <span>📨</span> Data Flow
                            </div>
                            <div className={styles.cardBody}>
                                <div className={styles.messageFlowList}>
                                    {data.messageFlows.slice(0, 5).map((flow, i) => (
                                        <div key={i} className={styles.messageFlowItem}>
                                            <div className={styles.messageFlowArrow}>
                                                <span className={styles.messageFlowFrom}>{flow.from}</span>
                                                <span className={styles.messageFlowIcon}>→</span>
                                                <span className={styles.messageFlowTo}>{flow.to}</span>
                                            </div>
                                            <div className={styles.messageFlowMessage}>{flow.message}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Agents */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <span>🤖</span> Agents (7)
                        </div>
                        <div className={styles.cardBody}>
                            <div className={styles.agentGrid}>
                                {AGENTS.map(agent => (
                                    <div
                                        key={agent.id}
                                        className={styles.agentCard}
                                        style={{ borderLeftColor: agent.color }}
                                    >
                                        <div className={styles.agentIcon}>{agent.icon}</div>
                                        <div className={styles.agentInfo}>
                                            <div className={styles.agentName}>{agent.name}</div>
                                            <div className={styles.agentDomain}>{agent.domain}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Example Queries */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <span>💡</span> Examples
                        </div>
                        <div className={styles.cardBody}>
                            <div className={styles.exampleList}>
                                {currentExamples.slice(0, 3).map((example, idx) => (
                                    <div key={idx} className={styles.exampleItem}>
                                        <div className={styles.exampleQuery}>"{example.query}"</div>
                                        <div className={styles.exampleDescription}>{example.description}</div>
                                        {example.workflow && (
                                            <span className={styles.exampleBadge} style={{ background: '#10b981' }}>
                                                {example.workflow}
                                            </span>
                                        )}
                                        {example.agent && (
                                            <span className={styles.exampleBadge} style={{ background: '#3b82f6' }}>
                                                {example.agent}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LangGraphVisualizer;
