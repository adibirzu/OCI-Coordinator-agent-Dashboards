# ViewApp - OCI Coordinator Dashboard

A Next.js dashboard application for monitoring and visualizing OCI (Oracle Cloud Infrastructure) coordinator services, agents, and MCP (Model Context Protocol) servers.

## Tech Stack

- **Framework:** Next.js 16.1.1 (App Router)
- **React:** 19.2.3
- **UI:** React, CSS Modules
- **Visualization:** ReactFlow, Dagre (graph layouts)
- **OCI SDK:** oci-common, oci-monitoring, oci-loggingsearch

## Project Structure

```
src/
├── app/
│   ├── api/                    # Next.js API Routes (server-side proxies)
│   │   ├── agents/             # Fetches agent list
│   │   ├── apm/                # APM metrics proxy
│   │   ├── architecture/       # Architecture data
│   │   ├── chat/               # Chat endpoint
│   │   ├── coordinator/        # Coordinator status/logs
│   │   ├── health/             # Health check
│   │   ├── logs/               # Log streaming
│   │   ├── oci/                # Direct OCI SDK calls
│   │   ├── slack/              # Slack integration status
│   │   ├── status/             # System status
│   │   └── tools/              # MCP tools list
│   ├── architecture/           # Architecture visualization page
│   ├── feed/                   # Log feed page
│   ├── oci/                    # OCI dashboard page
│   ├── settings/               # Settings page
│   └── troubleshoot/           # Troubleshooting page
├── components/                 # React components
├── hooks/                      # Custom React hooks
├── lib/                        # Utility libraries (oci-auth)
└── services/                   # Service layer (OCIService)
```

## Backend Dependencies

The app proxies requests to two backend coordinator services:

### Port 8001 - Primary Coordinator API
Used by these API routes:
- `/api/status` - System status
- `/api/health` - Health check
- `/api/tools` - MCP tools list
- `/api/agents` - Agent list
- `/api/architecture` - Architecture data
- `/api/slack/status` - Slack connection status
- `/api/coordinator/status` - Detailed coordinator status

### Port 3001 - Logs/Chat Coordinator API
Used by these API routes:
- `/api/logs` - Log streaming
- `/api/apm` - APM metrics
- `/api/coordinator/logs` - Coordinator logs
- `/api/chat` - Chat functionality

### OCI SDK Direct
These routes call OCI APIs directly (requires OCI credentials):
- `/api/oci/apm` - OCI Monitoring metrics
- `/api/oci/logging` - OCI Log Search

### APM Traces API
The `/api/apm/traces` endpoint queries OCI APM Trace Explorer directly:
- **Direct HTTP requests** - Bypasses OCI TypeScript SDK v2.122.2 date serialization bug
- Uses `DefaultRequestSigner` for OCI request signing
- Query format: `show (traces) TraceStatus as Status, ServiceName as Service, ...`
- Response parsing: `response.queryResultRows` (not SDK-style nested structure)

**Known Issue (Fixed):** The OCI SDK incorrectly serializes dates (local time with Z suffix, no hour zero-padding). The fix uses `queryApmDirect()` with proper ISO date formatting via `Date.toISOString()`.

## Environment Variables

```bash
# Backend coordinator URLs (defaults shown)
COORDINATOR_API_URL=http://127.0.0.1:3001
COORDINATOR_URL=http://127.0.0.1:8001

# OCI Configuration (for direct OCI API calls)
OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
OCI_LOG_GROUP_ID=ocid1.loggroup.oc1...
```

## Graceful Degradation

All API routes are designed to work without the backend coordinator:
- Return HTTP 200 with fallback data when backend is unavailable
- Frontend components display "offline" or "unavailable" status
- No HTTP 500 errors - prevents frontend crashes

## Key Components

| Component | Purpose | API Dependencies |
|-----------|---------|------------------|
| `ServiceStatusGrid` | System health display | `/api/health`, `/api/status`, `/api/slack/status` |
| `ArchitectureCanvas` | ReactFlow visualization | `/api/status`, `/api/tools`, `/api/agents`, `/api/architecture` |
| `LogStream` | Log viewer | `/api/logs` (via OCIService) |
| `LiveLogFeed` | Real-time log feed | `/api/logs?limit=50&live=true` |
| `ApmMetrics` | Performance metrics | `/api/apm` |

## Development

```bash
# Install dependencies
npm install

# Run development server (with auto port-kill)
npm run dev:clean

# Or just run dev server (port 4001)
npm run dev

# Build for production
npm run build

# Run production server (with auto port-kill)
npm run start:clean

# Kill port 4001 manually
npm run kill-port
```

**Port Configuration:**
- ViewApp runs on `http://localhost:4001`
- OCI Coordinator (status, tools): `http://localhost:8001`
- Coordinator API (logs, chat): `http://localhost:3001`

The startup scripts in `scripts/` automatically kill processes on port 4001 before starting.

## Important Notes

1. **API Routes are Server-Side Only** - Never use `"use client"` in route.ts files
2. **All API routes return HTTP 200** - Errors are returned in the response body with `status: 'error'` or `status: 'unavailable'`
3. **Backend is Optional** - The app displays fallback UI when coordinator services are offline
