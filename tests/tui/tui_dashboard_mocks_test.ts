import {
  MockAgentService,
  MockDaemonService,
  MockLogService,
  MockPlanService,
  MockPortalService,
  MockRequestService,
} from "../../src/tui/tui_dashboard_mocks.ts";

Deno.test("MockPortalService: returns portals", async () => {
  const service = new MockPortalService();
  const portals = await service.listPortals();
  if (!Array.isArray(portals)) throw new Error("Portals not array");
});

Deno.test("MockPlanService: returns pending plans", async () => {
  const service = new MockPlanService();
  const plans = await service.listPending();
  if (!Array.isArray(plans)) throw new Error("Plans not array");
});

Deno.test("MockLogService: returns recent activity", () => {
  const service = new MockLogService();
  const logs = service.getRecentActivity();
  if (!Array.isArray(logs)) throw new Error("Logs not array");
});

Deno.test("MockDaemonService: returns status", async () => {
  const service = new MockDaemonService();
  const status = await service.getStatus();
  if (!status) throw new Error("No daemon status");
});

Deno.test("MockRequestService: returns requests", async () => {
  const service = new MockRequestService();
  const requests = await service.listRequests();
  if (!Array.isArray(requests)) throw new Error("Requests not array");
});

Deno.test("MockAgentService: returns agent list", async () => {
  const service = new MockAgentService();
  const agents = await service.listAgents();
  if (!Array.isArray(agents)) throw new Error("Agent list not array");
});

Deno.test("MockPortalService: all methods", async () => {
  const service = new MockPortalService();
  const portals = await service.listPortals();
  if (!Array.isArray(portals)) throw new Error("Portals not array");
  const details = await service.getPortalDetails();
  if (typeof details !== "object" || !details.alias) throw new Error("Invalid portal details");
  if (await service.openPortal() !== true) throw new Error("openPortal failed");
  if (await service.closePortal() !== true) throw new Error("closePortal failed");
  if (await service.refreshPortal() !== true) throw new Error("refreshPortal failed");
  if (await service.removePortal() !== true) throw new Error("removePortal failed");
  if (typeof await service.quickJumpToPortalDir() !== "string") throw new Error("quickJumpToPortalDir failed");
  if (typeof await service.getPortalFilesystemPath() !== "string") throw new Error("getPortalFilesystemPath failed");
  if (!Array.isArray(service.getPortalActivityLog())) throw new Error("getPortalActivityLog failed");
});

Deno.test("MockPlanService: all methods", async () => {
  const service = new MockPlanService();
  if (!Array.isArray(await service.listPending())) throw new Error("listPending failed");
  if (typeof await service.getDiff() !== "string") throw new Error("getDiff failed");
  if (await service.approve() !== true) throw new Error("approve failed");
  if (await service.reject() !== true) throw new Error("reject failed");
});

Deno.test("MockLogService: all methods", () => {
  const service = new MockLogService();
  if (!Array.isArray(service.getRecentActivity())) throw new Error("getRecentActivity failed");
});

Deno.test("MockDaemonService: all methods", async () => {
  const service = new MockDaemonService();
  await service.start();
  await service.stop();
  await service.restart();
  if (typeof await service.getStatus() !== "string") throw new Error("getStatus failed");
  if (!Array.isArray(await service.getLogs())) throw new Error("getLogs failed");
  if (!Array.isArray(await service.getErrors())) throw new Error("getErrors failed");
});

Deno.test("MockRequestService: all methods", async () => {
  const service = new MockRequestService();
  const all = await service.listRequests();
  if (!Array.isArray(all)) throw new Error("listRequests failed");
  const pending = await service.listRequests("pending");
  if (!Array.isArray(pending) || pending.some((r) => r.status !== "pending")) {
    throw new Error("listRequests status filter failed");
  }
  const content = await service.getRequestContent("test-id");
  if (typeof content !== "string" || !content.includes("test-id")) throw new Error("getRequestContent failed");
  const newReq = await service.createRequest("desc", {
    priority: "high",
    agent: "test",
    portal: "main",
    model: "gpt-4",
  });
  if (typeof newReq !== "object" || newReq.priority !== "high" || newReq.agent !== "test") {
    throw new Error("createRequest failed");
  }
  if (await service.updateRequestStatus("id", "planned") !== true) throw new Error("updateRequestStatus failed");
});

Deno.test("MockAgentService: all methods", async () => {
  const service = new MockAgentService();
  const agents = await service.listAgents();
  if (!Array.isArray(agents) || agents.length < 2) throw new Error("listAgents failed");
  const health1 = await service.getAgentHealth("agent-1");
  if (health1.status !== "healthy" || health1.issues.length !== 0) throw new Error("getAgentHealth agent-1 failed");
  const health2 = await service.getAgentHealth("agent-2");
  if (health2.status !== "warning" || health2.issues.length !== 1) throw new Error("getAgentHealth agent-2 failed");
  const logs = await service.getAgentLogs("agent-1", 2);
  if (!Array.isArray(logs) || logs.length < 2) throw new Error("getAgentLogs failed");
});
