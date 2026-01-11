import { NextRequest, NextResponse } from 'next/server';
import { sendChatMessage, OracleCommands } from '@/services/coordinatorChat';

interface AwrSnapshot {
    snap_id: number;
    end_time: string;
    db_time: number;
    cpu_time: number;
    wait_time: number;
}

interface TopEvent {
    event: string;
    waits: number;
    time_waited_secs: number;
    pct_db_time: number;
    wait_class: string;
}

interface LoadProfile {
    db_time_per_sec: number;
    cpu_per_sec: number;
    redo_per_sec: number;
    logical_reads_per_sec: number;
}

interface ResourceManager {
    throttle_pct: number;
    consumer_group: string;
    cpu_limit: number;
}

interface AwrData {
    snapshots: AwrSnapshot[];
    topEvents: TopEvent[];
    loadProfile: LoadProfile;
    resourceManager: ResourceManager;
    status: 'connected' | 'mock' | 'error';
    database?: string;
}

/**
 * Parse coordinator response for wait events into TopEvent format
 */
function parseWaitEvents(data: unknown): TopEvent[] {
    try {
        const response = data as Record<string, unknown>;

        // Handle various response formats
        const events = (response.wait_events || response.events || response.top_events || []) as Array<Record<string, unknown>>;

        return events.slice(0, 10).map(event => ({
            event: String(event.event || event.event_name || event.EVENT || 'Unknown'),
            waits: Number(event.waits || event.total_waits || event.WAITS || 0),
            time_waited_secs: Number(event.time_waited_secs || event.time_waited_seconds || event.TIME_WAITED || 0),
            pct_db_time: Number(event.pct_db_time || event.percent_of_total || event.PCT_DB_TIME || 0),
            wait_class: String(event.wait_class || event.WAIT_CLASS || 'Other')
        }));
    } catch {
        return [];
    }
}

/**
 * Parse coordinator response for AWR snapshots
 */
function parseAwrSnapshots(data: unknown): AwrSnapshot[] {
    try {
        const response = data as Record<string, unknown>;

        const snapshots = (response.snapshots || response.awr_snapshots || []) as Array<Record<string, unknown>>;

        return snapshots.map(snap => ({
            snap_id: Number(snap.snap_id || snap.SNAP_ID || 0),
            end_time: String(snap.end_time || snap.END_TIME || ''),
            db_time: Number(snap.db_time || snap.DB_TIME || 0),
            cpu_time: Number(snap.cpu_time || snap.CPU_TIME || 0),
            wait_time: Number(snap.wait_time || snap.WAIT_TIME || 0)
        }));
    } catch {
        return [];
    }
}

/**
 * Parse load profile from coordinator response
 */
function parseLoadProfile(data: unknown): LoadProfile | null {
    try {
        const response = data as Record<string, unknown>;
        const profile = (response.load_profile || response.loadProfile || response) as Record<string, unknown>;

        if (profile.db_time_per_sec !== undefined || profile.cpu_per_sec !== undefined) {
            return {
                db_time_per_sec: Number(profile.db_time_per_sec || profile.DB_TIME_PER_SEC || 0),
                cpu_per_sec: Number(profile.cpu_per_sec || profile.CPU_PER_SEC || 0),
                redo_per_sec: Number(profile.redo_per_sec || profile.REDO_PER_SEC || 0),
                logical_reads_per_sec: Number(profile.logical_reads_per_sec || profile.LOGICAL_READS_PER_SEC || 0)
            };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Parse resource manager info
 */
function parseResourceManager(data: unknown): ResourceManager | null {
    try {
        const response = data as Record<string, unknown>;
        const rm = (response.resource_manager || response.resourceManager || {}) as Record<string, unknown>;

        if (rm.throttle_pct !== undefined || rm.consumer_group !== undefined) {
            return {
                throttle_pct: Number(rm.throttle_pct || rm.THROTTLE_PCT || 0),
                consumer_group: String(rm.consumer_group || rm.CONSUMER_GROUP || ''),
                cpu_limit: Number(rm.cpu_limit || rm.CPU_LIMIT || 100)
            };
        }
        return null;
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const database = searchParams.get('database') || 'ATPAdi';

    try {
        // Fetch wait events from coordinator
        const waitEventsCommand = OracleCommands.showWaitEvents(database);
        const waitResponse = await sendChatMessage(waitEventsCommand, { timeout: 15000 });

        // Fetch top SQL by CPU for additional context
        const topSqlCommand = OracleCommands.topSQLByCPU(database);
        const topSqlResponse = await sendChatMessage(topSqlCommand, { timeout: 15000 });

        // Build response from coordinator data
        let topEvents: TopEvent[] = [];
        let snapshots: AwrSnapshot[] = [];
        let loadProfile: LoadProfile = { db_time_per_sec: 0, cpu_per_sec: 0, redo_per_sec: 0, logical_reads_per_sec: 0 };
        let resourceManager: ResourceManager = { throttle_pct: 0, consumer_group: '', cpu_limit: 100 };

        if (waitResponse.success && waitResponse.data) {
            topEvents = parseWaitEvents(waitResponse.data);
            const parsedSnapshots = parseAwrSnapshots(waitResponse.data);
            if (parsedSnapshots.length > 0) {
                snapshots = parsedSnapshots;
            }
            const parsedProfile = parseLoadProfile(waitResponse.data);
            if (parsedProfile) {
                loadProfile = parsedProfile;
            }
            const parsedRm = parseResourceManager(waitResponse.data);
            if (parsedRm) {
                resourceManager = parsedRm;
            }
        }

        // If we got any real data, return it
        if (topEvents.length > 0 || snapshots.length > 0) {
            return NextResponse.json({
                snapshots,
                topEvents,
                loadProfile,
                resourceManager,
                status: 'connected',
                database
            });
        }

        // Check if coordinator returned a message (might indicate no data, not error)
        if (waitResponse.error && !waitResponse.error.includes('ECONNREFUSED')) {
            return NextResponse.json({
                snapshots: [],
                topEvents: [],
                loadProfile,
                resourceManager,
                status: 'connected',
                database,
                message: waitResponse.error
            });
        }

        // Return error status when coordinator is unreachable
        return NextResponse.json({
            snapshots: [],
            topEvents: [],
            loadProfile: { db_time_per_sec: 0, cpu_per_sec: 0, redo_per_sec: 0, logical_reads_per_sec: 0 },
            resourceManager: { throttle_pct: 0, consumer_group: '', cpu_limit: 100 },
            status: 'error',
            database,
            error: 'Coordinator unavailable',
        });
    } catch (error) {
        // Return error status on any error
        return NextResponse.json({
            snapshots: [],
            topEvents: [],
            loadProfile: { db_time_per_sec: 0, cpu_per_sec: 0, redo_per_sec: 0, logical_reads_per_sec: 0 },
            resourceManager: { throttle_pct: 0, consumer_group: '', cpu_limit: 100 },
            status: 'error',
            database,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
