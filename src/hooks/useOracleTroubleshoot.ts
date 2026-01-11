import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from './useSettings';

// ============================================================================
// TYPE DEFINITIONS (matching API route interfaces)
// ============================================================================

export interface DatabaseStatus {
    database_id: string;
    database_name: string;
    status: 'available' | 'stopped' | 'unavailable' | 'warning';
    cpu_percent: number;
    sessions_active: number;
    blocking_count: number;
    last_awr_snap: string;
}

export interface DashboardAlert {
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    message: string;
    database: string;
    timestamp: string;
}

export interface RecentActivity {
    id: string;
    type: 'blocking' | 'cpu' | 'sql' | 'px';
    action: string;
    database: string;
    timestamp: string;
}

export interface DashboardData {
    status: 'connected' | 'mock' | 'error';
    timestamp: string;
    databases: DatabaseStatus[];
    alerts: DashboardAlert[];
    recent_activity: RecentActivity[];
    active_investigations: number;
}

export interface ToolCall {
    id: string;
    timestamp: string;
    tool_name: string;
    status: 'pending' | 'success' | 'error';
    parameters: Record<string, unknown>;
    result?: unknown;
    error?: string;
    duration_ms?: number;
}

export interface TerminalData {
    status: 'connected' | 'mock' | 'error';
    mcp_status: 'connected' | 'disconnected' | 'reconnecting';
    tool_calls: ToolCall[];
    connected_servers: string[];
}

export interface BlockingSession {
    sid: number;
    serial: number;
    username: string;
    program: string;
    machine: string;
    sql_id: string | null;
    wait_event: string;
    seconds_in_wait: number;
    blocking_session: number | null;
    row_wait_obj: string | null;
}

export interface BlockingData {
    status: 'connected' | 'mock' | 'error';
    timestamp: string;
    root_blockers: BlockingSession[];
    blocked_sessions: BlockingSession[];
    total_blocked: number;
    max_wait_time: number;
    tree_depth: number;
}

export interface CPUDataPoint {
    timestamp: string;
    cpu_percent: number;
    db_time_percent: number;
    wait_percent: number;
}

export interface TopSQL {
    sql_id: string;
    sql_text: string;
    cpu_seconds: number;
    elapsed_seconds: number;
    executions: number;
    cpu_percent: number;
}

export interface WaitEvent {
    event_name: string;
    wait_class: string;
    total_waits: number;
    time_waited_seconds: number;
    avg_wait_ms: number;
    percent_of_total: number;
}

export interface AWRSnapshot {
    snap_id: number;
    begin_time: string;
    end_time: string;
    instance_number: number;
}

export interface CPUData {
    status: 'connected' | 'mock' | 'error';
    instance_name: string;
    cpu_count: number;
    current_cpu_percent: number;
    avg_cpu_percent: number;
    history: CPUDataPoint[];
    top_sql: TopSQL[];
    wait_events: WaitEvent[];
    awr_snapshots: AWRSnapshot[];
}

export interface SQLExecution {
    sql_id: string;
    sql_exec_id: number;
    sql_text: string;
    status: 'EXECUTING' | 'DONE' | 'DONE (ERROR)' | 'QUEUED';
    username: string;
    sid: number;
    elapsed_seconds: number;
    cpu_seconds: number;
    io_requests: number;
    buffer_gets: number;
    disk_reads: number;
    px_servers_allocated: number;
    px_servers_requested: number;
    start_time: string;
    last_refresh_time: string;
    progress_percent: number | null;
    sql_plan_hash_value: number;
}

export interface SQLMonData {
    status: 'connected' | 'mock' | 'error';
    timestamp: string;
    active_monitors: number;
    executions: SQLExecution[];
}

export interface PXSession {
    qc_sid: number;
    qc_serial: number;
    sql_id: string;
    username: string;
    requested_dop: number;
    actual_dop: number;
    servers_allocated: number;
    servers_busy: number;
    elapsed_seconds: number;
    status: 'ACTIVE' | 'IDLE' | 'DONE';
}

export interface DOPDowngrade {
    timestamp: string;
    sql_id: string;
    requested_dop: number;
    actual_dop: number;
    reason: string;
    qc_sid: number;
}

export interface PXData {
    status: 'connected' | 'mock' | 'error';
    timestamp: string;
    max_parallel_servers: number;
    servers_in_use: number;
    servers_available: number;
    active_px_sessions: number;
    sessions: PXSession[];
    recent_downgrades: DOPDowngrade[];
    dop_efficiency_percent: number;
}

export interface ArchiveEntry {
    id: string;
    type: 'blocking' | 'awr' | 'sqlmon' | 'px' | 'ash';
    filename: string;
    created_at: string;
    size_bytes: number;
    description: string;
    database: string;
    snap_range?: string;
}

export interface ArchiveData {
    status: 'connected' | 'mock' | 'error';
    entries: ArchiveEntry[];
    total_size_bytes: number;
}

// ============================================================================
// GENERIC FETCH HOOK FACTORY
// ============================================================================

interface UseOracleDataOptions {
    endpoint: string;
    refreshInterval?: number; // ms, defaults to settings.refreshRate
    enabled?: boolean;
}

interface UseOracleDataResult<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    lastUpdated: Date | null;
    isConnected: boolean;
}

function useOracleData<T extends { status: string }>(
    options: UseOracleDataOptions
): UseOracleDataResult<T> {
    const { endpoint, refreshInterval, enabled = true } = options;
    const { settings } = useSettings();

    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(async () => {
        if (!enabled) return;

        // Cancel any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        try {
            setError(null);
            const response = await fetch(endpoint, {
                cache: 'no-store',
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const json = await response.json() as T;
            setData(json);
            setLastUpdated(new Date());
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                setError(err);
            }
        } finally {
            setLoading(false);
        }
    }, [endpoint, enabled]);

    // Initial fetch and polling
    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }

        fetchData();

        const interval = refreshInterval ?? settings.refreshRate;
        const timer = setInterval(fetchData, interval);

        return () => {
            clearInterval(timer);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [fetchData, refreshInterval, settings.refreshRate, enabled]);

    const isConnected = data?.status === 'connected';

    return {
        data,
        loading,
        error,
        refetch: fetchData,
        lastUpdated,
        isConnected,
    };
}

// ============================================================================
// SPECIALIZED HOOKS FOR EACH VIEW
// ============================================================================

/**
 * Hook for Dashboard data - database overview, alerts, recent activity
 */
export function useDashboard(enabled = true) {
    return useOracleData<DashboardData>({
        endpoint: '/api/troubleshoot/oracle/dashboard',
        enabled,
    });
}

/**
 * Hook for Agent Terminal - MCP tool call logs
 */
export function useTerminal(enabled = true) {
    return useOracleData<TerminalData>({
        endpoint: '/api/troubleshoot/oracle/terminal',
        refreshInterval: 2000, // Faster updates for terminal
        enabled,
    });
}

/**
 * Hook for Blocking Tree analysis
 */
export function useBlockingTree(enabled = true) {
    return useOracleData<BlockingData>({
        endpoint: '/api/troubleshoot/oracle/blocking',
        refreshInterval: 3000, // Blocking situations need quick updates
        enabled,
    });
}

/**
 * Hook for CPU/AWR analysis
 */
export function useCPUAnalysis(enabled = true) {
    return useOracleData<CPUData>({
        endpoint: '/api/troubleshoot/oracle/cpu',
        enabled,
    });
}

/**
 * Hook for SQL Monitor data
 */
export function useSQLMonitor(enabled = true) {
    return useOracleData<SQLMonData>({
        endpoint: '/api/troubleshoot/oracle/sqlmon',
        refreshInterval: 3000, // SQL executions can change quickly
        enabled,
    });
}

/**
 * Hook for Parallel Execution monitoring
 */
export function useParallelExec(enabled = true) {
    return useOracleData<PXData>({
        endpoint: '/api/troubleshoot/oracle/px',
        enabled,
    });
}

/**
 * Hook for Diagnostic Archive
 */
export function useArchive(enabled = true) {
    return useOracleData<ArchiveData>({
        endpoint: '/api/troubleshoot/oracle/archive',
        refreshInterval: 30000, // Archive updates less frequently
        enabled,
    });
}

// ============================================================================
// COMBINED HOOK FOR MULTI-VIEW STATE
// ============================================================================

export type OracleView = 'dashboard' | 'blocking' | 'cpu' | 'sqlmon' | 'px' | 'archive';

interface UseOracleTroubleshootOptions {
    activeView: OracleView;
}

/**
 * Combined hook that only fetches data for the active view
 * This optimizes API calls by disabling polling for inactive views
 */
export function useOracleTroubleshoot({ activeView }: UseOracleTroubleshootOptions) {
    const dashboard = useDashboard(activeView === 'dashboard');
    const blocking = useBlockingTree(activeView === 'blocking');
    const cpu = useCPUAnalysis(activeView === 'cpu');
    const sqlmon = useSQLMonitor(activeView === 'sqlmon');
    const px = useParallelExec(activeView === 'px');
    const archive = useArchive(activeView === 'archive');

    // Terminal is always active for the log panel
    const terminal = useTerminal(true);

    return {
        dashboard,
        blocking,
        cpu,
        sqlmon,
        px,
        archive,
        terminal,
        activeView,
    };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Hook to track overall connection status across all endpoints
 */
export function useConnectionStatus() {
    const [status, setStatus] = useState<'connected' | 'partial' | 'disconnected'>('disconnected');
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const response = await fetch('/api/troubleshoot/oracle/dashboard', {
                    cache: 'no-store',
                });

                if (response.ok) {
                    const data = await response.json();
                    setStatus(data.status === 'connected' ? 'connected' : 'partial');
                } else {
                    setStatus('disconnected');
                }
            } catch {
                setStatus('disconnected');
            } finally {
                setChecking(false);
            }
        };

        checkStatus();
        const timer = setInterval(checkStatus, 30000);

        return () => clearInterval(timer);
    }, []);

    return { status, checking };
}

/**
 * Hook to format time durations for display
 */
export function useTimeFormatter() {
    const formatDuration = useCallback((seconds: number): string => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    }, []);

    const formatBytes = useCallback((bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }, []);

    const formatRelativeTime = useCallback((timestamp: string): string => {
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now.getTime() - then.getTime();
        const diffSecs = Math.floor(diffMs / 1000);

        if (diffSecs < 60) return 'just now';
        if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
        if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
        return `${Math.floor(diffSecs / 86400)}d ago`;
    }, []);

    return { formatDuration, formatBytes, formatRelativeTime };
}
