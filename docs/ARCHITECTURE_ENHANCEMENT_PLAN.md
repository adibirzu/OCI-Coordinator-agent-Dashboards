# OCI Coordinator Architecture Enhancement Plan

## Overview

This document outlines the architectural enhancements made to the OCI Coordinator Dashboard and provides a roadmap for future improvements to support Observability and Manageability agents.

---

## Current Architecture (Implemented)

### Request/Response Flow

```
                           Request Flow
  +-------------+      +----------------+      +-------------+
  |   Slack     |  ->  | OCI Coordinator|  ->  | LLM (Claude)|
  |   Channel   |      |    (Hub)       |      |   Provider  |
  +-------------+      +----------------+      +-------------+
         ^                                            |
         |                                            v
  +-------------+                              +-------------+
  |   Response  | <--------------------------- |   Agent     |
  |   Back      |                              |   Routing   |
  +-------------+                              +-------------+
                                                     |
                     +-----------------+             |
                     |                 v             v
              +------+------+    +------+------+
              | MCP Server  |    | MCP Server  |
              | (FinOps)    |    | (Security)  |
              +------+------+    +------+------+
                     |                 |
                     v                 v
              +-------------------------------+
              |      OCI Cloud APIs           |
              | (Monitoring, Logging, OPSI,   |
              |  Cloud Guard, Cost Mgmt)      |
              +-------------------------------+
```

### Six-Layer Architecture

| Layer | Component | Purpose |
|-------|-----------|---------|
| 1 | Communication Channels | Slack, Teams, Chat - User interface |
| 2 | OCI Coordinator | Central orchestration hub |
| 3 | LLM Provider | Claude - Intent analysis & response generation |
| 4 | Specialized Agents | Domain-specific AI agents |
| 5 | MCP Servers | Model Context Protocol tool providers |
| 6 | OCI Backend | Oracle Cloud Infrastructure APIs |

---

## Enhancement Roadmap

### Phase 1: Observability Agents (Q1)

#### 1.1 Log Analytics Agent
**Purpose:** Deep analysis of OCI Logging Analytics data

**Capabilities:**
- [ ] Natural language log queries
- [ ] Anomaly detection in log patterns
- [ ] Root cause analysis correlation
- [ ] Alert pattern recognition

**MCP Integration:**
- Connect to `oci-logan` MCP server
- Tools: `oci_logan_execute_query`, `oci_logan_search_security_events`, `oci_logan_get_mitre_techniques`

#### 1.2 Metrics Agent
**Purpose:** Performance monitoring and analysis

**Capabilities:**
- [ ] Resource utilization analysis
- [ ] Trend prediction
- [ ] Threshold recommendations
- [ ] Cross-service correlation

**MCP Integration:**
- Connect to `mcp-oci` observability tools
- Tools: `oci_observability_get_instance_metrics`, `oci_observability_list_alarms`

#### 1.3 APM Agent
**Purpose:** Application Performance Monitoring

**Capabilities:**
- [ ] Trace analysis
- [ ] Service dependency mapping
- [ ] Latency hotspot identification
- [ ] Error rate monitoring

**MCP Integration:**
- Connect to APM Trace Explorer
- Leverage existing `/api/apm/traces` endpoint

---

### Phase 2: Manageability Agents (Q2)

#### 2.1 Infrastructure Agent
**Purpose:** Compute, network, and storage management

**Capabilities:**
- [ ] Instance health assessment
- [ ] Rightsizing recommendations
- [ ] Network topology analysis
- [ ] Storage optimization

**MCP Integration:**
- Connect to `mcp-oci` compute/network tools
- Tools: `oci_compute_list_instances`, `oci_network_list_vcns`, `oci_network_analyze_security`

#### 2.2 Database Agent
**Purpose:** Database performance and management

**Capabilities:**
- [ ] SQL performance analysis
- [ ] AWR report interpretation
- [ ] Backup/recovery recommendations
- [ ] Autonomous DB management

**MCP Integration:**
- Connect to `database-observatory` MCP server
- Tools: `oci_dbmgmt_get_awr_report`, `oci_opsi_get_sql_statistics`, `oci_opsi_analyze_cpu`

#### 2.3 Cost Agent (FinOps)
**Purpose:** Cost optimization and analysis

**Capabilities:**
- [ ] Cost breakdown analysis
- [ ] Anomaly detection
- [ ] Budget tracking
- [ ] Rightsizing for cost

**MCP Integration:**
- Connect to `finopsai` MCP server
- Tools: `oci_cost_by_compartment`, `oci_cost_service_drilldown`, `oci_cost_spikes`

---

### Phase 3: Security Agents (Q3)

#### 3.1 Security Posture Agent
**Purpose:** Cloud Guard and security monitoring

**Capabilities:**
- [ ] Threat detection analysis
- [ ] Compliance assessment
- [ ] Security score tracking
- [ ] Remediation recommendations

**MCP Integration:**
- Connect to `oci-security` MCP server
- Tools: `oci_security_cloudguard_list_problems`, `oci_security_audit_audit_list_events`

#### 3.2 Identity & Access Agent
**Purpose:** IAM and access governance

**Capabilities:**
- [ ] Access pattern analysis
- [ ] Policy compliance checking
- [ ] Privilege escalation detection
- [ ] User activity audit

**MCP Integration:**
- Connect to `mcp-oci` security tools
- Tools: `oci_security_list_users`, `oci_security_list_policies`, `oci_security_audit`

---

## Architecture View Enhancements

### Completed Enhancements

1. **Six-Layer Visualization**
   - Communication channels (Slack) with real-time status
   - Central coordinator hub
   - LLM provider integration
   - Specialized agent nodes
   - MCP server nodes
   - OCI Backend cloud APIs

2. **Flow Visualization**
   - Numbered flow steps (1-6)
   - Animated request flow
   - Response path indication
   - Agent-to-MCP connections

3. **Interactive Features**
   - Click-to-select node details
   - Real-time status indicators
   - Legend panel for workflow
   - Auto-layout with dagre

### Planned Enhancements

#### Visual Improvements
- [ ] Color-coded flow paths by agent type
- [ ] Drag-and-drop repositioning
- [ ] Zoom to specific layers
- [ ] Collapsible node groups

#### Data Flow Visualization
- [ ] Real-time request tracking
- [ ] Latency indicators on edges
- [ ] Error highlighting
- [ ] Request/response payloads

#### Interactive Features
- [ ] Direct tool invocation from UI
- [ ] Agent skill browser
- [ ] MCP tool documentation
- [ ] Configuration editing

---

## Agent Design Patterns

### 1. Skill-Based Architecture
Each agent should expose skills through a standardized interface:

```typescript
interface AgentSkill {
  id: string;
  name: string;
  description: string;
  mcpTools: string[];  // Required MCP tools
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
}
```

### 2. MCP Integration Pattern
Agents connect to MCP servers through the coordinator:

```
Agent -> Skill -> MCP Server -> Tool -> OCI API
```

### 3. Multi-Agent Collaboration
For complex queries requiring multiple domains:

```
User Query
    |
    v
Coordinator (routes to primary agent)
    |
    +-> Primary Agent
    |       |
    |       +-> MCP Tools
    |       |
    |       +-> Secondary Agent (delegation)
    |               |
    |               +-> MCP Tools
    |
    v
Aggregated Response
```

---

## Implementation Guidelines

### Adding a New Agent

1. **Define Agent Configuration**
   ```python
   agent_config = {
       "id": "observability-agent",
       "name": "Observability Agent",
       "skills": ["log_analysis", "metrics_query", "alert_management"],
       "mcp_servers": ["oci-logan", "mcp-oci"]
   }
   ```

2. **Register with Coordinator**
   - Add to `agent_mcp_map` in `/api/architecture`
   - Implement skill handlers
   - Connect to required MCP servers

3. **Update Architecture View**
   - Agent auto-discovered via `/api/agents`
   - MCP connections via `agent_mcp_map`
   - Skills displayed in detail panel

### Adding MCP Server Integration

1. **Server Configuration**
   - Add to coordinator MCP server registry
   - Configure authentication
   - Define tool subset for agent access

2. **Tool Mapping**
   - Map MCP tools to agent skills
   - Define input/output transformations
   - Handle tool errors gracefully

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Agent Response Time | < 5s | - |
| MCP Tool Success Rate | > 95% | - |
| User Query Resolution | > 80% first try | - |
| Architecture View Load | < 2s | ~1s |
| Real-time Status Accuracy | 100% | 100% |

---

## Next Steps

1. **Immediate (This Sprint)**
   - [x] Implement 6-layer architecture view
   - [x] Add Slack channel integration status
   - [x] Show agent-to-MCP connections
   - [ ] Test with live coordinator

2. **Short Term (Next 2 Sprints)**
   - [ ] Add log analytics agent
   - [ ] Implement metrics dashboard
   - [ ] Create agent skill browser

3. **Medium Term (This Quarter)**
   - [ ] Full observability agent suite
   - [ ] Multi-agent query routing
   - [ ] Real-time request tracing

---

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [OCI SDK Documentation](https://docs.oracle.com/en-us/iaas/tools/typescript/latest/)
- [ReactFlow Documentation](https://reactflow.dev/)
- [ViewApp Architecture](/Users/abirzu/dev/viewapp/CLAUDE.md)
