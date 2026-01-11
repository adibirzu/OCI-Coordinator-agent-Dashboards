import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

interface CPUDataPoint {
    timestamp: string;
    cpu_percent: number;
    db_time_percent: number;
    wait_percent: number;
}

interface TopSQL {
    sql_id: string;
    sql_text: string;
    cpu_seconds: number;
    elapsed_seconds: number;
    executions: number;
    cpu_percent: number;
}

interface WaitEvent {
    event_name: string;
    wait_class: string;
    total_waits: number;
    time_waited_seconds: number;
    avg_wait_ms: number;
    percent_of_total: number;
}

interface AWRSnapshot {
    snap_id: number;
    begin_time: string;
    end_time: string;
    instance_number: number;
}

interface CPUData {
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

function generateMockHistory(): CPUDataPoint[] {
    const points: CPUDataPoint[] = [];
    const now = Date.now();

    for (let i = 23; i >= 0; i--) {
        const timestamp = new Date(now - i * 3600000).toISOString();
        const baseValue = 40 + Math.sin(i / 4) * 20;
        points.push({
            timestamp,
            cpu_percent: Math.round(baseValue + Math.random() * 15),
            db_time_percent: Math.round(baseValue * 0.8 + Math.random() * 10),
            wait_percent: Math.round(baseValue * 0.3 + Math.random() * 8)
        });
    }

    return points;
}

const MOCK_DATA: CPUData = {
    status: 'mock',
    instance_name: 'PRODDB1',
    cpu_count: 16,
    current_cpu_percent: 78,
    avg_cpu_percent: 52,
    history: generateMockHistory(),
    top_sql: [
        {
            sql_id: 'g8h7f6d5c4b3',
            sql_text: 'SELECT /*+ PARALLEL(8) */ * FROM orders o JOIN order_items oi ON...',
            cpu_seconds: 4567.89,
            elapsed_seconds: 8234.56,
            executions: 145,
            cpu_percent: 23.4
        },
        {
            sql_id: 'a1b2c3d4e5f6',
            sql_text: 'UPDATE inventory SET quantity = quantity - :1 WHERE product_id = :2',
            cpu_seconds: 2345.67,
            elapsed_seconds: 3456.78,
            executions: 89234,
            cpu_percent: 12.1
        },
        {
            sql_id: 'x9y8z7w6v5u4',
            sql_text: 'INSERT INTO audit_log (action_id, user_id, timestamp, details) VALUES...',
            cpu_seconds: 1234.56,
            elapsed_seconds: 2345.67,
            executions: 456789,
            cpu_percent: 6.4
        },
        {
            sql_id: 'm4n5o6p7q8r9',
            sql_text: 'SELECT customer_id, SUM(amount) FROM transactions WHERE txn_date BETWEEN...',
            cpu_seconds: 987.65,
            elapsed_seconds: 1876.54,
            executions: 234,
            cpu_percent: 5.1
        },
        {
            sql_id: 's1t2u3v4w5x6',
            sql_text: 'DELETE FROM temp_results WHERE session_id = :1 AND created_date < SYSDATE-1',
            cpu_seconds: 765.43,
            elapsed_seconds: 1234.56,
            executions: 12345,
            cpu_percent: 3.9
        }
    ],
    wait_events: [
        {
            event_name: 'db file sequential read',
            wait_class: 'User I/O',
            total_waits: 1234567,
            time_waited_seconds: 2345.67,
            avg_wait_ms: 1.9,
            percent_of_total: 28.4
        },
        {
            event_name: 'log file sync',
            wait_class: 'Commit',
            total_waits: 234567,
            time_waited_seconds: 1234.56,
            avg_wait_ms: 5.3,
            percent_of_total: 15.0
        },
        {
            event_name: 'gc buffer busy acquire',
            wait_class: 'Cluster',
            total_waits: 345678,
            time_waited_seconds: 987.65,
            avg_wait_ms: 2.9,
            percent_of_total: 12.0
        },
        {
            event_name: 'db file scattered read',
            wait_class: 'User I/O',
            total_waits: 456789,
            time_waited_seconds: 876.54,
            avg_wait_ms: 1.9,
            percent_of_total: 10.6
        },
        {
            event_name: 'direct path read',
            wait_class: 'User I/O',
            total_waits: 567890,
            time_waited_seconds: 654.32,
            avg_wait_ms: 1.2,
            percent_of_total: 7.9
        }
    ],
    awr_snapshots: [
        { snap_id: 100, begin_time: '2024-01-15 10:00:00', end_time: '2024-01-15 11:00:00', instance_number: 1 },
        { snap_id: 101, begin_time: '2024-01-15 11:00:00', end_time: '2024-01-15 12:00:00', instance_number: 1 },
        { snap_id: 102, begin_time: '2024-01-15 12:00:00', end_time: '2024-01-15 13:00:00', instance_number: 1 },
        { snap_id: 103, begin_time: '2024-01-15 13:00:00', end_time: '2024-01-15 14:00:00', instance_number: 1 },
        { snap_id: 104, begin_time: '2024-01-15 14:00:00', end_time: '2024-01-15 15:00:00', instance_number: 1 },
        { snap_id: 105, begin_time: '2024-01-15 15:00:00', end_time: '2024-01-15 16:00:00', instance_number: 1 }
    ]
};

async function safeFetch<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        const data = await safeFetch<CPUData>(
            `${COORDINATOR_URL}/oracle/cpu-analysis`
        );

        if (data) {
            return NextResponse.json({ ...data, status: 'connected' });
        }

        return NextResponse.json(MOCK_DATA);
    } catch {
        return NextResponse.json(MOCK_DATA);
    }
}
