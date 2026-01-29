import { NextResponse } from 'next/server';

const COORDINATOR_API_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';

// Map workflow nodes to APM span names
const NODE_TO_SPAN_MAP: Record<string, string[]> = {
    input: ['input_node', 'query_enhancement', 'context_extraction'],
    classifier: ['classifier_node', 'intent_classification', 'entity_extraction'],
    router: ['router_node', 'routing_decision', 'determine_routing'],
    workflow: ['workflow_node', 'workflow_execution', 'execute_workflow'],
    parallel: ['parallel_node', 'parallel_orchestrator', 'multi_agent_execution'],
    agent: ['agent_node', 'agent_execution', 'llm_invocation'],
    action: ['action_node', 'tool_execution', 'mcp_call'],
    output: ['output_node', 'response_formatting', 'format_response'],
};

interface ApmSpan {
    spanKey: string;
    spanName: string;
    serviceName: string;
    operationName: string;
    timeStarted: string;
    timeEnded: string;
    durationInMs: number;
    status: string;
    parentSpanKey: string | null;
    isError: boolean;
    tags: Record<string, string>;
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

interface ToolCall {
    toolName: string;
    durationMs: number;
    status: string;
    input?: string;
    output?: string;
}

/**
 * GET /api/visualizer/traces
 * Fetches APM traces and correlates them with workflow nodes
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const traceKey = searchParams.get('traceKey');
    const limit = parseInt(searchParams.get('limit') || '10');

    try {
        // Try to fetch from coordinator's APM endpoint
        const apmUrl = traceKey
            ? `${COORDINATOR_API_URL}/apm/trace/${traceKey}`
            : `${COORDINATOR_API_URL}/apm/traces?limit=${limit}`;

        const response = await fetch(apmUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
            const data = await response.json();
            // Transform APM data to workflow traces
            const workflowTraces = transformApmToWorkflowTraces(data);
            return NextResponse.json({
                status: 'ok',
                traces: workflowTraces,
                source: 'apm',
            });
        }
    } catch (error) {
        console.log('APM fetch failed, using mock data:', error);
    }

    // Return mock workflow traces for demo/development
    return NextResponse.json({
        status: 'mock',
        message: 'Using mock trace data - APM not connected',
        traces: generateMockWorkflowTraces(limit),
        source: 'mock',
    });
}

function transformApmToWorkflowTraces(apmData: any): WorkflowTrace[] {
    // Transform APM spans to workflow node executions
    if (!apmData.traces && !apmData.spans) {
        return [];
    }

    const traces = apmData.traces || [apmData];
    return traces.map((trace: any) => {
        const spans = trace.spans || [];
        const nodeExecutions = mapSpansToNodes(spans);

        return {
            traceKey: trace.traceKey || trace.traceId,
            totalDurationMs: trace.totalDurationMs || calculateTotalDuration(spans),
            startTime: trace.startTime || spans[0]?.timeStarted,
            endTime: trace.endTime || spans[spans.length - 1]?.timeEnded,
            status: determineTraceStatus(spans),
            routingType: extractRoutingType(spans),
            nodeExecutions,
            query: extractQuery(spans),
            response: extractResponse(spans),
        };
    });
}

function mapSpansToNodes(spans: ApmSpan[]): NodeExecution[] {
    const nodeExecutions: NodeExecution[] = [];

    for (const [nodeId, spanNames] of Object.entries(NODE_TO_SPAN_MAP)) {
        const matchingSpans = spans.filter(s =>
            spanNames.some(name =>
                s.spanName?.toLowerCase().includes(name.toLowerCase()) ||
                s.operationName?.toLowerCase().includes(name.toLowerCase())
            )
        );

        if (matchingSpans.length > 0) {
            const firstSpan = matchingSpans[0];
            const lastSpan = matchingSpans[matchingSpans.length - 1];

            nodeExecutions.push({
                nodeId,
                nodeName: nodeId.charAt(0).toUpperCase() + nodeId.slice(1),
                spanKey: firstSpan.spanKey,
                startTime: firstSpan.timeStarted,
                endTime: lastSpan.timeEnded,
                durationMs: matchingSpans.reduce((sum, s) => sum + s.durationInMs, 0),
                status: matchingSpans.some(s => s.isError) ? 'error' : 'success',
                toolCalls: extractToolCalls(matchingSpans),
            });
        }
    }

    return nodeExecutions.sort((a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
}

function extractToolCalls(spans: ApmSpan[]): ToolCall[] {
    return spans
        .filter(s => s.spanName?.includes('tool') || s.spanName?.includes('mcp'))
        .map(s => ({
            toolName: s.tags?.['tool.name'] || s.operationName || 'unknown',
            durationMs: s.durationInMs,
            status: s.isError ? 'error' : 'success',
        }));
}

function calculateTotalDuration(spans: ApmSpan[]): number {
    if (spans.length === 0) return 0;
    const start = Math.min(...spans.map(s => new Date(s.timeStarted).getTime()));
    const end = Math.max(...spans.map(s => new Date(s.timeEnded).getTime()));
    return end - start;
}

function determineTraceStatus(spans: ApmSpan[]): 'success' | 'error' | 'pending' {
    if (spans.some(s => s.isError)) return 'error';
    return 'success';
}

function extractRoutingType(spans: ApmSpan[]): string {
    const routerSpan = spans.find(s =>
        s.spanName?.includes('router') || s.tags?.['routing.type']
    );
    return routerSpan?.tags?.['routing.type'] || 'WORKFLOW';
}

function extractQuery(spans: ApmSpan[]): string | undefined {
    const inputSpan = spans.find(s => s.spanName?.includes('input'));
    return inputSpan?.tags?.['query'] || inputSpan?.tags?.['user.query'];
}

function extractResponse(spans: ApmSpan[]): string | undefined {
    const outputSpan = spans.find(s => s.spanName?.includes('output'));
    return outputSpan?.tags?.['response']?.substring(0, 200);
}

// Generate mock workflow traces for development/demo
function generateMockWorkflowTraces(count: number): WorkflowTrace[] {
    const routingTypes = ['WORKFLOW', 'AGENT', 'PARALLEL', 'WORKFLOW', 'WORKFLOW', 'AGENT'];
    const queries = [
        'List all compartments in my tenancy',
        'Why is my database slow today?',
        'Show cost summary for November',
        'Check blocking sessions',
        'Analyze database performance and compare with costs',
        'What are the current security alerts?',
    ];

    return Array.from({ length: count }, (_, i) => {
        const routingType = routingTypes[i % routingTypes.length];
        const startTime = new Date(Date.now() - (count - i) * 60000);
        const baseLatency = routingType === 'WORKFLOW' ? 500 : routingType === 'AGENT' ? 3000 : 8000;
        const totalDuration = baseLatency + Math.random() * baseLatency;

        return {
            traceKey: `trace-${Date.now()}-${i}`,
            totalDurationMs: Math.round(totalDuration),
            startTime: startTime.toISOString(),
            endTime: new Date(startTime.getTime() + totalDuration).toISOString(),
            status: Math.random() > 0.9 ? 'error' : 'success',
            routingType,
            query: queries[i % queries.length],
            nodeExecutions: generateMockNodeExecutions(routingType, startTime, totalDuration),
        };
    });
}

function generateMockNodeExecutions(
    routingType: string,
    startTime: Date,
    totalDuration: number
): NodeExecution[] {
    const nodes: NodeExecution[] = [];
    let currentTime = startTime.getTime();

    // Always: input → classifier → router
    const inputDuration = 50 + Math.random() * 100;
    nodes.push({
        nodeId: 'input',
        nodeName: 'Input',
        startTime: new Date(currentTime).toISOString(),
        endTime: new Date(currentTime + inputDuration).toISOString(),
        durationMs: Math.round(inputDuration),
        status: 'success',
        dataIn: 'User query string',
        dataOut: 'Enhanced query with context',
    });
    currentTime += inputDuration;

    const classifierDuration = 100 + Math.random() * 300;
    nodes.push({
        nodeId: 'classifier',
        nodeName: 'Classifier',
        startTime: new Date(currentTime).toISOString(),
        endTime: new Date(currentTime + classifierDuration).toISOString(),
        durationMs: Math.round(classifierDuration),
        status: 'success',
        dataIn: 'Enhanced query',
        dataOut: `Intent: QUERY, Domain: ${routingType === 'WORKFLOW' ? 'infrastructure' : 'database'}`,
    });
    currentTime += classifierDuration;

    const routerDuration = 20 + Math.random() * 30;
    nodes.push({
        nodeId: 'router',
        nodeName: 'Router',
        startTime: new Date(currentTime).toISOString(),
        endTime: new Date(currentTime + routerDuration).toISOString(),
        durationMs: Math.round(routerDuration),
        status: 'success',
        dataIn: 'IntentClassification',
        dataOut: `Route: ${routingType}, Confidence: 0.95`,
    });
    currentTime += routerDuration;

    // Execution path based on routing type
    const remainingTime = totalDuration - (inputDuration + classifierDuration + routerDuration + 50);

    if (routingType === 'WORKFLOW') {
        nodes.push({
            nodeId: 'workflow',
            nodeName: 'Workflow',
            startTime: new Date(currentTime).toISOString(),
            endTime: new Date(currentTime + remainingTime).toISOString(),
            durationMs: Math.round(remainingTime),
            status: 'success',
            dataIn: 'Workflow: list_compartments',
            dataOut: 'Workflow result (formatted)',
            toolCalls: [
                { toolName: 'oci_identity_list_compartments', durationMs: Math.round(remainingTime * 0.8), status: 'success' },
            ],
        });
        currentTime += remainingTime;
    } else if (routingType === 'AGENT') {
        const agentIterations = 2 + Math.floor(Math.random() * 3);
        const perIteration = remainingTime / agentIterations;

        for (let j = 0; j < agentIterations; j++) {
            const agentDuration = perIteration * 0.6;
            nodes.push({
                nodeId: 'agent',
                nodeName: 'Agent',
                startTime: new Date(currentTime).toISOString(),
                endTime: new Date(currentTime + agentDuration).toISOString(),
                durationMs: Math.round(agentDuration),
                status: 'success',
                dataIn: j === 0 ? 'Query + context' : 'Tool results',
                dataOut: j === agentIterations - 1 ? 'Final response' : 'Tool calls',
            });
            currentTime += agentDuration;

            if (j < agentIterations - 1) {
                const actionDuration = perIteration * 0.4;
                nodes.push({
                    nodeId: 'action',
                    nodeName: 'Action',
                    startTime: new Date(currentTime).toISOString(),
                    endTime: new Date(currentTime + actionDuration).toISOString(),
                    durationMs: Math.round(actionDuration),
                    status: 'success',
                    dataIn: 'Tool calls from agent',
                    dataOut: 'Tool results',
                    toolCalls: [
                        { toolName: 'oci_database_execute_sql', durationMs: Math.round(actionDuration * 0.9), status: 'success' },
                    ],
                });
                currentTime += actionDuration;
            }
        }
    } else if (routingType === 'PARALLEL') {
        nodes.push({
            nodeId: 'parallel',
            nodeName: 'Parallel',
            startTime: new Date(currentTime).toISOString(),
            endTime: new Date(currentTime + remainingTime).toISOString(),
            durationMs: Math.round(remainingTime),
            status: 'success',
            dataIn: 'Multi-domain query',
            dataOut: 'Synthesized results from 2 agents',
            toolCalls: [
                { toolName: 'DbTroubleshootAgent', durationMs: Math.round(remainingTime * 0.8), status: 'success' },
                { toolName: 'FinOpsAgent', durationMs: Math.round(remainingTime * 0.7), status: 'success' },
            ],
        });
        currentTime += remainingTime;
    }

    // Always: output
    const outputDuration = 30 + Math.random() * 50;
    nodes.push({
        nodeId: 'output',
        nodeName: 'Output',
        startTime: new Date(currentTime).toISOString(),
        endTime: new Date(currentTime + outputDuration).toISOString(),
        durationMs: Math.round(outputDuration),
        status: 'success',
        dataIn: 'Raw result',
        dataOut: 'Formatted response',
    });

    return nodes;
}
