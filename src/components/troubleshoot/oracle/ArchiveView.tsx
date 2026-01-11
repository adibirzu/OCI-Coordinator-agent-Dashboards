'use client';

import React, { useState, useEffect } from 'react';
import styles from './ArchiveView.module.css';

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
    entries: ArchiveEntry[];
    status: 'loading' | 'connected' | 'mock' | 'error';
    total_size_bytes: number;
}

interface ArchiveViewProps {
    database: string;
}

export function ArchiveView({ database }: ArchiveViewProps) {
    const [data, setData] = useState<ArchiveData>({
        entries: [],
        status: 'loading',
        total_size_bytes: 0
    });
    const [filter, setFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [selectedEntry, setSelectedEntry] = useState<ArchiveEntry | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/troubleshoot/oracle/archive?database=${encodeURIComponent(database)}`);
                const result = await res.json();
                // Preserve the status from the API (connected, error, etc.)
                setData(result);
            } catch {
                setData({
                    entries: [],
                    status: 'error',
                    total_size_bytes: 0
                });
            }
        };

        fetchData();
    }, [database]);

    const typeLabels: Record<string, string> = {
        'blocking': 'Blocking Tree',
        'awr': 'AWR Report',
        'sqlmon': 'SQL Monitor',
        'px': 'Parallel Exec',
        'ash': 'ASH Report'
    };

    const typeIcons: Record<string, string> = {
        'blocking': '🔒',
        'awr': '📊',
        'sqlmon': '🔍',
        'px': '⚡',
        'ash': '📈'
    };

    const filteredEntries = data.entries.filter(entry => {
        const matchesFilter = filter === 'all' || entry.type === filter;
        const matchesSearch = searchTerm === '' ||
            entry.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.database.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const groupedByDate = filteredEntries.reduce((acc, entry) => {
        const date = entry.created_at.split(' ')[0];
        if (!acc[date]) acc[date] = [];
        acc[date].push(entry);
        return acc;
    }, {} as Record<string, ArchiveEntry[]>);

    return (
        <div className={styles.container}>
            {/* Status Bar */}
            <div className={styles.statusBar}>
                <span className={`${styles.statusDot} ${styles[data.status]}`} />
                <span className={styles.statusText}>
                    {data.status === 'loading' && 'Loading archives...'}
                    {data.status === 'connected' && 'Connected to Archive Store'}
                    {data.status === 'mock' && 'Demo Mode - Showing sample archives'}
                    {data.status === 'error' && 'Connection error'}
                </span>
                <span className={styles.archiveStats}>
                    {data.entries.length} files • {formatBytes(data.total_size_bytes)}
                </span>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <span className={styles.searchIcon}>🔍</span>
                    <input
                        type="text"
                        placeholder="Search archives..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
                <div className={styles.filterGroup}>
                    <button
                        className={`${styles.filterBtn} ${filter === 'all' ? styles.active : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All
                    </button>
                    {Object.keys(typeLabels).map(type => (
                        <button
                            key={type}
                            className={`${styles.filterBtn} ${filter === type ? styles.active : ''}`}
                            onClick={() => setFilter(type)}
                        >
                            {typeIcons[type]} {typeLabels[type]}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.content}>
                {/* Archive List */}
                <div className={styles.archiveList}>
                    {Object.entries(groupedByDate)
                        .sort(([a], [b]) => b.localeCompare(a))
                        .map(([date, entries]) => (
                            <div key={date} className={styles.dateGroup}>
                                <div className={styles.dateHeader}>{formatDate(date)}</div>
                                <div className={styles.entriesList}>
                                    {entries.map(entry => (
                                        <div
                                            key={entry.id}
                                            className={`${styles.entryCard} ${selectedEntry?.id === entry.id ? styles.selected : ''}`}
                                            onClick={() => setSelectedEntry(entry)}
                                        >
                                            <div className={styles.entryIcon}>{typeIcons[entry.type]}</div>
                                            <div className={styles.entryInfo}>
                                                <div className={styles.entryFilename}>{entry.filename}</div>
                                                <div className={styles.entryMeta}>
                                                    <span className={styles.typeBadge} data-type={entry.type}>
                                                        {typeLabels[entry.type]}
                                                    </span>
                                                    <span>{entry.database}</span>
                                                    <span>{formatBytes(entry.size_bytes)}</span>
                                                </div>
                                            </div>
                                            <div className={styles.entryTime}>
                                                {entry.created_at.split(' ')[1]}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    {filteredEntries.length === 0 && (
                        <div className={styles.emptyState}>
                            <span className={styles.emptyIcon}>📁</span>
                            <p>No archives found</p>
                            <span className={styles.emptyHint}>
                                {searchTerm ? 'Try adjusting your search' : 'Archives will appear here when captured'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Detail Panel */}
                {selectedEntry && (
                    <div className={styles.detailPanel}>
                        <div className={styles.detailHeader}>
                            <div className={styles.detailIcon}>{typeIcons[selectedEntry.type]}</div>
                            <div>
                                <h3>{selectedEntry.filename}</h3>
                                <span className={styles.detailType}>{typeLabels[selectedEntry.type]}</span>
                            </div>
                            <button className={styles.closeBtn} onClick={() => setSelectedEntry(null)}>×</button>
                        </div>
                        <div className={styles.detailContent}>
                            <div className={styles.detailRow}>
                                <span className={styles.label}>Database:</span>
                                <span className={styles.value}>{selectedEntry.database}</span>
                            </div>
                            <div className={styles.detailRow}>
                                <span className={styles.label}>Created:</span>
                                <span className={styles.value}>{selectedEntry.created_at}</span>
                            </div>
                            <div className={styles.detailRow}>
                                <span className={styles.label}>Size:</span>
                                <span className={styles.value}>{formatBytes(selectedEntry.size_bytes)}</span>
                            </div>
                            {selectedEntry.snap_range && (
                                <div className={styles.detailRow}>
                                    <span className={styles.label}>Snap Range:</span>
                                    <span className={styles.valueMono}>{selectedEntry.snap_range}</span>
                                </div>
                            )}
                            <div className={styles.description}>
                                <span className={styles.label}>Description:</span>
                                <p>{selectedEntry.description}</p>
                            </div>
                            <div className={styles.actions}>
                                <button className={styles.actionBtn}>
                                    <span>📥</span> Download
                                </button>
                                <button className={styles.actionBtn}>
                                    <span>👁️</span> View
                                </button>
                                <button className={`${styles.actionBtn} ${styles.danger}`}>
                                    <span>🗑️</span> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
        return 'Today';
    }
    if (dateStr === yesterday.toISOString().split('T')[0]) {
        return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
