'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ociService } from '@/services/OCIService';
import styles from './page.module.css';

interface AgentDetails {
    role: string;
    description: string;
    capabilities: string[];
    skills: string[];
    mcp_tools?: string[];
}

export default function AgentPage() {
    const params = useParams();
    const router = useRouter();
    const role = params.role as string;

    const [agent, setAgent] = useState<AgentDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!role) return;

        const loadAgent = async () => {
            try {
                // Use Next.js API proxy to avoid CORS and get static fallback
                const res = await fetch(`/api/agents/${role}`);
                if (!res.ok) throw new Error('Agent not found');
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                setAgent(data);
            } catch (err) {
                console.error(err);
                setError('Failed to load agent details');
            } finally {
                setLoading(false);
            }
        };

        loadAgent();
    }, [role]);

    if (loading) return <div className="p-8">Loading agent details...</div>;
    if (error) return <div className="p-8 text-red-500">{error}</div>;
    if (!agent) return <div className="p-8">Agent not found</div>;

    const formattedRole = role.replace('-agent', '').split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    return (
        <div className={styles.container}>
            <button onClick={() => router.back()} className="mb-4 text-sm text-gray-500 hover:text-white">
                ← Back to Dashboard
            </button>

            <div className={styles.header}>
                <div className={styles.headerContent}>
                    <h1>
                        {formattedRole}
                        <span className={styles.roleTag}>{agent.role}</span>
                    </h1>
                    <p className={styles.description}>{agent.description}</p>
                </div>
                <div className={styles.statusCard}>
                    <span className={styles.statusLabel}>Status</span>
                    <span className={styles.statusValue}>Active</span>
                </div>
            </div>

            <div className={styles.grid}>
                <div className={styles.mainContent}>
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>Skills & Workflows</h2>
                        </div>
                        <div className={styles.skillsGrid}>
                            {agent.skills.map(skill => (
                                <div key={skill} className={styles.skillItem}>
                                    <span className={styles.skillName}>{skill}</span>
                                    <span className={styles.skillDesc}>Automated workflow</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>Capabilities</h2>
                        </div>
                        <div className={styles.tagCloud}>
                            {agent.capabilities.map(cap => (
                                <span key={cap} className={styles.tag}>{cap}</span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={styles.sidebar}>
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>MCP Tools</h2>
                        </div>
                        <div className={styles.toolList}>
                            {agent.mcp_tools ? (
                                agent.mcp_tools.map(tool => (
                                    <div key={tool} className={styles.toolItem}>
                                        <div className={styles.toolName}>{tool}</div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-500 text-sm">No specific tools mapped.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
