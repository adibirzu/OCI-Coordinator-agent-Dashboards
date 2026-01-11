'use client';

import React, { useState, useMemo } from 'react';
import styles from './MetricBrowser.module.css';

interface AvailableMetric {
    id: string;
    name: string;
    namespace: string;
    description?: string;
}

interface MetricBrowserProps {
    metrics: AvailableMetric[];
    selectedMetric: string;
    onSelect: (metricId: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

// Format namespace for display (e.g., "oci_computeagent" -> "Compute Agent")
function formatNamespace(ns: string): string {
    return ns
        .replace('oci_', '')
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Get namespace icon
function getNamespaceIcon(ns: string): string {
    if (ns.includes('compute')) return '🖥️';
    if (ns.includes('database') || ns.includes('autonomous')) return '🗄️';
    if (ns.includes('faas') || ns.includes('function')) return '⚡';
    if (ns.includes('network') || ns.includes('vcn')) return '🌐';
    if (ns.includes('storage') || ns.includes('block')) return '💾';
    if (ns.includes('container') || ns.includes('oke')) return '📦';
    return '📊';
}

// Get metric description based on metric type
function getMetricDescription(metricId: string): string {
    const descriptions: Record<string, string> = {
        'cpu': 'CPU utilization percentage across all cores',
        'memory': 'Memory utilization percentage of allocated RAM',
        'network_in': 'Total bytes received on all network interfaces',
        'network_out': 'Total bytes sent on all network interfaces',
        'disk_read': 'Total bytes read from all block storage devices',
        'disk_write': 'Total bytes written to all block storage devices',
        'autonomous_db_cpu': 'CPU utilization of Autonomous Database OCPUs',
        'autonomous_db_storage': 'Storage utilization as percentage of allocated space',
        'functions_invocations': 'Number of function invocations per period',
        'functions_duration': 'Average function execution time in milliseconds'
    };
    return descriptions[metricId] || 'OCI monitoring metric';
}

export function MetricBrowser({
    metrics,
    selectedMetric,
    onSelect,
    isOpen,
    onClose
}: MetricBrowserProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedNamespace, setExpandedNamespace] = useState<string | null>(null);

    // Group metrics by namespace
    const groupedMetrics = useMemo(() => {
        return metrics.reduce((acc, m) => {
            const ns = m.namespace || 'other';
            if (!acc[ns]) acc[ns] = [];
            acc[ns].push({
                ...m,
                description: m.description || getMetricDescription(m.id)
            });
            return acc;
        }, {} as Record<string, AvailableMetric[]>);
    }, [metrics]);

    // Filter metrics based on search
    const filteredMetrics = useMemo(() => {
        if (!searchQuery.trim()) return groupedMetrics;

        const query = searchQuery.toLowerCase();
        const filtered: Record<string, AvailableMetric[]> = {};

        for (const [ns, metrics] of Object.entries(groupedMetrics)) {
            const matchingMetrics = metrics.filter(m =>
                m.name.toLowerCase().includes(query) ||
                m.id.toLowerCase().includes(query) ||
                ns.toLowerCase().includes(query) ||
                (m.description && m.description.toLowerCase().includes(query))
            );
            if (matchingMetrics.length > 0) {
                filtered[ns] = matchingMetrics;
            }
        }
        return filtered;
    }, [groupedMetrics, searchQuery]);

    const totalMetrics = Object.values(filteredMetrics).flat().length;
    const namespaceCount = Object.keys(filteredMetrics).length;

    if (!isOpen) return null;

    const handleSelect = (metricId: string) => {
        onSelect(metricId);
        onClose();
    };

    const toggleNamespace = (ns: string) => {
        setExpandedNamespace(expandedNamespace === ns ? null : ns);
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.browser} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <span className={styles.headerIcon}>📊</span>
                        <h3 className={styles.headerTitle}>OCI Metrics Browser</h3>
                    </div>
                    <button className={styles.closeButton} onClick={onClose}>
                        ×
                    </button>
                </div>

                <div className={styles.searchSection}>
                    <div className={styles.searchBox}>
                        <span className={styles.searchIcon}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search metrics..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className={styles.searchInput}
                            autoFocus
                        />
                        {searchQuery && (
                            <button
                                className={styles.clearButton}
                                onClick={() => setSearchQuery('')}
                            >
                                ×
                            </button>
                        )}
                    </div>
                    <div className={styles.searchStats}>
                        {totalMetrics} metric{totalMetrics !== 1 ? 's' : ''} in {namespaceCount} namespace{namespaceCount !== 1 ? 's' : ''}
                    </div>
                </div>

                <div className={styles.namespaceList}>
                    {Object.entries(filteredMetrics).map(([ns, metrics]) => (
                        <div key={ns} className={styles.namespaceGroup}>
                            <button
                                className={`${styles.namespaceHeader} ${expandedNamespace === ns ? styles.expanded : ''}`}
                                onClick={() => toggleNamespace(ns)}
                            >
                                <span className={styles.namespaceIcon}>
                                    {getNamespaceIcon(ns)}
                                </span>
                                <span className={styles.namespaceName}>
                                    {formatNamespace(ns)}
                                </span>
                                <span className={styles.metricCount}>
                                    {metrics.length}
                                </span>
                                <span className={styles.expandIcon}>
                                    {expandedNamespace === ns ? '▼' : '▶'}
                                </span>
                            </button>

                            {expandedNamespace === ns && (
                                <div className={styles.metricList}>
                                    {metrics.map(m => (
                                        <button
                                            key={m.id}
                                            className={`${styles.metricItem} ${selectedMetric === m.id ? styles.selected : ''}`}
                                            onClick={() => handleSelect(m.id)}
                                        >
                                            <div className={styles.metricMain}>
                                                <span className={styles.metricName}>{m.name}</span>
                                                {selectedMetric === m.id && (
                                                    <span className={styles.selectedBadge}>Current</span>
                                                )}
                                            </div>
                                            <span className={styles.metricDescription}>
                                                {m.description}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {Object.keys(filteredMetrics).length === 0 && (
                        <div className={styles.emptyState}>
                            <span className={styles.emptyIcon}>🔍</span>
                            <span className={styles.emptyText}>
                                No metrics found matching "{searchQuery}"
                            </span>
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <span className={styles.footerHint}>
                        Click a namespace to expand, then select a metric
                    </span>
                </div>
            </div>
        </div>
    );
}

// Quick selector dropdown (smaller version)
interface QuickMetricSelectorProps {
    metrics: AvailableMetric[];
    selectedMetric: string;
    onSelect: (metricId: string) => void;
    onBrowseClick: () => void;
}

export function QuickMetricSelector({
    metrics,
    selectedMetric,
    onSelect,
    onBrowseClick
}: QuickMetricSelectorProps) {
    // Group metrics by namespace for better organization
    const groupedMetrics = useMemo(() => {
        return metrics.reduce((acc, m) => {
            const ns = m.namespace || 'other';
            if (!acc[ns]) acc[ns] = [];
            acc[ns].push(m);
            return acc;
        }, {} as Record<string, AvailableMetric[]>);
    }, [metrics]);

    return (
        <div className={styles.quickSelector}>
            <select
                value={selectedMetric}
                onChange={(e) => onSelect(e.target.value)}
                className={styles.quickSelect}
            >
                {Object.entries(groupedMetrics).map(([ns, ms]) => (
                    <optgroup key={ns} label={formatNamespace(ns)}>
                        {ms.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </optgroup>
                ))}
            </select>
            <span className={styles.selectArrow}>▼</span>
            <button
                className={styles.browseButton}
                onClick={onBrowseClick}
                title="Browse all metrics"
            >
                ⋯
            </button>
        </div>
    );
}
