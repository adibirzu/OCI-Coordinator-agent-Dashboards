# ViewApp - OCI Coordinator Dashboard

A modern Next.js dashboard for monitoring and visualizing your OCI (Oracle Cloud Infrastructure) Coordinator services, AI agents, and MCP (Model Context Protocol) servers.

![Next.js](https://img.shields.io/badge/Next.js-15.1.1-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![OCI](https://img.shields.io/badge/OCI-SDK-red?logo=oracle)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Real-time Dashboard** - Monitor coordinator status, agent health, and system metrics
- **Architecture Visualization** - Interactive graph showing agents, MCP servers, and their connections
- **Log Streaming** - Live log feed with filtering and search capabilities
- **APM Integration** - OCI Application Performance Monitoring metrics
- **Floating Chat** - Ask questions about your infrastructure from any page
- **Graceful Degradation** - Works offline with status indicators when services are unavailable
- **Dark Theme** - Modern, eye-friendly interface

## Architecture

```
                                    ┌─────────────────────────────────────┐
                                    │         ViewApp Dashboard           │
                                    │         (localhost:4001)            │
                                    └──────────────┬──────────────────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    │                              │                              │
                    ▼                              ▼                              ▼
    ┌───────────────────────────┐  ┌───────────────────────────┐  ┌───────────────────────────┐
    │   Primary Coordinator     │  │   Logs/Chat Coordinator   │  │      OCI APIs Direct      │
    │    (localhost:8001)       │  │    (localhost:3001)       │  │    (SDK Authenticated)    │
    │                           │  │                           │  │                           │
    │  • System Status          │  │  • Log Streaming          │  │  • APM Metrics            │
    │  • Agent Registry         │  │  • Chat Interface         │  │  • Logging Search         │
    │  • MCP Tools              │  │  • APM Proxy              │  │  • Monitoring             │
    │  • Architecture Data      │  │  • Coordinator Logs       │  │                           │
    │  • Slack Integration      │  │                           │  │                           │
    └───────────────────────────┘  └───────────────────────────┘  └───────────────────────────┘
                    │                              │                              │
                    └──────────────────────────────┼──────────────────────────────┘
                                                   │
                                    ┌──────────────┴──────────────┐
                                    │     Oracle Cloud (OCI)      │
                                    │  • Logging Analytics        │
                                    │  • APM Domain               │
                                    │  • Monitoring               │
                                    └─────────────────────────────┘
```

### Data Flow

```mermaid
flowchart TB
    subgraph ViewApp["ViewApp Dashboard"]
        UI[React UI Components]
        API[Next.js API Routes]
    end

    subgraph Coordinators["OCI Coordinators"]
        Primary[Primary API :8001]
        Logs[Logs/Chat API :3001]
    end

    subgraph OCI["Oracle Cloud"]
        APM[APM Domain]
        Logging[Logging Analytics]
        Monitoring[Monitoring Service]
    end

    UI --> API
    API --> Primary
    API --> Logs
    API --> OCI
    Primary --> OCI
    Logs --> OCI
```

## Prerequisites

- **Node.js** 18.x or higher
- **npm** or **yarn**
- **OCI Coordinator** running (optional - app works without it)
- **OCI Account** with configured credentials (optional - for direct OCI API calls)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/adibirzu/viewapp.git
cd viewapp

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Run development server
npm run dev:clean
```

Open [http://localhost:4001](http://localhost:4001) in your browser.

## Configuration

### Environment Variables

Copy `.env.example` to `.env.local` and configure as needed:

```bash
# Backend Coordinator URLs
COORDINATOR_URL=http://127.0.0.1:8001      # Primary API
COORDINATOR_API_URL=http://127.0.0.1:3001  # Logs/Chat API

# OCI Configuration (for direct API calls)
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..your-compartment
OCI_TENANCY_ID=ocid1.tenancy.oc1..your-tenancy

# OCI APM (optional)
OCI_APM_DOMAIN_ID=ocid1.apmdomain.oc1..your-domain
OCI_APM_ENDPOINT=https://your-apm.apm-agt.region.oci.oraclecloud.com

# OCI Logging (optional)
OCI_LOG_GROUP_ID=ocid1.loggroup.oc1..your-log-group
OCI_LOG_ID=ocid1.log.oc1..your-log
```

See `.env.example` for all available options with detailed comments.

### OCI SDK Authentication

For direct OCI API calls, configure your `~/.oci/config` file:

```ini
[DEFAULT]
user=ocid1.user.oc1..your-user
fingerprint=your:fingerprint:here
tenancy=ocid1.tenancy.oc1..your-tenancy
region=us-ashburn-1
key_file=~/.oci/your-api-key.pem
```

## Monitoring Your OCI Coordinator

### 1. Start the OCI Coordinator

First, ensure your [OCI Coordinator](https://github.com/adibirzu/oci-coordinator) is running:

```bash
# In the oci-coordinator directory
cd ../oci-coordinator
npm run start
```

This starts two services:
- **Primary API** on port 8001 (status, agents, tools)
- **Logs/Chat API** on port 3001 (logs, chat, APM proxy)

### 2. Start ViewApp

```bash
# In the viewapp directory
npm run dev:clean
```

### 3. Access the Dashboard

Open [http://localhost:4001](http://localhost:4001) to see:

- **Dashboard** - System overview with quick stats and status
- **Architecture** - Interactive visualization of your coordinator
- **Logs** - Real-time log streaming
- **OCI** - Direct OCI metrics and monitoring
- **Settings** - Configuration and connection status

### 4. Using the Floating Chat

Click the chat bubble in the bottom-right corner to ask questions:
- "Show me the system status"
- "List all active agents"
- "Check database performance"

## Project Structure

```
src/
├── app/
│   ├── api/                    # Next.js API Routes (server-side)
│   │   ├── agents/             # Agent registry
│   │   ├── apm/                # APM metrics proxy
│   │   ├── architecture/       # Architecture graph data
│   │   ├── chat/               # Chat endpoint
│   │   ├── coordinator/        # Coordinator status/logs
│   │   ├── health/             # Health check
│   │   ├── logs/               # Log streaming
│   │   ├── oci/                # Direct OCI SDK calls
│   │   ├── slack/              # Slack integration
│   │   ├── status/             # System status
│   │   └── tools/              # MCP tools list
│   ├── architecture/           # Architecture visualization page
│   ├── feed/                   # Log feed page
│   ├── oci/                    # OCI dashboard page
│   ├── settings/               # Settings & configuration page
│   └── troubleshoot/           # Troubleshooting page
├── components/
│   ├── architecture/           # ReactFlow components
│   ├── chat/                   # Chat components
│   ├── dashboard/              # Dashboard widgets
│   ├── layout/                 # App layout (Sidebar, Header)
│   ├── logs/                   # Log viewer components
│   └── ui/                     # Reusable UI components
├── hooks/                      # Custom React hooks
├── lib/                        # Utilities (OCI auth)
└── services/                   # Service layer
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [Next.js 15](https://nextjs.org/) | React framework with App Router |
| [React 19](https://react.dev/) | UI library |
| [ReactFlow](https://reactflow.dev/) | Interactive graph visualization |
| [Dagre](https://github.com/dagrejs/dagre) | Graph layout algorithm |
| [OCI SDK](https://docs.oracle.com/en-us/iaas/tools/typescript/latest/) | Oracle Cloud API access |
| CSS Modules | Scoped component styling |

## Development

```bash
# Development server with auto port-kill
npm run dev:clean

# Standard development server
npm run dev

# Build for production
npm run build

# Production server
npm run start:clean

# Manually kill port 4001
npm run kill-port
```

## Graceful Degradation

ViewApp is designed to work even when backend services are unavailable:

- All API routes return HTTP 200 with fallback data
- Components display "offline" or "unavailable" status
- No crashes when coordinator is not running
- Connection status indicators in the UI

## Related Projects

- [OCI Coordinator](https://github.com/adibirzu/oci-coordinator) - The AI coordinator that this dashboard monitors
- [OCI MCP Server](https://github.com/adibirzu/oci-mcp-server) - MCP server for OCI operations

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- [GitHub Issues](https://github.com/adibirzu/viewapp/issues) - Bug reports and feature requests
- [Documentation](https://github.com/adibirzu/viewapp/wiki) - Detailed guides and tutorials

---

Built with love for the OCI community
