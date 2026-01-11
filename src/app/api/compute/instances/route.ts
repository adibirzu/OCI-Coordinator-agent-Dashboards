import { NextResponse } from 'next/server';
import * as core from 'oci-core';
import * as common from 'oci-common';
import { getProvider } from '@/lib/oci-auth';

const COMPARTMENT_ID = process.env.OCI_COMPARTMENT_ID;
const REGION = process.env.OCI_REGION || 'eu-frankfurt-1';

// Instance cache with TTL
interface CacheEntry {
    data: InstanceListResponse;
    timestamp: number;
}

interface InstanceSummary {
    id: string;
    displayName: string;
    lifecycleState: string;
    shape: string;
    availabilityDomain: string;
    timeCreated: string;
    compartmentId: string;
    faultDomain?: string;
    region?: string;
}

interface InstanceListResponse {
    instances: InstanceSummary[];
    totalCount: number;
    status: string;
    source: string;
    message?: string;
    cached?: boolean;
}

// Cache with 5-minute TTL for instance list
let instanceCache: CacheEntry | null = null;
const CACHE_TTL_MS = 300000; // 5 minutes

function getFromCache(): CacheEntry | null {
    if (instanceCache && Date.now() - instanceCache.timestamp < CACHE_TTL_MS) {
        return instanceCache;
    }
    return null;
}

function setCache(data: InstanceListResponse): void {
    instanceCache = { data, timestamp: Date.now() };
}

// Fallback when OCI is unavailable
const OFFLINE_RESPONSE: InstanceListResponse = {
    instances: [],
    totalCount: 0,
    status: 'unavailable',
    source: 'offline',
    message: 'Compute service unavailable'
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const skipCache = searchParams.get('skipCache') === 'true';
    const lifecycleState = searchParams.get('state') || ''; // RUNNING, STOPPED, etc.
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    // Check cache
    if (!skipCache) {
        const cached = getFromCache();
        if (cached) {
            let instances = cached.data.instances;

            // Apply lifecycle filter if specified
            if (lifecycleState) {
                instances = instances.filter(i =>
                    i.lifecycleState.toUpperCase() === lifecycleState.toUpperCase()
                );
            }

            return NextResponse.json({
                ...cached.data,
                instances,
                totalCount: instances.length,
                cached: true,
                cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
            });
        }
    }

    // Validate compartment ID
    if (!COMPARTMENT_ID) {
        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            status: 'pending_config',
            message: 'OCI_COMPARTMENT_ID not configured'
        });
    }

    try {
        const provider = getProvider();
        const computeClient = new core.ComputeClient({
            authenticationDetailsProvider: provider
        });
        computeClient.region = common.Region.fromRegionId(REGION);

        // List all instances in the compartment
        const listInstancesRequest: core.requests.ListInstancesRequest = {
            compartmentId: COMPARTMENT_ID,
            limit: limit
        };

        const response = await computeClient.listInstances(listInstancesRequest);

        const instances: InstanceSummary[] = (response.items || []).map(instance => {
            // Handle timeCreated - could be Date object or string depending on SDK serialization
            let timeCreatedStr = '';
            if (instance.timeCreated) {
                if (instance.timeCreated instanceof Date) {
                    timeCreatedStr = instance.timeCreated.toISOString();
                } else if (typeof instance.timeCreated === 'string') {
                    timeCreatedStr = instance.timeCreated;
                } else {
                    // Try to convert to string if it has a toISOString method
                    try {
                        timeCreatedStr = (instance.timeCreated as any).toISOString?.() || String(instance.timeCreated);
                    } catch {
                        timeCreatedStr = String(instance.timeCreated);
                    }
                }
            }

            return {
                id: instance.id || '',
                displayName: instance.displayName || 'Unnamed',
                lifecycleState: instance.lifecycleState || 'UNKNOWN',
                shape: instance.shape || 'Unknown',
                availabilityDomain: instance.availabilityDomain || '',
                timeCreated: timeCreatedStr,
                compartmentId: instance.compartmentId || '',
                faultDomain: instance.faultDomain || '',
                region: REGION
            };
        });

        const result: InstanceListResponse = {
            instances,
            totalCount: instances.length,
            status: 'connected',
            source: 'oci-compute'
        };

        // Cache the full list
        setCache(result);

        // Apply lifecycle filter if specified (after caching full list)
        let filteredInstances = instances;
        if (lifecycleState) {
            filteredInstances = instances.filter(i =>
                i.lifecycleState.toUpperCase() === lifecycleState.toUpperCase()
            );
        }

        return NextResponse.json({
            ...result,
            instances: filteredInstances,
            totalCount: filteredInstances.length
        });

    } catch (error: any) {
        console.error('Compute Instances API error:', error);

        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            status: 'error',
            message: error.message || 'Failed to list compute instances'
        });
    }
}
