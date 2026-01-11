import { useState, useEffect, useCallback } from 'react';
import { ociService } from '@/services/OCIService';

export interface WorkflowNode {
    id: string;
    type: 'user' | 'coordinator' | 'agent' | 'mcp' | 'oci_service' | 'observability';
    label: string;
    x: number;
    y: number;
    status: 'active' | 'inactive' | 'error' | 'healthy' | 'scanning';
    details?: any;
    skills?: { name: string; description: string }[];
    tools?: string[];
    toolCount?: number;
    capabilities?: string[];
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    active: boolean;
}

// Agent skill definitions (from oci-coordinator)
const AGENT_SKILLS: Record<string, { name: string; description: string }[]> = {
    'agent-db': [
        { name: 'db_rca_workflow', description: '7-step root cause analysis for database issues' },
        { name: 'db_health_check', description: 'Quick health check via OPSI cache' },
        { name: 'db_sql_analysis', description: 'Deep SQL performance analysis' },
        { name: 'blocking_sessions', description: 'Detect and analyze blocking locks' },
        { name: 'wait_events', description: 'AWR wait event interpretation' },
        { name: 'sql_tuning', description: 'SQL tuning recommendations' },
        { name: 'fleet_overview', description: 'Database fleet summary' },
    ],
    'agent-log': [
        { name: 'log_search', description: 'Search logs with OCI Log Analytics' },
        { name: 'pattern_detection', description: 'Error pattern frequency analysis' },
        { name: 'trace_correlation', description: 'Cross-service trace_id correlation' },
        { name: 'anomaly_detection', description: 'High-frequency burst detection' },
    ],
    'agent-sec': [
        { name: 'threat_analysis', description: 'MITRE ATT&CK threat mapping' },
        { name: 'cloud_guard', description: 'Cloud Guard problem analysis' },
        { name: 'compliance_check', description: 'Security posture assessment' },
        { name: 'vulnerability_scan', description: 'VSS vulnerability scanning' },
    ],
    'agent-fin': [
        { name: 'cost_analysis', description: 'Cost breakdown by service/compartment' },
        { name: 'cost_anomaly', description: 'Spending anomaly detection' },
        { name: 'optimization', description: 'Rightsizing recommendations' },
    ],
    'agent-infra': [
        { name: 'instance_lifecycle', description: 'Compute instance management' },
        { name: 'network_topology', description: 'VCN/subnet analysis' },
        { name: 'storage_ops', description: 'Block volume operations' },
        { name: 'resource_inventory', description: 'Cross-compartment discovery' },
    ],
};

// MCP server tool counts (from code review)
const MCP_TOOLS: Record<string, { count: number; samples: string[] }> = {
    'mcp-unified': {
        count: 30,
        samples: ['oci_compute_list_instances', 'oci_network_list_vcns', 'oci_cost_get_summary'],
    },
    'mcp-db': {
        count: 30,
        samples: ['oci_opsi_get_fleet_summary', 'oci_database_execute_sql', 'oci_opsi_analyze_cpu'],
    },
    'mcp-oci': {
        count: 50,
        samples: ['list_instances', 'list_autonomous_databases', 'get_namespace'],
    },
    'mcp-finops': {
        count: 33,
        samples: ['get_cost_summary', 'analyze_anomaly', 'k8s_cost_allocation'],
    },
    'mcp-security': {
        count: 41,
        samples: ['list_cloud_guard_problems', 'scan_vulnerabilities', 'list_waf_policies'],
    },
};

export function useWorkflowSimulation() {
    const [state, setState] = useState<{ nodes: WorkflowNode[], edges: WorkflowEdge[] }>({
        nodes: [],
        edges: []
    });
    const [isRunning, setIsRunning] = useState(false);

    // Initial Topology setup matching AGENT.md architecture (5 agents, 5 MCP servers)
    useEffect(() => {
        // Virtual canvas coordinates (centered around x=700)
        const width = 1400;
        const centerX = width / 2;

        const nodes: WorkflowNode[] = [
            // Level 1: Input Channels
            {
                id: 'user',
                type: 'user',
                label: 'Input (Slack / API / ViewApp)',
                x: centerX,
                y: 50,
                status: 'active'
            },

            // Level 2: Coordinator (8 nodes, 16 workflows)
            {
                id: 'coordinator',
                type: 'coordinator',
                label: 'Coordinator (LangGraph)',
                x: centerX,
                y: 180,
                status: 'healthy',
                details: {
                    nodes: 8,
                    workflows: 16,
                    description: 'Intent classification, routing, workflow execution'
                }
            },

            // Level 3: 5 Specialized Agents
            {
                id: 'agent-db',
                type: 'agent',
                label: 'DB Troubleshoot',
                x: centerX - 280,
                y: 350,
                status: 'inactive',
                skills: AGENT_SKILLS['agent-db'],
                capabilities: ['database-analysis', 'performance-diagnostics', 'sql-tuning']
            },
            {
                id: 'agent-log',
                type: 'agent',
                label: 'Log Analytics',
                x: centerX - 140,
                y: 350,
                status: 'inactive',
                skills: AGENT_SKILLS['agent-log'],
                capabilities: ['log-search', 'pattern-detection', 'correlation']
            },
            {
                id: 'agent-sec',
                type: 'agent',
                label: 'Security Threat',
                x: centerX,
                y: 350,
                status: 'inactive',
                skills: AGENT_SKILLS['agent-sec'],
                capabilities: ['threat-hunting', 'mitre-mapping', 'compliance']
            },
            {
                id: 'agent-fin',
                type: 'agent',
                label: 'FinOps',
                x: centerX + 140,
                y: 350,
                status: 'inactive',
                skills: AGENT_SKILLS['agent-fin'],
                capabilities: ['cost-analysis', 'optimization', 'forecasting']
            },
            {
                id: 'agent-infra',
                type: 'agent',
                label: 'Infrastructure',
                x: centerX + 280,
                y: 350,
                status: 'inactive',
                skills: AGENT_SKILLS['agent-infra'],
                capabilities: ['compute-management', 'network-analysis', 'storage']
            },

            // Level 4: 5 MCP Servers
            {
                id: 'mcp-unified',
                type: 'mcp',
                label: 'OCI Unified',
                x: centerX - 280,
                y: 520,
                status: 'healthy',
                toolCount: MCP_TOOLS['mcp-unified'].count,
                tools: MCP_TOOLS['mcp-unified'].samples,
                details: { domains: ['compute', 'network', 'identity', 'cost', 'discovery'] }
            },
            {
                id: 'mcp-db',
                type: 'mcp',
                label: 'Database Observatory',
                x: centerX - 140,
                y: 520,
                status: 'healthy',
                toolCount: MCP_TOOLS['mcp-db'].count,
                tools: MCP_TOOLS['mcp-db'].samples,
                details: { domains: ['database', 'opsi', 'logan', 'sqlcl'] }
            },
            {
                id: 'mcp-oci',
                type: 'mcp',
                label: 'MCP-OCI',
                x: centerX,
                y: 520,
                status: 'healthy',
                toolCount: MCP_TOOLS['mcp-oci'].count,
                tools: MCP_TOOLS['mcp-oci'].samples,
                details: { domains: ['compute', 'database', 'network', 'objectstorage'] }
            },
            {
                id: 'mcp-finops',
                type: 'mcp',
                label: 'FinOps AI',
                x: centerX + 140,
                y: 520,
                status: 'inactive',
                toolCount: MCP_TOOLS['mcp-finops'].count,
                tools: MCP_TOOLS['mcp-finops'].samples,
                details: { domains: ['cost', 'kubernetes', 'sustainability', 'multicloud'] }
            },
            {
                id: 'mcp-security',
                type: 'mcp',
                label: 'OCI Security',
                x: centerX + 280,
                y: 520,
                status: 'inactive',
                toolCount: MCP_TOOLS['mcp-security'].count,
                tools: MCP_TOOLS['mcp-security'].samples,
                details: { domains: ['cloudguard', 'vss', 'waf', 'bastion', 'kms'] }
            },

            // Level 5: OCI
            {
                id: 'oci',
                type: 'oci_service',
                label: 'Oracle Cloud Infrastructure',
                x: centerX,
                y: 700,
                status: 'healthy',
                details: { description: 'OCI SDK API calls' }
            },

            // Side: Observability (floating right)
            {
                id: 'obs-apm',
                type: 'observability',
                label: 'OCI APM (Traces)',
                x: width - 120,
                y: 250,
                status: 'healthy',
                details: { protocol: 'OTLP', tracing: true }
            },
            {
                id: 'obs-log',
                type: 'observability',
                label: 'OCI Logging',
                x: width - 120,
                y: 600,
                status: 'healthy',
                details: { correlation: 'trace_id', perAgent: true }
            },
        ];

        const edges: WorkflowEdge[] = [
            // User -> Coordinator
            { id: 'e-user-coord', source: 'user', target: 'coordinator', active: false },

            // Coordinator -> Agents
            { id: 'e-coord-db', source: 'coordinator', target: 'agent-db', active: false },
            { id: 'e-coord-log', source: 'coordinator', target: 'agent-log', active: false },
            { id: 'e-coord-sec', source: 'coordinator', target: 'agent-sec', active: false },
            { id: 'e-coord-fin', source: 'coordinator', target: 'agent-fin', active: false },
            { id: 'e-coord-infra', source: 'coordinator', target: 'agent-infra', active: false },

            // Agents -> MCP Servers (domain-based routing)
            { id: 'e-db-mcp-db', source: 'agent-db', target: 'mcp-db', active: false },
            { id: 'e-log-mcp-db', source: 'agent-log', target: 'mcp-db', active: false },
            { id: 'e-sec-mcp-sec', source: 'agent-sec', target: 'mcp-security', active: false },
            { id: 'e-sec-mcp-uni', source: 'agent-sec', target: 'mcp-unified', active: false },
            { id: 'e-fin-mcp-fin', source: 'agent-fin', target: 'mcp-finops', active: false },
            { id: 'e-fin-mcp-uni', source: 'agent-fin', target: 'mcp-unified', active: false },
            { id: 'e-infra-mcp-uni', source: 'agent-infra', target: 'mcp-unified', active: false },
            { id: 'e-infra-mcp-oci', source: 'agent-infra', target: 'mcp-oci', active: false },

            // MCPs -> OCI
            { id: 'e-mcpuni-oci', source: 'mcp-unified', target: 'oci', active: false },
            { id: 'e-mcpdb-oci', source: 'mcp-db', target: 'oci', active: false },
            { id: 'e-mcpoci-oci', source: 'mcp-oci', target: 'oci', active: false },
            { id: 'e-mcpfin-oci', source: 'mcp-finops', target: 'oci', active: false },
            { id: 'e-mcpsec-oci', source: 'mcp-security', target: 'oci', active: false },

            // Observability connections
            { id: 'e-coord-apm', source: 'coordinator', target: 'obs-apm', active: false },
            { id: 'e-oci-log', source: 'oci', target: 'obs-log', active: false },
        ];

        setState({ nodes, edges });

        // Poll for real status from coordinator
        const pollStatus = async () => {
            try {
                const status = await ociService.getCoordinatorStatus();

                // Update node statuses based on API response
                setState(prev => {
                    const updatedNodes = prev.nodes.map(node => {
                        // Update agent statuses
                        if (node.type === 'agent' && status.agents) {
                            const agentData = status.agents.find((a: any) =>
                                a.id === node.id.replace('agent-', '') ||
                                a.id.includes(node.label.toLowerCase().replace(' ', '-'))
                            );
                            if (agentData) {
                                return {
                                    ...node,
                                    status: agentData.status || 'inactive',
                                    skills: agentData.skills?.map((s: string) => ({
                                        name: s,
                                        description: `Skill: ${s}`
                                    })) || node.skills,
                                    capabilities: agentData.capabilities || node.capabilities,
                                };
                            }
                        }

                        // Update MCP statuses
                        if (node.type === 'mcp' && status.mcps) {
                            const mcpData = status.mcps.find((m: any) =>
                                m.id === node.id.replace('mcp-', '') ||
                                m.name?.toLowerCase().includes(node.label.toLowerCase().split(' ')[0])
                            );
                            if (mcpData) {
                                return {
                                    ...node,
                                    status: mcpData.status || 'healthy',
                                    toolCount: mcpData.toolCount || node.toolCount,
                                };
                            }
                        }

                        return node;
                    });

                    return { ...prev, nodes: updatedNodes };
                });

                setIsRunning(status.isRunning);
            } catch (e) {
                console.warn('Failed to poll coordinator status:', e);
            }
        };

        pollStatus();
        // Poll every 30 seconds
        const interval = setInterval(pollStatus, 30000);
        return () => clearInterval(interval);

    }, []);

    // Animation Logic (Pulse through active paths)
    useEffect(() => {
        if (!isRunning) return;

        const timer = setInterval(() => {
            setState(prev => {
                // Randomly activate a flow to demonstrate visualization
                const activePathIndex = Math.floor(Math.random() * 5);
                const agentIds = ['agent-db', 'agent-log', 'agent-sec', 'agent-fin', 'agent-infra'];
                const selectedAgentId = agentIds[activePathIndex];

                // Activate User -> Coordinator -> Selected Agent -> MCP -> OCI flow
                const newEdges = prev.edges.map(e => ({
                    ...e,
                    active: (
                        e.source === 'user' ||
                        (e.source === 'coordinator' && e.target === selectedAgentId) ||
                        e.source === selectedAgentId ||
                        e.target === 'oci'
                    )
                }));

                const newNodes = prev.nodes.map(n => ({
                    ...n,
                    status: ((n.id === selectedAgentId || n.id === 'coordinator' || n.id === 'user')
                        ? 'active'
                        : (n.status === 'active' ? 'healthy' : n.status)) as WorkflowNode['status']
                }));

                return { nodes: newNodes, edges: newEdges };
            });
        }, 3000);

        return () => clearInterval(timer);
    }, [isRunning]);

    const toggle = () => setIsRunning(!isRunning);

    const updateNodePosition = useCallback((id: string, x: number, y: number) => {
        setState(prev => ({
            ...prev,
            nodes: prev.nodes.map(n => n.id === id ? { ...n, x, y } : n)
        }));
    }, []);

    return { state, isRunning, toggle, updateNodePosition };
}
