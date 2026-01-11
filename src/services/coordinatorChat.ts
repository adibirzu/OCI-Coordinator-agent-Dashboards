/**
 * Coordinator Chat Service
 *
 * Wraps calls to the OCI Coordinator's chat endpoint (port 3001)
 * for sending natural language commands to MCP agents.
 */

const CHAT_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';
const STATUS_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

export interface ChatResponse {
    success: boolean;
    message?: string;
    data?: unknown;
    error?: string;
    tool_calls?: ToolCall[];
}

export interface ToolCall {
    id: string;
    tool_name: string;
    parameters: Record<string, unknown>;
    result?: unknown;
    status: 'pending' | 'success' | 'error';
    duration_ms?: number;
    error_message?: string;
    timestamp: string;
}

export interface StreamChunk {
    type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
    content?: string;
    tool_call?: ToolCall;
    error?: string;
}

/**
 * Send a chat message to the coordinator and get a response
 */
export async function sendChatMessage(
    message: string,
    options: { timeout?: number; stream?: boolean } = {}
): Promise<ChatResponse> {
    const { timeout = 30000, stream = false } = options;

    try {
        const endpoint = stream ? `${CHAT_URL}/chat/stream` : `${CHAT_URL}/chat`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
            signal: controller.signal,
            cache: 'no-store',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return {
                success: false,
                error: `Coordinator returned ${response.status}: ${response.statusText}`,
            };
        }

        const data = await response.json();

        return {
            success: true,
            message: data.response || data.message,
            data: data.data || data.result || data,
            tool_calls: data.tool_calls,
        };
    } catch (error) {
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                return { success: false, error: 'Request timeout' };
            }
            return { success: false, error: error.message };
        }
        return { success: false, error: 'Unknown error occurred' };
    }
}

/**
 * Stream chat response with tool call updates
 */
export async function* streamChatMessage(
    message: string,
    options: { timeout?: number } = {}
): AsyncGenerator<StreamChunk> {
    const { timeout = 60000 } = options;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${CHAT_URL}/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            yield { type: 'error', error: `Coordinator returned ${response.status}` };
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            yield { type: 'error', error: 'No response body' };
            return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        yield data as StreamChunk;
                    } catch {
                        // Skip invalid JSON
                    }
                }
            }
        }

        yield { type: 'done' };
    } catch (error) {
        if (error instanceof Error) {
            yield { type: 'error', error: error.message };
        } else {
            yield { type: 'error', error: 'Unknown error' };
        }
    }
}

/**
 * Get coordinator status including MCP server connections
 */
export async function getCoordinatorStatus(): Promise<{
    status: 'running' | 'offline' | 'error';
    mcp_servers: Record<string, boolean>;
    tools_count: number;
}> {
    try {
        const [statusRes, toolsRes] = await Promise.all([
            fetch(`${STATUS_URL}/status`, { cache: 'no-store', signal: AbortSignal.timeout(5000) }),
            fetch(`${STATUS_URL}/tools?limit=100`, { cache: 'no-store', signal: AbortSignal.timeout(5000) }),
        ]);

        const statusData = statusRes.ok ? await statusRes.json() : null;
        const toolsData = toolsRes.ok ? await toolsRes.json() : null;

        if (!statusData) {
            return { status: 'offline', mcp_servers: {}, tools_count: 0 };
        }

        // Extract MCP server status from tools or status
        const mcp_servers: Record<string, boolean> = {};

        if (toolsData?.tools) {
            const servers = new Set<string>();
            for (const tool of toolsData.tools) {
                if (tool.server) servers.add(tool.server);
            }
            servers.forEach(server => mcp_servers[server] = true);
        }

        return {
            status: 'running',
            mcp_servers,
            tools_count: toolsData?.tools?.length || 0,
        };
    } catch {
        return { status: 'offline', mcp_servers: {}, tools_count: 0 };
    }
}

/**
 * Get recent tool calls from the coordinator (for the terminal view)
 */
export async function getRecentToolCalls(limit: number = 50): Promise<ToolCall[]> {
    try {
        const response = await fetch(`${STATUS_URL}/tool-calls?limit=${limit}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return data.calls || data.tool_calls || [];
    } catch {
        return [];
    }
}

// Predefined commands for Oracle troubleshooting workflows
export const OracleCommands = {
    // Database Discovery
    listDatabases: () => 'list databases',

    // Blocking Analysis
    checkBlocking: (database: string) => `check blocking sessions on ${database}`,

    // Performance Analysis
    checkHealth: (database: string) => `check database health for ${database}`,
    showWaitEvents: (database: string) => `show wait events for ${database}`,
    showRunningSQL: (database: string) => `show running SQL on ${database}`,
    showLongRunningOps: (database: string) => `show long running operations on ${database}`,
    checkParallelism: (database: string) => `check parallelism for ${database}`,
    findFullTableScans: (database: string) => `find full table scans on ${database}`,

    // AWR/CPU Analysis
    generateAWR: (database: string, period: string = 'last hour') =>
        `generate AWR report for ${database} ${period}`,
    topSQLByCPU: (database: string) => `show top SQL by CPU on ${database}`,

    // Cost Analysis
    costSummary: () => 'show cost summary',
    costByService: () => 'show costs by service',
    databaseCosts: () => 'show database costs',

    // Security
    securityOverview: () => 'show security overview',
    cloudGuardProblems: () => 'list Cloud Guard problems',

    // Logs
    logSummary: (hours: number = 24) => `show log summary last ${hours} hours`,
    searchErrors: () => 'search logs for errors',
    activeAlarms: () => 'list active alarms',
};
