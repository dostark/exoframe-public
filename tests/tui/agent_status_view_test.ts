import {
  AgentHealth,
  AgentLogEntry,
  AgentService,
  AgentStatus,
  AgentStatusView,
} from "../../src/tui/agent_status_view.ts";

// Mock AgentService for testing

class MockAgentService implements AgentService {
  listAgents(): Promise<AgentStatus[]> {
    return Promise.resolve([
      {
        id: "agent1",
        name: "Agent 1",
        model: "gpt-4",
        status: "active",
        lastActivity: new Date().toISOString(),
        capabilities: ["code", "chat"],
      },
      {
        id: "agent2",
        name: "Agent 2",
        model: "gpt-3",
        status: "inactive",
        lastActivity: new Date().toISOString(),
        capabilities: ["chat"],
      },
    ]);
  }
  getAgentHealth(_agentId: string): Promise<AgentHealth> {
    return Promise.resolve({
      status: "healthy",
      issues: [],
      uptime: 12345,
    });
  }
  getAgentLogs(_agentId: string, _limit = 50): Promise<AgentLogEntry[]> {
    return Promise.resolve([
      {
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Test log entry",
      },
    ]);
  }
}

Deno.test("AgentStatusView: renders agent list", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const output = await view.renderAgentList();
  if (!output.includes("Agent 1") || !output.includes("Agent 2")) {
    throw new Error("Agent names not rendered");
  }
});

Deno.test("AgentStatusView: fetches agent health", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const health = await view.getAgentHealth("agent1");
  if (health.status !== "healthy" || health.uptime !== 12345) {
    throw new Error("Agent health not fetched correctly");
  }
});

Deno.test("AgentStatusView: fetches agent logs", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const logs = await view.getAgentLogs("agent1");
  if (!logs.length || logs[0].message !== "Test log entry") {
    throw new Error("Agent logs not fetched correctly");
  }
});
