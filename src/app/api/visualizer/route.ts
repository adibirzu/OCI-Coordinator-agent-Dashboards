import { NextResponse } from 'next/server';

const COORDINATOR_API_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';

// Detailed node information for the workflow
const NODE_DETAILS = {
    input: {
        id: 'input',
        name: 'Input Node',
        description: 'Receives and enhances user queries',
        stage: 'Query Processing',
        spanName: 'input_node',
        dataIn: 'Raw user query string',
        dataOut: 'Enhanced query with context',
        operations: [
            'Query validation',
            'Context extraction from conversation history',
            'Query enhancement via LLM (optional)',
            'Entity pre-extraction',
        ],
        metrics: {
            avgLatency: '50-200ms',
            successRate: '99.9%',
        },
    },
    classifier: {
        id: 'classifier',
        name: 'Classifier Node',
        description: 'Classifies intent and extracts entities',
        stage: 'Query Processing',
        spanName: 'classifier_node',
        dataIn: 'Enhanced query',
        dataOut: 'IntentClassification object',
        operations: [
            'Intent classification (QUERY, ACTION, ANALYSIS, TROUBLESHOOT)',
            'Domain detection (database, security, finops, etc.)',
            'Entity extraction (instance names, compartments, dates)',
            'Confidence scoring',
        ],
        metrics: {
            avgLatency: '100-500ms',
            successRate: '98%',
        },
    },
    router: {
        id: 'router',
        name: 'Router Node',
        description: 'Determines optimal execution path',
        stage: 'Query Processing',
        spanName: 'router_node',
        dataIn: 'IntentClassification',
        dataOut: 'RoutingDecision',
        operations: [
            'Workflow matching (confidence ≥0.90)',
            'Agent selection (confidence ≥0.50)',
            'Parallel execution check (2+ domains)',
            'Escalation decision (confidence <0.25)',
        ],
        routingPaths: {
            WORKFLOW: '70% of requests - deterministic, fast',
            AGENT: '25% of requests - LLM reasoning needed',
            PARALLEL: '4% of requests - multi-domain queries',
            ESCALATE: '1% of requests - human review needed',
        },
        metrics: {
            avgLatency: '10-50ms',
            successRate: '99.5%',
        },
    },
    workflow: {
        id: 'workflow',
        name: 'Workflow Node',
        description: 'Executes deterministic workflows',
        stage: 'Execution',
        spanName: 'workflow_node',
        dataIn: 'RoutingDecision + query + entities',
        dataOut: 'Workflow result string',
        operations: [
            'Workflow function lookup',
            'Tool execution (MCP calls)',
            'Result formatting',
        ],
        availableWorkflows: [
            'list_compartments', 'cost_summary', 'list_instances',
            'db_blocking_sessions', 'db_wait_events', 'awr_report',
        ],
        metrics: {
            avgLatency: '500ms-5s',
            successRate: '95%',
        },
    },
    parallel: {
        id: 'parallel',
        name: 'Parallel Node',
        description: 'Orchestrates multiple agents in parallel',
        stage: 'Execution',
        spanName: 'parallel_node',
        dataIn: 'RoutingDecision + multi-domain query',
        dataOut: 'Synthesized results from all agents',
        operations: [
            'Query decomposition into subtasks',
            'Agent assignment per domain',
            'Parallel execution (up to 5 agents)',
            'Result synthesis via LLM',
        ],
        metrics: {
            avgLatency: '5-30s',
            successRate: '90%',
        },
    },
    agent: {
        id: 'agent',
        name: 'Agent Node',
        description: 'LLM-powered reasoning with tool access',
        stage: 'Execution',
        spanName: 'agent_node',
        dataIn: 'Query + agent context + available tools',
        dataOut: 'Response or tool calls',
        operations: [
            'LLM invocation with system prompt',
            'Tool selection and parameter extraction',
            'Response generation',
            'Iteration control (max 15 turns)',
        ],
        availableAgents: [
            'DbTroubleshootAgent', 'LogAnalyticsAgent', 'SecurityThreatAgent',
            'FinOpsAgent', 'InfrastructureAgent', 'ErrorAnalysisAgent', 'SelectAIAgent',
        ],
        metrics: {
            avgLatency: '2-15s',
            successRate: '92%',
        },
    },
    action: {
        id: 'action',
        name: 'Action Node',
        description: 'Executes tool calls from agent',
        stage: 'Execution',
        spanName: 'action_node',
        dataIn: 'Tool calls from agent',
        dataOut: 'Tool results',
        operations: [
            'Tool validation',
            'MCP server invocation',
            'Result capture and formatting',
            'Error handling',
        ],
        mcpServers: [
            'oci-unified (77 tools)', 'database-observatory (50+ tools)',
            'finopsai (33 tools)', 'oci-mcp-security (60+ tools)',
        ],
        metrics: {
            avgLatency: '100ms-10s (varies by tool)',
            successRate: '94%',
        },
    },
    output: {
        id: 'output',
        name: 'Output Node',
        description: 'Formats and returns final response',
        stage: 'Completion',
        spanName: 'output_node',
        dataIn: 'Raw response from workflow/agent',
        dataOut: 'Formatted response for channel',
        operations: [
            'Response formatting (markdown, slack, teams)',
            'Thinking trace compilation',
            'Metadata attachment',
            'Memory storage (conversation history)',
        ],
        metrics: {
            avgLatency: '10-100ms',
            successRate: '99.9%',
        },
    },
};

// Message flow definition
const MESSAGE_FLOWS = [
    { from: 'User', to: 'input', message: 'Natural language query', type: 'request' },
    { from: 'input', to: 'classifier', message: 'Enhanced query + context', type: 'internal' },
    { from: 'classifier', to: 'router', message: 'Intent + entities + domains', type: 'internal' },
    { from: 'router', to: 'workflow', message: 'Workflow name + parameters', type: 'branch', condition: 'WORKFLOW path' },
    { from: 'router', to: 'parallel', message: 'Subtasks + agent assignments', type: 'branch', condition: 'PARALLEL path' },
    { from: 'router', to: 'agent', message: 'Agent context + tools', type: 'branch', condition: 'AGENT path' },
    { from: 'workflow', to: 'output', message: 'Workflow result', type: 'internal' },
    { from: 'parallel', to: 'output', message: 'Synthesized multi-agent results', type: 'internal' },
    { from: 'agent', to: 'action', message: 'Tool calls (JSON)', type: 'loop' },
    { from: 'action', to: 'agent', message: 'Tool results', type: 'loop' },
    { from: 'agent', to: 'output', message: 'Final response', type: 'internal' },
    { from: 'output', to: 'User', message: 'Formatted response', type: 'response' },
];

/**
 * GET /api/visualizer
 * Proxies to the OCI Coordinator's visualizer endpoint
 * Returns LangGraph workflow visualization data with enhanced details
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const routingType = searchParams.get('routing_type');
    const viewMode = searchParams.get('view') || 'flowchart'; // flowchart, sequence, detailed

    try {
        const url = routingType
            ? `${COORDINATOR_API_URL}/visualizer/diagram?routing_type=${routingType}`
            : `${COORDINATOR_API_URL}/visualizer`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            throw new Error(`Coordinator returned ${response.status}`);
        }

        const data = await response.json();
        return NextResponse.json({
            status: 'ok',
            ...data,
            nodeDetails: NODE_DETAILS,
            messageFlows: MESSAGE_FLOWS,
        });
    } catch (error) {
        console.error('Visualizer fetch error:', error);

        // Generate diagram based on view mode
        const diagram = generateDiagram(viewMode, routingType);

        return NextResponse.json({
            status: 'unavailable',
            message: 'Coordinator service unavailable - showing static workflow',
            viewMode,
            nodes: [
                { id: '__start__', name: 'START', description: 'Entry point', status: 'idle', stage: 'Entry' },
                { id: 'input', name: 'Input', description: 'Process and enhance query', status: 'idle', stage: 'Query Processing' },
                { id: 'classifier', name: 'Classifier', description: 'Classify intent & extract entities', status: 'idle', stage: 'Query Processing' },
                { id: 'router', name: 'Router', description: 'Determine execution path', status: 'idle', stage: 'Query Processing' },
                { id: 'workflow', name: 'Workflow', description: 'Execute deterministic workflow', status: 'idle', stage: 'Execution' },
                { id: 'parallel', name: 'Parallel', description: 'Multi-agent parallel execution', status: 'idle', stage: 'Execution' },
                { id: 'agent', name: 'Agent', description: 'LLM-powered reasoning', status: 'idle', stage: 'Execution' },
                { id: 'action', name: 'Action', description: 'Execute tool calls', status: 'idle', stage: 'Execution' },
                { id: 'output', name: 'Output', description: 'Format and return response', status: 'idle', stage: 'Completion' },
                { id: '__end__', name: 'END', description: 'Processing complete', status: 'idle', stage: 'Exit' },
            ],
            edges: [
                { source: '__start__', target: 'input', edge_type: 'sequential', label: 'Query received' },
                { source: 'input', target: 'classifier', edge_type: 'sequential', label: 'Enhanced query' },
                { source: 'classifier', target: 'router', edge_type: 'sequential', label: 'Intent + entities' },
                { source: 'router', target: 'workflow', edge_type: 'conditional', label: 'WORKFLOW (70%)' },
                { source: 'router', target: 'parallel', edge_type: 'conditional', label: 'PARALLEL (4%)' },
                { source: 'router', target: 'agent', edge_type: 'conditional', label: 'AGENT (25%)' },
                { source: 'router', target: 'output', edge_type: 'conditional', label: 'ESCALATE (1%)' },
                { source: 'workflow', target: 'output', edge_type: 'sequential', label: 'Result' },
                { source: 'parallel', target: 'output', edge_type: 'sequential', label: 'Synthesized results' },
                { source: 'agent', target: 'action', edge_type: 'conditional', label: 'Tool calls' },
                { source: 'agent', target: 'output', edge_type: 'conditional', label: 'Final response' },
                { source: 'action', target: 'agent', edge_type: 'loop', label: 'Tool results' },
                { source: 'action', target: 'output', edge_type: 'conditional', label: 'Max iterations' },
                { source: 'output', target: '__end__', edge_type: 'sequential', label: 'Response sent' },
            ],
            nodeDetails: NODE_DETAILS,
            messageFlows: MESSAGE_FLOWS,
            mermaid_diagram: diagram,
            example_queries: {
                workflow: [
                    { query: 'List all compartments', description: 'Simple infrastructure query → list_compartments workflow', workflow: 'list_compartments' },
                    { query: 'Show cost summary', description: 'Cost query → cost_summary workflow', workflow: 'cost_summary' },
                    { query: 'Check blocking sessions', description: 'DB troubleshooting → db_blocking_sessions workflow', workflow: 'db_blocking_sessions' },
                    { query: 'Show wait events', description: 'DB performance → db_wait_events workflow', workflow: 'db_wait_events' },
                ],
                parallel: [
                    { query: 'Analyze database performance and compare with monthly costs', description: 'Multi-domain: DB + FinOps agents run in parallel', agents: ['DbTroubleshootAgent', 'FinOpsAgent'] },
                    { query: 'Check security issues and their impact on infrastructure', description: 'Multi-domain: Security + Infrastructure agents', agents: ['SecurityThreatAgent', 'InfrastructureAgent'] },
                ],
                agent: [
                    { query: 'Why is my database slow today compared to yesterday?', description: 'Complex analysis → DbTroubleshootAgent with multiple tool calls', agent: 'DbTroubleshootAgent' },
                    { query: 'Investigate the cost anomaly in November', description: 'Investigation → FinOpsAgent with reasoning', agent: 'FinOpsAgent' },
                    { query: 'Correlate security alerts with log patterns', description: 'Cross-reference → LogAnalyticsAgent', agent: 'LogAnalyticsAgent' },
                ],
                escalate: [
                    { query: 'Deploy new infrastructure to production', description: 'Potentially dangerous → Human review required', reason: 'Action requires approval' },
                ],
            },
            stages: [
                { name: 'Query Processing', nodes: ['input', 'classifier', 'router'], color: '#4f46e5', description: 'Understanding what the user wants' },
                { name: 'Execution', nodes: ['workflow', 'parallel', 'agent', 'action'], color: '#10b981', description: 'Performing the requested operation' },
                { name: 'Completion', nodes: ['output'], color: '#f59e0b', description: 'Formatting and returning results' },
            ],
        });
    }
}

function generateDiagram(viewMode: string, routingType: string | null): string {
    if (viewMode === 'sequence') {
        return generateSequenceDiagram(routingType);
    }
    return generateFlowchartDiagram(routingType);
}

function generateFlowchartDiagram(routingType: string | null): string {
    const highlightPath = routingType?.toUpperCase() || null;

    return `%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#4f46e5', 'primaryTextColor': '#fff', 'primaryBorderColor': '#4338ca', 'lineColor': '#64748b', 'secondaryColor': '#10b981', 'tertiaryColor': '#f59e0b', 'background': '#0f172a', 'mainBkg': '#1e293b', 'nodeBorder': '#334155', 'clusterBkg': '#1e293b', 'clusterBorder': '#334155', 'titleColor': '#f1f5f9', 'edgeLabelBackground': '#1e293b', 'textColor': '#f1f5f9'}}}%%
flowchart TD
    %% Entry Point
    subgraph entry[" "]
        direction TB
        USER(("👤 User"))
        START(("▶"))
    end

    %% Query Processing Stage
    subgraph processing["🔍 QUERY PROCESSING"]
        direction TB
        INPUT["📥 <b>Input</b><br/><small>Enhance query + extract context</small>"]
        CLASSIFIER["🎯 <b>Classifier</b><br/><small>Intent • Entities • Domains</small>"]
        ROUTER{"🔀 <b>Router</b><br/><small>Select execution path</small>"}
    end

    %% Execution Stage
    subgraph execution["⚡ EXECUTION"]
        direction TB
        WORKFLOW["📋 <b>Workflow</b><br/><small>Deterministic • Fast<br/>30+ pre-built workflows</small>"]
        PARALLEL["🔄 <b>Parallel</b><br/><small>Multi-Agent • Complex<br/>Up to 5 agents</small>"]
        AGENT["🤖 <b>Agent</b><br/><small>LLM Reasoning<br/>7 specialized agents</small>"]
        ACTION["🔧 <b>Action</b><br/><small>Tool Execution<br/>395+ MCP tools</small>"]
    end

    %% Completion Stage
    subgraph completion["✅ COMPLETION"]
        direction TB
        OUTPUT["📤 <b>Output</b><br/><small>Format • Store • Return</small>"]
    end

    %% Exit
    subgraph exit[" "]
        END_(("⏹"))
        RESPONSE(("📨"))
    end

    %% Main Flow
    USER -->|"Query"| START
    START --> INPUT
    INPUT -->|"enhanced query"| CLASSIFIER
    CLASSIFIER -->|"intent + entities"| ROUTER

    %% Routing Decisions
    ROUTER -->|"<b>WORKFLOW</b><br/>70% • ≥0.90 conf"| WORKFLOW
    ROUTER -->|"<b>PARALLEL</b><br/>4% • 2+ domains"| PARALLEL
    ROUTER -->|"<b>AGENT</b><br/>25% • complex"| AGENT
    ROUTER -.->|"<b>ESCALATE</b><br/>1% • low conf"| OUTPUT

    %% Execution to Output
    WORKFLOW -->|"result"| OUTPUT
    PARALLEL -->|"synthesized"| OUTPUT

    %% Agent-Action Loop
    AGENT -->|"tool_calls"| ACTION
    ACTION -->|"results"| AGENT
    AGENT -->|"final response"| OUTPUT
    ACTION -.->|"max iterations"| OUTPUT

    %% Output to End
    OUTPUT --> END_
    END_ -->|"Response"| RESPONSE
    RESPONSE --> USER

    %% Styling
    style USER fill:#3b82f6,stroke:#2563eb,color:#fff,stroke-width:2px
    style START fill:#22c55e,stroke:#16a34a,color:#fff
    style END_ fill:#ef4444,stroke:#dc2626,color:#fff
    style RESPONSE fill:#3b82f6,stroke:#2563eb,color:#fff

    style INPUT fill:#6366f1,stroke:#4f46e5,color:#fff
    style CLASSIFIER fill:#6366f1,stroke:#4f46e5,color:#fff
    style ROUTER fill:#8b5cf6,stroke:#7c3aed,color:#fff,stroke-width:3px

    style WORKFLOW fill:#10b981,stroke:#059669,color:#fff${highlightPath === 'WORKFLOW' ? ',stroke-width:4px' : ''}
    style PARALLEL fill:#f59e0b,stroke:#d97706,color:#fff${highlightPath === 'PARALLEL' ? ',stroke-width:4px' : ''}
    style AGENT fill:#3b82f6,stroke:#2563eb,color:#fff${highlightPath === 'AGENT' ? ',stroke-width:4px' : ''}
    style ACTION fill:#6366f1,stroke:#4f46e5,color:#fff

    style OUTPUT fill:#f97316,stroke:#ea580c,color:#fff

    %% Subgraph styling
    style entry fill:transparent,stroke:transparent
    style exit fill:transparent,stroke:transparent
    style processing fill:#1e293b,stroke:#4f46e5,stroke-width:2px,color:#f1f5f9
    style execution fill:#1e293b,stroke:#10b981,stroke-width:2px,color:#f1f5f9
    style completion fill:#1e293b,stroke:#f59e0b,stroke-width:2px,color:#f1f5f9`;
}

function generateSequenceDiagram(routingType: string | null): string {
    const path = routingType?.toUpperCase() || 'WORKFLOW';

    let executionSteps = '';

    if (path === 'WORKFLOW') {
        executionSteps = `
    Router->>+Workflow: Execute workflow
    Note over Workflow: Lookup workflow function
    Workflow->>+MCP: Tool calls
    MCP-->>-Workflow: Results
    Workflow-->>-Router: Workflow result`;
    } else if (path === 'PARALLEL') {
        executionSteps = `
    Router->>+Orchestrator: Parallel execution
    Note over Orchestrator: Decompose into subtasks
    par Agent 1
        Orchestrator->>+Agent1: Subtask 1
        Agent1->>MCP: Tools
        MCP-->>Agent1: Results
        Agent1-->>-Orchestrator: Result 1
    and Agent 2
        Orchestrator->>+Agent2: Subtask 2
        Agent2->>MCP: Tools
        MCP-->>Agent2: Results
        Agent2-->>-Orchestrator: Result 2
    end
    Note over Orchestrator: Synthesize results
    Orchestrator-->>-Router: Combined result`;
    } else {
        executionSteps = `
    Router->>+Agent: Delegate to agent
    loop Tool Calling Loop (max 15)
        Agent->>Agent: LLM reasoning
        alt Has tool calls
            Agent->>+Action: Execute tools
            Action->>+MCP: Tool invocation
            MCP-->>-Action: Tool results
            Action-->>-Agent: Results
        else Final response ready
            Agent-->>Router: Response
        end
    end
    Agent-->>-Router: Final response`;
    }

    return `%%{init: {'theme': 'dark', 'themeVariables': { 'actorBkg': '#3b82f6', 'actorTextColor': '#fff', 'actorLineColor': '#64748b', 'signalColor': '#f1f5f9', 'signalTextColor': '#f1f5f9', 'labelBoxBkgColor': '#1e293b', 'labelTextColor': '#f1f5f9', 'loopTextColor': '#f1f5f9', 'noteBkgColor': '#334155', 'noteTextColor': '#f1f5f9'}}}%%
sequenceDiagram
    autonumber

    participant User as 👤 User
    participant Input as 📥 Input
    participant Classifier as 🎯 Classifier
    participant Router as 🔀 Router
    participant Workflow as 📋 Workflow
    participant Orchestrator as 🔄 Parallel
    participant Agent as 🤖 Agent
    participant Agent1 as 🤖 Agent 1
    participant Agent2 as 🤖 Agent 2
    participant Action as 🔧 Action
    participant MCP as 🔌 MCP Tools
    participant Output as 📤 Output

    User->>+Input: Natural language query
    Note over Input: Query enhancement<br/>Context extraction
    Input->>+Classifier: Enhanced query

    Note over Classifier: Intent classification<br/>Entity extraction<br/>Domain detection
    Classifier->>+Router: IntentClassification

    Note over Router: Confidence: 0.95<br/>Path: ${path}
    ${executionSteps}

    Router->>+Output: Result
    Note over Output: Format response<br/>Store in memory
    Output-->>-User: Formatted response

    Note over User,Output: Total latency: ~2-15 seconds`;
}
