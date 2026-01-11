/**
 * Shared scenarios and agents data
 * Used by: Troubleshooting Center, EnhancedChat, FloatingChat
 */

export interface Scenario {
    label: string;
    prompt: string;
    icon?: string;
}

export interface Agent {
    name: string;
    role: string;
    description: string;
    icon: string;
    scenarios: Scenario[];
}

/**
 * OCI Coordinator Agents with their troubleshooting scenarios
 * Each agent specializes in a specific domain and provides quick-action workflows
 */
export const AGENTS: Agent[] = [
    {
        name: 'Database Expert',
        role: 'database-agent',
        description: 'Specializes in Oracle Database diagnostics, performance tuning, and AWR analysis.',
        icon: '🗄️',
        scenarios: [
            {
                label: 'Advanced DB RCA (Enhanced)',
                prompt: 'Run advanced RCA for the main production database including hang checks and wait event analysis.',
                icon: '⚡'
            },
            {
                label: 'Check Backup Status',
                prompt: 'Check the latest backup status for all autonomous databases and report any failures.',
                icon: '💾'
            },
            {
                label: 'Diagnose Login Failures',
                prompt: 'Investigate recent login failures in the CRM database.',
                icon: '🚫'
            }
        ]
    },
    {
        name: 'Infrastructure Architect',
        role: 'infrastructure-agent',
        description: 'Manages compute, network, and storage resources with deep OCI expertise.',
        icon: '🏗️',
        scenarios: [
            {
                label: 'Analyze High CPU Instance',
                prompt: 'Identify the compute instance with highest CPU usage and analyze the cause.',
                icon: '📈'
            },
            {
                label: 'Network Security Audit',
                prompt: 'Review all security lists and network security groups for overly permissive rules.',
                icon: '🔒'
            },
            {
                label: 'Storage Utilization Report',
                prompt: 'Generate a storage utilization report for all block volumes and file systems.',
                icon: '💽'
            }
        ]
    },
    {
        name: 'FinOps Specialist',
        role: 'finops-agent',
        description: 'Analyzes cloud costs, identifies savings opportunities, and manages budgets.',
        icon: '💰',
        scenarios: [
            {
                label: 'Cost Spike Analysis',
                prompt: 'Identify any cost anomalies or spikes in the last 7 days and explain the root cause.',
                icon: '📊'
            },
            {
                label: 'Rightsizing Recommendations',
                prompt: 'Find compute instances that are over-provisioned and suggest rightsizing options.',
                icon: '⚖️'
            },
            {
                label: 'Monthly Cost Trend',
                prompt: 'Show the monthly cost trend for the last 6 months with forecast.',
                icon: '📉'
            }
        ]
    },
    {
        name: 'Security Guardian',
        role: 'security-agent',
        description: 'Monitors security posture, detects threats, and ensures compliance.',
        icon: '🛡️',
        scenarios: [
            {
                label: 'Cloud Guard Summary',
                prompt: 'Get a summary of all active Cloud Guard problems grouped by severity.',
                icon: '🚨'
            },
            {
                label: 'Failed Login Analysis',
                prompt: 'Analyze failed authentication attempts across all services in the last 24 hours.',
                icon: '🔐'
            },
            {
                label: 'Vulnerability Scan Report',
                prompt: 'Generate a vulnerability assessment report for all scanned hosts.',
                icon: '🔍'
            }
        ]
    }
];

/**
 * Get all scenarios flattened (useful for quick-access menus)
 */
export function getAllScenarios(): (Scenario & { agentName: string; agentIcon: string })[] {
    return AGENTS.flatMap(agent =>
        agent.scenarios.map(scenario => ({
            ...scenario,
            agentName: agent.name,
            agentIcon: agent.icon
        }))
    );
}

/**
 * Get scenarios for a specific agent by role
 */
export function getAgentScenarios(role: string): Scenario[] {
    const agent = AGENTS.find(a => a.role === role);
    return agent?.scenarios || [];
}

/**
 * Get a curated list of quick scenarios for the chat empty state
 * Returns one scenario from each agent for variety
 */
export function getQuickScenarios(): (Scenario & { agentName: string; agentIcon: string })[] {
    return AGENTS.map(agent => ({
        ...agent.scenarios[0],
        agentName: agent.name,
        agentIcon: agent.icon
    }));
}
