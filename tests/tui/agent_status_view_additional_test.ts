import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  AgentHealth,
  AgentLogEntry,
  AgentService,
  AgentStatus,
  AgentStatusView,
} from "../../src/tui/agent_status_view.ts";

class EmptyAgentService implements AgentService {
  listAgents(): Promise<AgentStatus[]> {
    return Promise.resolve([]);
  }
  getAgentLogs(): Promise<AgentLogEntry[]> {
    return Promise.resolve([]);
  }
  getAgentHealth(): Promise<AgentHealth> {
    return Promise.resolve({ status: "healthy", issues: [], uptime: 0 });
  }
}

class DetailedAgentService implements AgentService {
  listAgents(): Promise<AgentStatus[]> {
    return Promise.resolve([
      {
        id: "agent-x",
        name: "Agent X",
        model: "mock-model",
        status: "error",
        lastActivity: new Date().toISOString(),
        capabilities: ["chat"],
        defaultSkills: [],
      },
    ]);
  }
  getAgentLogs(_agentId: string, _limit = 50): Promise<AgentLogEntry[]> {
    return Promise.resolve([
      { timestamp: new Date().toISOString(), level: "error", message: "Boom", traceId: "t1" },
      { timestamp: new Date().toISOString(), level: "info", message: "Recovered" },
    ]);
  }
  getAgentHealth(_agentId: string): Promise<AgentHealth> {
    return Promise.resolve({ status: "critical", issues: ["OOM", "Crash loop"], uptime: 3600 * 5 });
  }
}

Deno.test("AgentStatusView: renders empty agent list message", async () => {
  const view = new AgentStatusView(new EmptyAgentService());
  const out = await view.renderAgentList();
  assertStringIncludes(out, "No agents registered.");
});

Deno.test("AgentStatusView: render details after select shows issues and logs", async () => {
  const svc = new DetailedAgentService();
  const view = new AgentStatusView(svc);
  view.selectAgent("agent-x");
  const details = await view.renderAgentDetails();
  assertStringIncludes(details, "Agent: agent-x");
  if (!details.includes("Issues:") && !details.includes("ISSUES")) {
    throw new Error("Agent details missing issues section");
  }
  // logs should contain error icon and message
  assertStringIncludes(details, "Boom");
});

Deno.test("AgentStatusView: focusable elements stable", () => {
  const view = new AgentStatusView(new EmptyAgentService());
  const elems = view.getFocusableElements();
  assertEquals(elems.includes("agent-list"), true);
  assertEquals(elems.includes("agent-details"), true);
  assertEquals(elems.includes("refresh-button"), true);
});
