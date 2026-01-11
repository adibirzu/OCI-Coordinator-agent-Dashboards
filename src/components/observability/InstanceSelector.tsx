'use client';

import React, { useEffect, useState } from 'react';

interface Instance {
    id: string;
    displayName: string;
    lifecycleState: string;
    shape: string;
}

interface InstanceSelectorProps {
    onInstanceChange: (instance: Instance | null) => void;
    selectedInstanceId?: string;
    showAllOption?: boolean;
    filterRunning?: boolean;
}

export function InstanceSelector({
    onInstanceChange,
    selectedInstanceId,
    showAllOption = true,
    filterRunning = true
}: InstanceSelectorProps) {
    const [instances, setInstances] = useState<Instance[]>([]);
    const [status, setStatus] = useState<string>('loading');
    const [message, setMessage] = useState<string>('');

    useEffect(() => {
        const fetchInstances = async () => {
            try {
                const stateParam = filterRunning ? '&state=RUNNING' : '';
                const res = await fetch(`/api/compute/instances?limit=100${stateParam}`);
                if (res.ok) {
                    const data = await res.json();
                    setInstances(data.instances || []);
                    setStatus(data.status || 'connected');
                    setMessage(data.message || '');

                    // Auto-select first instance if only one is available
                    if (data.instances?.length === 1 && !selectedInstanceId) {
                        onInstanceChange(data.instances[0]);
                    }
                } else {
                    setStatus('error');
                    setMessage('Failed to fetch instances');
                }
            } catch (e) {
                console.error('Failed to fetch instances', e);
                setStatus('error');
                setMessage('Connection failed');
            }
        };

        fetchInstances();
    }, [filterRunning]);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === 'all' || value === '') {
            onInstanceChange(null);
        } else {
            const instance = instances.find(i => i.id === value);
            if (instance) {
                onInstanceChange(instance);
            }
        }
    };

    // Status indicator color
    const getStatusColor = (state: string) => {
        switch (state.toUpperCase()) {
            case 'RUNNING': return '#22c55e';
            case 'STOPPED': return '#ef4444';
            case 'STARTING': return '#f59e0b';
            case 'STOPPING': return '#f59e0b';
            default: return '#9ca3af';
        }
    };

    if (status === 'loading') {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#9ca3af',
                fontSize: '0.85rem'
            }}>
                <span>Loading instances...</span>
            </div>
        );
    }

    if (status === 'pending_config') {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#f59e0b',
                fontSize: '0.85rem'
            }}>
                <span>OCI not configured</span>
            </div>
        );
    }

    if (status === 'error' || instances.length === 0) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#9ca3af',
                fontSize: '0.85rem'
            }}>
                <span>{message || 'No instances found'}</span>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        }}>
            <label style={{
                color: '#d1d5db',
                fontSize: '0.85rem',
                fontWeight: '500'
            }}>
                Instance:
            </label>
            <select
                value={selectedInstanceId || 'all'}
                onChange={handleChange}
                style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    color: 'white',
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    minWidth: '200px'
                }}
            >
                {showAllOption && (
                    <option value="all" style={{ background: '#1f2937' }}>
                        All Instances
                    </option>
                )}
                {instances.map(instance => (
                    <option
                        key={instance.id}
                        value={instance.id}
                        style={{ background: '#1f2937' }}
                    >
                        {instance.displayName} ({instance.shape})
                    </option>
                ))}
            </select>

            {/* Show status indicator for selected instance */}
            {selectedInstanceId && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    color: '#9ca3af'
                }}>
                    <span
                        style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: getStatusColor(
                                instances.find(i => i.id === selectedInstanceId)?.lifecycleState || ''
                            )
                        }}
                    />
                    {instances.find(i => i.id === selectedInstanceId)?.lifecycleState}
                </div>
            )}
        </div>
    );
}
