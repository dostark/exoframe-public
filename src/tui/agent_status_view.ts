// --- Service interface for Agent Status access ---
/**
 * Service interface for agent status access.
 */
export interface AgentService {
  listAgents(): Promise<AgentStatus[]>;
  getAgentLogs(agentId: string, limit?: number): Promise<AgentLogEntry[]>;
  getAgentHealth(agentId: string): Promise<AgentHealth>;
}

export interface AgentStatus {
  id: string;
  name: string;
  model: string;
  status: "active" | "inactive" | "error";
  lastActivity: string; // ISO timestamp
  capabilities: string[];
}

export interface AgentHealth {
  status: "healthy" | "warning" | "critical";
  issues: string[];
  uptime: number; // seconds
}

export interface AgentLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  traceId?: string;
}

/**
 * View/controller for agent status. Delegates to injected AgentService.
 */
export class AgentStatusView {
  private selectedAgentId: string | null = null;

  constructor(private readonly agentService: AgentService) {}

  /** Get all agents with their status. */
  async getAgentList(): Promise<AgentStatus[]> {
    return await this.agentService.listAgents();
  }

  /** Get detailed health for an agent. */
  async getAgentHealth(agentId: string): Promise<AgentHealth> {
    return await this.agentService.getAgentHealth(agentId);
  }

  /** Get logs for an agent. */
  async getAgentLogs(agentId: string, limit = 50): Promise<AgentLogEntry[]> {
    return await this.agentService.getAgentLogs(agentId, limit);
  }

  /** Select an agent for detailed view. */
  selectAgent(agentId: string): void {
    this.selectedAgentId = agentId;
  }

  /** Get currently selected agent. */
  getSelectedAgent(): string | null {
    return this.selectedAgentId;
  }

  /** Render agent list for TUI display. */
  async renderAgentList(): Promise<string> {
    const agents = await this.getAgentList();
    if (agents.length === 0) {
      return "No agents registered.";
    }
    const lines = ["Agent Status:", ""];
    for (const agent of agents) {
      const statusIcon = agent.status === "active" ? "🟢" : agent.status === "inactive" ? "🟡" : "🔴";
      lines.push(
        `${statusIcon} ${agent.name} (${agent.model}) - Last: ${new Date(agent.lastActivity).toLocaleString()}`,
      );
    }
    return lines.join("\n");
  }

  /** Render detailed view for selected agent. */
  async renderAgentDetails(): Promise<string> {
    if (!this.selectedAgentId) {
      return "No agent selected.";
    }
    const [health, logs] = await Promise.all([
      this.getAgentHealth(this.selectedAgentId),
      this.getAgentLogs(this.selectedAgentId, 10),
    ]);
    const lines = [`Agent: ${this.selectedAgentId}`, ""];
    lines.push(`Health: ${health.status.toUpperCase()} (Uptime: ${Math.floor(health.uptime / 3600)}h)`);
    if (health.issues.length > 0) {
      lines.push("Issues:");
      for (const issue of health.issues) {
        lines.push(`  - ${issue}`);
      }
    }
    lines.push("");
    lines.push("Recent Logs:");
    for (const log of logs) {
      const levelIcon = log.level === "error" ? "❌" : log.level === "warn" ? "⚠️" : "ℹ️";
      lines.push(`${levelIcon} ${log.timestamp} ${log.message}`);
    }
    return lines.join("\n");
  }

  /** Get focusable elements for accessibility. */
  getFocusableElements(): string[] {
    return ["agent-list", "agent-details", "refresh-button"];
  }
}
