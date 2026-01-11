import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

interface ArchiveEntry {
    id: string;
    type: 'blocking' | 'awr' | 'sqlmon' | 'px' | 'ash';
    filename: string;
    created_at: string;
    size_bytes: number;
    description: string;
    database: string;
    snap_range?: string;
}

interface ArchiveData {
    status: 'connected' | 'mock' | 'error';
    entries: ArchiveEntry[];
    total_size_bytes: number;
    error?: string;
}

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
        const data = await safeFetch<ArchiveData>(
            `${COORDINATOR_URL}/oracle/archive`
        );

        if (data) {
            return NextResponse.json({ ...data, status: 'connected' });
        }

        // Return error status when coordinator is unreachable
        return NextResponse.json({
            status: 'error',
            entries: [],
            total_size_bytes: 0,
            error: 'Coordinator unavailable',
        });
    } catch (error) {
        // Return error status on any error
        return NextResponse.json({
            status: 'error',
            entries: [],
            total_size_bytes: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
