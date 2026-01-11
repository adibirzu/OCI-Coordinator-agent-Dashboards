'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '@/hooks/useSettings';
import styles from './page.module.css';

type TabType = 'preferences' | 'oci' | 'setup';
type ConnectionStatus = 'online' | 'offline' | 'checking' | 'notConfigured';

interface ServiceStatus {
    name: string;
    icon: string;
    status: ConnectionStatus;
    endpoint?: string;
    details?: Record<string, string>;
}

export default function SettingsPage() {
    const { settings, updateSetting, loaded } = useSettings();
    const [showSaved, setShowSaved] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('preferences');
    const [services, setServices] = useState<ServiceStatus[]>([
        { name: 'Coordinator API', icon: '🔌', status: 'checking', endpoint: 'http://localhost:8001' },
        { name: 'Logs/Chat API', icon: '💬', status: 'checking', endpoint: 'http://localhost:3001' },
        { name: 'OCI APM', icon: '📊', status: 'checking' },
        { name: 'OCI Logging', icon: '📝', status: 'checking' },
        { name: 'Slack Integration', icon: '💼', status: 'checking' },
    ]);

    const handleSave = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
        updateSetting(key, value);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
    };

    const checkServices = useCallback(async () => {
        // Check Coordinator API (port 8001)
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            setServices(prev => prev.map(s =>
                s.name === 'Coordinator API'
                    ? { ...s, status: data.status === 'online' ? 'online' : 'offline' }
                    : s
            ));
        } catch {
            setServices(prev => prev.map(s =>
                s.name === 'Coordinator API' ? { ...s, status: 'offline' } : s
            ));
        }

        // Check Logs API (port 3001) via status endpoint
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            setServices(prev => prev.map(s =>
                s.name === 'Logs/Chat API'
                    ? { ...s, status: data.status === 'online' ? 'online' : 'offline' }
                    : s
            ));
        } catch {
            setServices(prev => prev.map(s =>
                s.name === 'Logs/Chat API' ? { ...s, status: 'offline' } : s
            ));
        }

        // Check OCI APM
        try {
            const res = await fetch('/api/apm');
            const data = await res.json();
            setServices(prev => prev.map(s =>
                s.name === 'OCI APM'
                    ? {
                        ...s,
                        status: data.status === 'error' || data.error ? 'notConfigured' : 'online',
                        details: data.metrics ? { Traces: `${data.metrics.length} metrics` } : undefined
                    }
                    : s
            ));
        } catch {
            setServices(prev => prev.map(s =>
                s.name === 'OCI APM' ? { ...s, status: 'notConfigured' } : s
            ));
        }

        // Check OCI Logging
        try {
            const res = await fetch('/api/logs?limit=1');
            const data = await res.json();
            setServices(prev => prev.map(s =>
                s.name === 'OCI Logging'
                    ? {
                        ...s,
                        status: data.status === 'unavailable' || data.error ? 'notConfigured' : 'online'
                    }
                    : s
            ));
        } catch {
            setServices(prev => prev.map(s =>
                s.name === 'OCI Logging' ? { ...s, status: 'notConfigured' } : s
            ));
        }

        // Check Slack Integration
        try {
            const res = await fetch('/api/slack/status');
            const data = await res.json();
            setServices(prev => prev.map(s =>
                s.name === 'Slack Integration'
                    ? { ...s, status: data.connected ? 'online' : 'notConfigured' }
                    : s
            ));
        } catch {
            setServices(prev => prev.map(s =>
                s.name === 'Slack Integration' ? { ...s, status: 'notConfigured' } : s
            ));
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'oci') {
            checkServices();
        }
    }, [activeTab, checkServices]);

    const getStatusLabel = (status: ConnectionStatus) => {
        switch (status) {
            case 'online': return 'Connected';
            case 'offline': return 'Offline';
            case 'checking': return 'Checking...';
            case 'notConfigured': return 'Not Configured';
        }
    };

    if (!loaded) return <div className="p-8">Loading settings...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.intro}>
                <h1 className={styles.title}>Settings</h1>
                <p className={styles.subtitle}>Configure your OCI Coordinator Dashboard</p>
            </div>

            {/* Tabs */}
            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'preferences' ? styles.active : ''}`}
                    onClick={() => setActiveTab('preferences')}
                >
                    Preferences
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'oci' ? styles.active : ''}`}
                    onClick={() => setActiveTab('oci')}
                >
                    OCI Configuration
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'setup' ? styles.active : ''}`}
                    onClick={() => setActiveTab('setup')}
                >
                    Setup Guide
                </button>
            </div>

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
                <>
                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>Dashboard Performance</h2>
                            <p className={styles.sectionDescription}>Control how often data updates and how much history to keep.</p>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Refresh Rate</label>
                            <select
                                value={settings.refreshRate}
                                onChange={(e) => handleSave('refreshRate', Number(e.target.value))}
                                className={styles.select}
                            >
                                <option value={2000}>2 seconds (Fast)</option>
                                <option value={5000}>5 seconds (Normal)</option>
                                <option value={10000}>10 seconds (Slow)</option>
                                <option value={30000}>30 seconds (Very Slow)</option>
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Max Log Lines</label>
                            <select
                                value={settings.maxLogLines}
                                onChange={(e) => handleSave('maxLogLines', Number(e.target.value))}
                                className={styles.select}
                            >
                                <option value={50}>50 Lines</option>
                                <option value={100}>100 Lines</option>
                                <option value={500}>500 Lines</option>
                                <option value={1000}>1000 Lines (May impact performance)</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>Appearance</h2>
                            <p className={styles.sectionDescription}>Customize the look and feel of the interface.</p>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Theme</label>
                            <select
                                value={settings.theme}
                                onChange={(e) => handleSave('theme', e.target.value as 'light' | 'dark' | 'system')}
                                className={styles.select}
                            >
                                <option value="system">System Default</option>
                                <option value="dark">Dark Mode</option>
                                <option value="light">Light Mode</option>
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={settings.showAnimations}
                                    onChange={(e) => handleSave('showAnimations', e.target.checked)}
                                    className={styles.checkbox}
                                />
                                <span>Enable UI Animations</span>
                            </label>
                        </div>
                    </div>
                </>
            )}

            {/* OCI Configuration Tab */}
            {activeTab === 'oci' && (
                <>
                    <div className={styles.infoBox}>
                        <span className={styles.infoIcon}>ℹ️</span>
                        <div>
                            <strong>Connection Status</strong><br />
                            This dashboard connects to OCI Coordinator services. Ensure your backend services are running
                            and properly configured with OCI credentials.
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>Service Connections</h2>
                            <p className={styles.sectionDescription}>Status of connected services and APIs</p>
                        </div>

                        <div className={styles.configGrid}>
                            {services.map((service) => (
                                <div key={service.name} className={styles.configCard}>
                                    <div className={styles.configHeader}>
                                        <span className={styles.configTitle}>
                                            <span className={styles.configIcon}>{service.icon}</span>
                                            {service.name}
                                        </span>
                                        <span className={`${styles.statusBadge} ${styles[service.status]}`}>
                                            <span className={styles.statusDot} />
                                            {getStatusLabel(service.status)}
                                        </span>
                                    </div>
                                    {service.endpoint && (
                                        <div className={styles.configDetails}>
                                            <div className={styles.configDetail}>
                                                <span className={styles.configDetailLabel}>Endpoint</span>
                                                <span className={styles.configDetailValue}>{service.endpoint}</span>
                                            </div>
                                        </div>
                                    )}
                                    {service.details && (
                                        <div className={styles.configDetails}>
                                            {Object.entries(service.details).map(([key, value]) => (
                                                <div key={key} className={styles.configDetail}>
                                                    <span className={styles.configDetailLabel}>{key}</span>
                                                    <span className={styles.configDetailValue}>{value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className={styles.configActions} style={{ marginTop: '20px' }}>
                            <button
                                className={styles.testButton}
                                onClick={checkServices}
                            >
                                🔄 Refresh Status
                            </button>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>Backend URLs</h2>
                            <p className={styles.sectionDescription}>Configure backend service endpoints</p>
                        </div>
                        <div className={styles.configDetails}>
                            <div className={styles.configDetail}>
                                <span className={styles.configDetailLabel}>COORDINATOR_URL</span>
                                <span className={styles.configDetailValue}>http://localhost:8001</span>
                            </div>
                            <div className={styles.configDetail}>
                                <span className={styles.configDetailLabel}>COORDINATOR_API_URL</span>
                                <span className={styles.configDetailValue}>http://localhost:3001</span>
                            </div>
                        </div>
                        <p style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--color-text-tertiary)' }}>
                            To change these endpoints, update your <code>.env.local</code> file and restart the server.
                        </p>
                    </div>
                </>
            )}

            {/* Setup Guide Tab */}
            {activeTab === 'setup' && (
                <>
                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>Quick Start</h2>
                            <p className={styles.sectionDescription}>Get your OCI Coordinator Dashboard running</p>
                        </div>

                        <div className={styles.infoBox}>
                            <span className={styles.infoIcon}>📦</span>
                            <div>
                                This dashboard requires the <strong>OCI Coordinator</strong> backend to be running.
                                Get it from{' '}
                                <a
                                    href="https://github.com/adibirzu/oci-coordinator"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.helpLink}
                                >
                                    github.com/adibirzu/oci-coordinator ↗
                                </a>
                            </div>
                        </div>

                        <h3 style={{ marginBottom: '12px', color: 'var(--color-text-primary)' }}>1. Environment Variables</h3>
                        <p style={{ marginBottom: '12px', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                            Create a <code>.env.local</code> file in your project root with these variables:
                        </p>
                        <div className={styles.envVarsBox}>
{`# Backend Coordinator URLs
COORDINATOR_URL=http://127.0.0.1:8001
COORDINATOR_API_URL=http://127.0.0.1:3001

# OCI Configuration (optional - for direct OCI API access)
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..your-compartment-id
OCI_LOG_GROUP_ID=ocid1.loggroup.oc1.region..your-log-group-id

# OCI APM Configuration (optional)
OCI_APM_ENDPOINT=https://your-apm-endpoint.oci.oraclecloud.com/...
OCI_APM_PRIVATE_DATA_KEY=your-private-data-key

# OCI Logging Configuration (optional)
OCI_LOGGING_ENABLED=true
OCI_LOGGING_REGION=your-region`}
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>OCI Coordinator Setup</h2>
                            <p className={styles.sectionDescription}>Configure the backend coordinator service</p>
                        </div>

                        <h3 style={{ marginBottom: '12px', color: 'var(--color-text-primary)' }}>2. Start the Coordinator</h3>
                        <div className={styles.envVarsBox}>
{`# Clone the OCI Coordinator
git clone https://github.com/adibirzu/oci-coordinator
cd oci-coordinator

# Install dependencies
npm install

# Configure your .env.local with OCI credentials
cp .env.example .env.local
# Edit .env.local with your OCI configuration

# Start the coordinator
npm run dev`}
                        </div>

                        <h3 style={{ margin: '20px 0 12px', color: 'var(--color-text-primary)' }}>3. Required OCI Resources</h3>
                        <ul style={{ paddingLeft: '20px', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                            <li><strong>OCI CLI Profile:</strong> Configure <code>~/.oci/config</code> with your credentials</li>
                            <li><strong>Compartment:</strong> A compartment OCID for resource access</li>
                            <li><strong>APM Domain:</strong> (Optional) For performance monitoring</li>
                            <li><strong>Log Group:</strong> (Optional) For centralized logging</li>
                        </ul>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>Resources</h2>
                            <p className={styles.sectionDescription}>Documentation and support links</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <a
                                href="https://github.com/adibirzu/oci-coordinator"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.helpLink}
                            >
                                📘 OCI Coordinator Repository ↗
                            </a>
                            <a
                                href="https://docs.oracle.com/en-us/iaas/Content/API/Concepts/sdkconfig.htm"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.helpLink}
                            >
                                📚 OCI SDK Configuration Guide ↗
                            </a>
                            <a
                                href="https://docs.oracle.com/en-us/iaas/application-performance-monitoring/index.html"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.helpLink}
                            >
                                📊 OCI APM Documentation ↗
                            </a>
                        </div>
                    </div>
                </>
            )}

            {/* About Section - Always visible at bottom */}
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>About</h2>
                    <p className={styles.sectionDescription}>System information</p>
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9em' }}>
                    <p><strong>App Version:</strong> 1.0.0</p>
                    <p><strong>Coordinator API:</strong> http://localhost:8001</p>
                    <p><strong>Logs API:</strong> http://localhost:3001</p>
                    <p><strong>Dashboard Port:</strong> 4001</p>
                    <p style={{ marginTop: '10px' }}>
                        <a
                            href="https://github.com/adibirzu/viewapp"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.helpLink}
                        >
                            View on GitHub ↗
                        </a>
                    </p>
                </div>
            </div>

            {showSaved && (
                <div className={styles.saveIndicator}>
                    Settings Saved
                </div>
            )}
        </div>
    );
}
