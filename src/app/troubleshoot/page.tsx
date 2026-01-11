'use client';

import React, { useState } from 'react';
import styles from './page.module.css';
import { AgentCard } from '@/components/troubleshoot/AgentCard';

interface Scenario {
    label: string;
    prompt: string;
    icon?: string;
}

const AGENTS = [
    {
        name: 'Database Expert',
        role: 'database-agent',
        description: 'Specializes in Oracle Database diagnostics, performance tuning, and issue resolution.',
        icon: '🗄️',
        scenarios: [
            { label: 'Advanced DB RCA (Enhanced)', prompt: 'Run advanced RCA for the main production database including hang checks and wait event analysis.', icon: '⚡' },
            { label: 'Check Backup Status', prompt: 'Check the latest backup status for all autonomous databases and report any failures.', icon: '💾' },
            { label: 'Diagnose Login Failures', prompt: 'Investigate recent login failures in the CRM database.', icon: '🚫' }
        ]
    },
    {
        name: 'Infrastructure Architect',
        role: 'infrastructure-agent',
        description: 'Manages OCI compute, networking, and storage resources.',
        icon: '🏗️',
        scenarios: [
            { label: 'High CPU Analysis', prompt: 'List all compute instances with CPU utilization over 80% for the last hour.', icon: '🔥' },
            { label: 'VCN Security Check', prompt: 'Analyze VCN security lists for overly permissive rules.', icon: '🛡️' },
            { label: 'Orphaned Resources', prompt: 'Find unattached block volumes and unused public IPs.', icon: '🗑️' }
        ]
    },
    {
        name: 'FinOps Specialist',
        role: 'finops-agent',
        description: 'Cost optimization, budget tracking, and spending analysis.',
        icon: '💰',
        scenarios: [
            { label: 'Daily Cost Spike', prompt: 'Identify any services that had a cost spike greater than 20% yesterday.', icon: '📈' },
            { label: 'Budget Forecast', prompt: 'Forecast total spending for the current month and compare with budget.', icon: '🔮' },
            { label: 'Savings Recommendations', prompt: 'Generate a list of cost-saving recommendations for idle resources.', icon: '📉' }
        ]
    },
    {
        name: 'Security Guardian',
        role: 'security-threat-agent',
        description: 'Threat detection, compliance monitoring, and security auditing.',
        icon: '👮',
        scenarios: [
            { label: 'Threat Hunting', prompt: 'Scan for indicators of compromise related to recent known vulnerabilities.', icon: '🕸️' },
            { label: 'IAM Compliance', prompt: 'Audit IAM users for MFA compliance and API key rotation.', icon: '🔑' },
            { label: 'Cloud Guard Analysis', prompt: 'Summarize critical problems detected by Cloud Guard in the last 24 hours.', icon: '🚨' }
        ]
    }
];

export default function TroubleshootPage() {
    const [output, setOutput] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [currentScenario, setCurrentScenario] = useState<string | null>(null);

    const handleScenarioClick = async (scenario: Scenario, agentRole: string) => {
        setLoading(true);
        setCurrentScenario(scenario.label);
        setOutput((prev) => prev + `\n\n--- Executing: ${scenario.label} (${agentRole}) ---\n> ${scenario.prompt}\n\n`);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: scenario.prompt,
                    // We could pass an agent hint if the API supported it, but the coordinator routes automatically
                    // metadata: { preferred_agent: agentRole } 
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.message || 'Workflow execution failed');

            if (data.error === 'authentication_required') {
                setOutput((prev) => prev + `⚠️ Authentication Required: ${data.auth_url}\n`);
                window.open(data.auth_url, '_blank');
            } else {
                setOutput((prev) => prev + `${data.response}\n`);
            }

        } catch (error: any) {
            setOutput((prev) => prev + `❌ Error: ${error.message}\n`);
        } finally {
            setLoading(false);
            setCurrentScenario(null);
        }
    };

    const clearOutput = () => {
        setOutput('');
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Troubleshooting Center</h1>
                <p>Select a scenario to trigger automated analysis workflows across your OCI environment.</p>
            </div>

            <div className={styles.grid}>
                {AGENTS.map((agent) => (
                    <AgentCard
                        key={agent.role}
                        {...agent}
                        onScenarioClick={handleScenarioClick}
                    />
                ))}
            </div>

            <div className={styles.outputSection}>
                <div className={styles.outputHeader}>
                    <span className={styles.outputTitle}>Workflow Output</span>
                    <button onClick={clearOutput} className={styles.clearButton}>Clear Console</button>
                </div>
                <div className={styles.outputContent}>
                    {output || <span style={{ color: '#6b7280' }}>Select a scenario above to see results...</span>}
                    {loading && (
                        <div className={styles.loading}>
                            <div className={styles.loadingDot}>●</div>
                            <span>Running {currentScenario}...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
