/**
 * Mock OCI Service wrapper
 * "Black Box" that simulates OCI API calls.
 * In production, this would use the OCI Node.js SDK.
 */

export interface LogEntry {
    id: string;
    timestamp: string;
    source: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
}

export interface MetricPoint {
    timestamp: number;
    value: number;
}

export interface CoordinatorStatus {
    isRunning: boolean;
    agents: any[];
    mcps: any[];
    lastUpdated: string;
}

class OCIServiceMock {
    private static instance: OCIServiceMock;

    private constructor() { }

    public static getInstance(): OCIServiceMock {
        if (!OCIServiceMock.instance) {
            OCIServiceMock.instance = new OCIServiceMock();
        }
        return OCIServiceMock.instance;
    }

    // Simulate caching logs
    private logs: LogEntry[] = [];

    /**
     * Fetch real coordinator status
     */
    async getCoordinatorStatus(): Promise<CoordinatorStatus> {
        try {
            // Use Next.js proxy
            const res = await fetch('/api/status');
            if (!res.ok) throw new Error('Failed to fetch status');
            return await res.json();
        } catch (e) {
            console.error(e);
            return {
                isRunning: false,
                agents: [],
                mcps: [],
                lastUpdated: new Date().toISOString()
            };
        }
    }

    /**
     * Fetch recent logs from "OCI Logging"
     */
    async getLogs(limit: number = 50): Promise<LogEntry[]> {
        try {
            // Use Next.js proxy
            const res = await fetch(`/api/logs?limit=${limit}`);
            if (!res.ok) throw new Error('Failed to fetch logs');

            const data = await res.json();
            const logs = data.logs || [];

            if (logs.length === 0) {
                return this.getSystemLog("No logs found in coordinator.");
            }

            return logs.map((l: any) => ({
                id: Math.random().toString(36), // Coordinate logs don't have IDs yet
                timestamp: l.timestamp || new Date().toISOString(),
                source: l.source || 'coordinator',
                level: (l.level || 'INFO') as 'INFO' | 'WARN' | 'ERROR',
                message: l.message || l.raw || ''
            }));
        } catch (e) {
            console.warn('Failed to fetch OCI logs:', e);
            // Fallback to minimal system log
            return this.getSystemLog("Connection to coordinator logs failed.");
        }
    }

    private getSystemLog(msg: string): LogEntry[] {
        return [{
            id: 'sys-info',
            timestamp: new Date().toISOString(),
            source: 'System',
            level: 'INFO',
            message: msg
        }];
    }

    private generateMockLogs(limit: number): LogEntry[] {
        return this.getSystemLog("Mock data disabled.");
    }

    /**
     * Fetch generic metric for APM graph
     */
    async getMetric(namespace: string, name: string): Promise<MetricPoint[]> {
        try {
            const res = await fetch('/api/oci/apm');
            const data = await res.json();

            if (data.status === 'pending_config' || data.error) {
                return [];
            }

            // Transform real OCI metrics if available
            return [];
        } catch (e) {
            return [];
        }
    }

    private generateMockMetrics(): MetricPoint[] {
        return [];
    }
}

export const ociService = OCIServiceMock.getInstance();
