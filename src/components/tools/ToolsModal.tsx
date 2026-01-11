'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import styles from './ToolsModal.module.css';

interface Tool {
    name: string;
    mcp_server: string;
    category?: string;
    description?: string;
}

interface ToolsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialServer?: string;
}

// Icon mapping for MCP servers
const SERVER_ICONS: Record<string, string> = {
    'finopsai': '💰',
    'database-observatory': '🗄️',
    'oci-logan': '📋',
    'oci-security': '🛡️',
    'mcp-oci': '☁️',
    'default': '🔧',
};

export function ToolsModal({ isOpen, onClose, initialServer }: ToolsModalProps) {
    const [tools, setTools] = useState<Tool[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedServer, setSelectedServer] = useState<string | null>(initialServer || null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchTools = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/tools');
            if (res.ok) {
                const data = await res.json();
                setTools(data.tools || []);
            }
        } catch (e) {
            console.error('Failed to fetch tools:', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchTools();
        }
    }, [isOpen, fetchTools]);

    // Group tools by MCP server
    const groupedTools = useMemo(() => {
        const groups: Record<string, Tool[]> = {};
        tools.forEach(tool => {
            const server = tool.mcp_server || 'unknown';
            if (!groups[server]) groups[server] = [];
            groups[server].push(tool);
        });
        return groups;
    }, [tools]);

    // Get unique servers
    const servers = useMemo(() => Object.keys(groupedTools).sort(), [groupedTools]);

    // Filter tools based on search and selected server
    const filteredTools = useMemo(() => {
        let filtered = tools;

        if (selectedServer) {
            filtered = filtered.filter(t => t.mcp_server === selectedServer);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(query) ||
                t.description?.toLowerCase().includes(query) ||
                t.category?.toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [tools, selectedServer, searchQuery]);

    // Group filtered tools
    const filteredGroupedTools = useMemo(() => {
        const groups: Record<string, Tool[]> = {};
        filteredTools.forEach(tool => {
            const server = tool.mcp_server || 'unknown';
            if (!groups[server]) groups[server] = [];
            groups[server].push(tool);
        });
        return groups;
    }, [filteredTools]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchTools();
        setIsRefreshing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose} onKeyDown={handleKeyDown}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.serverIcon}>
                            {selectedServer ? SERVER_ICONS[selectedServer] || SERVER_ICONS.default : '🔧'}
                        </div>
                        <div className={styles.headerInfo}>
                            <h2>{selectedServer || 'All MCP Servers'}</h2>
                            <div className={styles.toolsBadge}>
                                <span>Tools</span>
                                <span className={styles.toolsCount}>{filteredTools.length}</span>
                            </div>
                        </div>
                    </div>
                    <button className={styles.closeButton} onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                {/* Search */}
                <div className={styles.searchSection}>
                    <div className={styles.searchWrapper}>
                        <span className={styles.searchIcon}>🔍</span>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search tools by name, category, or description..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Server Tabs */}
                <div className={styles.serverTabs}>
                    <button
                        className={`${styles.serverTab} ${!selectedServer ? styles.serverTabActive : ''}`}
                        onClick={() => setSelectedServer(null)}
                    >
                        All
                        <span className={styles.serverTabCount}>{tools.length}</span>
                    </button>
                    {servers.map(server => (
                        <button
                            key={server}
                            className={`${styles.serverTab} ${selectedServer === server ? styles.serverTabActive : ''}`}
                            onClick={() => setSelectedServer(server)}
                        >
                            {SERVER_ICONS[server] || SERVER_ICONS.default} {server}
                            <span className={styles.serverTabCount}>{groupedTools[server]?.length || 0}</span>
                        </button>
                    ))}
                </div>

                {/* Tools List */}
                <div className={styles.toolsList}>
                    {isLoading ? (
                        <div className={styles.loading}>
                            <div className={styles.loadingSpinner} />
                            <div className={styles.loadingText}>Loading tools...</div>
                        </div>
                    ) : filteredTools.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>🔍</div>
                            <div className={styles.emptyText}>
                                {searchQuery ? `No tools matching "${searchQuery}"` : 'No tools available'}
                            </div>
                        </div>
                    ) : (
                        Object.entries(filteredGroupedTools).map(([server, serverTools]) => (
                            <div key={server} className={styles.toolsGroup}>
                                {!selectedServer && (
                                    <div className={styles.groupHeader}>
                                        <span className={styles.groupIcon}>
                                            {SERVER_ICONS[server] || SERVER_ICONS.default}
                                        </span>
                                        <span className={styles.groupName}>{server}</span>
                                        <span className={styles.groupCount}>{serverTools.length} tools</span>
                                    </div>
                                )}
                                {serverTools.map(tool => (
                                    <div key={`${server}-${tool.name}`} className={styles.toolCard}>
                                        <div className={styles.toolHeader}>
                                            <span className={styles.toolName}>{tool.name}</span>
                                            {tool.category && (
                                                <span className={styles.toolCategory}>{tool.category}</span>
                                            )}
                                        </div>
                                        <div className={styles.toolDescription}>
                                            {tool.description || 'No description available'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <div className={styles.footerStats}>
                        <div className={styles.footerStat}>
                            <span>Servers:</span>
                            <span className={styles.footerStatValue}>{servers.length}</span>
                        </div>
                        <div className={styles.footerStat}>
                            <span>Total Tools:</span>
                            <span className={styles.footerStatValue}>{tools.length}</span>
                        </div>
                    </div>
                    <button
                        className={styles.refreshButton}
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                    >
                        <span className={isRefreshing ? styles.spinning : ''}>⟳</span>
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Export a trigger button component for easy integration
export function ToolsModalTrigger({ serverName, toolCount }: { serverName?: string; toolCount?: number }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    background: 'rgba(0, 240, 255, 0.1)',
                    border: '1px solid rgba(0, 240, 255, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: '#00f0ff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(0, 240, 255, 0.2)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(0, 240, 255, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                }}
            >
                🔧 {serverName || 'MCP Tools'}
                {toolCount !== undefined && (
                    <span style={{
                        background: '#00f0ff',
                        color: '#050505',
                        padding: '2px 8px',
                        borderRadius: '99px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                    }}>
                        {toolCount}
                    </span>
                )}
            </button>
            <ToolsModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                initialServer={serverName}
            />
        </>
    );
}
