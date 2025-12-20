import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { RequestRouter, RoutingDecision, RoutingError } from "../../src/services/request_router.ts";

// Mock dependencies
class MockFlowRunner {
  executedFlows: Array<{ flow: any; request: any }> = [];

  async execute(flow: any, request: any): Promise<any> {
    this.executedFlows.push({ flow, request });
    return { success: true, flowId: flow.id, output: `Flow ${flow.id} executed` };
  }
}

class MockAgentRunner {
  executedAgents: Array<{ blueprint: any; request: any }> = [];

  async run(blueprint: any, request: any): Promise<any> {
    this.executedAgents.push({ blueprint, request });
    return { success: true, agentId: blueprint.agentId, output: `Agent ${blueprint.agentId} executed` };
  }
}

class MockFlowValidator {
  validFlows = new Set(["code-review", "deploy", "research"]);
  invalidFlows = new Set(["broken-flow", "missing-deps"]);

  async validateFlow(flowId: string): Promise<{ valid: boolean; error?: string }> {
    if (this.validFlows.has(flowId)) {
      return { valid: true };
    }
    if (this.invalidFlows.has(flowId)) {
      return { valid: false, error: `Flow '${flowId}' has validation errors` };
    }
    return { valid: false, error: `Flow '${flowId}' not found` };
  }
}

class MockEventLogger {
  events: Array<{ action: string; target: string; payload?: any; traceId?: string }> = [];

  log(event: any) {
    this.events.push(event);
  }
}

// Test-specific RequestRouter that mocks blueprint loading
class TestRequestRouter extends RequestRouter {
  private mockBlueprints: Map<string, any> = new Map();

  constructor(
    flowRunner: any,
    agentRunner: any,
    flowValidator: any,
    eventLogger: any,
    defaultAgentId: string,
    blueprintsPath: string,
  ) {
    super(flowRunner, agentRunner, flowValidator, eventLogger, defaultAgentId, blueprintsPath);
    // Set up mock blueprints
    this.mockBlueprints.set("senior-coder", { agentId: "senior-coder", name: "Senior Coder" });
    this.mockBlueprints.set("default-agent", { agentId: "default-agent", name: "Default Agent" });
  }

  protected override async loadBlueprint(agentId: string): Promise<any> {
    return this.mockBlueprints.get(agentId) || null;
  }
}

// Test RequestRouter class
Deno.test("RequestRouter: routes flow requests to FlowRunner", async () => {
  const mockFlowRunner = new MockFlowRunner();
  const mockAgentRunner = new MockAgentRunner();
  const mockFlowValidator = new MockFlowValidator();
  const mockLogger = new MockEventLogger();

  const router = new TestRequestRouter(
    mockFlowRunner as any,
    mockAgentRunner as any,
    mockFlowValidator as any,
    mockLogger as any,
    "default-agent",
    "/tmp/blueprints",
  );

  const request = {
    traceId: "test-trace-123",
    requestId: "req-123",
    frontmatter: { flow: "code-review" },
    body: "Test request body",
  };

  const result = await router.route(request);

  assertEquals(result.type, "flow");
  assertEquals(result.flowId, "code-review");
  assertEquals(mockFlowRunner.executedFlows.length, 1);
  assertEquals(mockFlowRunner.executedFlows[0].flow.id, "code-review");
  assertEquals(mockLogger.events.length, 2); // routing.flow + flow.validated
  assertEquals(mockLogger.events[0].action, "request.routing.flow");
});

Deno.test("RequestRouter: routes agent requests to AgentRunner", async () => {
  const mockFlowRunner = new MockFlowRunner();
  const mockAgentRunner = new MockAgentRunner();
  const mockFlowValidator = new MockFlowValidator();
  const mockLogger = new MockEventLogger();

  const router = new TestRequestRouter(
    mockFlowRunner as any,
    mockAgentRunner as any,
    mockFlowValidator as any,
    mockLogger as any,
    "default-agent",
    "/tmp/blueprints",
  );

  const request = {
    traceId: "test-trace-123",
    requestId: "req-123",
    frontmatter: { agent: "senior-coder" },
    body: "Test request body",
  };

  const result = await router.route(request);

  assertEquals(result.type, "agent");
  assertEquals(result.agentId, "senior-coder");
  assertEquals(mockAgentRunner.executedAgents.length, 1);
  assertEquals(mockAgentRunner.executedAgents[0].blueprint.agentId, "senior-coder");
  assertEquals(mockLogger.events[0].action, "request.routing.agent");
});

Deno.test("RequestRouter: routes requests without flow/agent to default agent", async () => {
  const mockFlowRunner = new MockFlowRunner();
  const mockAgentRunner = new MockAgentRunner();
  const mockFlowValidator = new MockFlowValidator();
  const mockLogger = new MockEventLogger();

  const router = new TestRequestRouter(
    mockFlowRunner as any,
    mockAgentRunner as any,
    mockFlowValidator as any,
    mockLogger as any,
    "default-agent",
    "/tmp/blueprints",
  );

  const request = {
    traceId: "test-trace-123",
    requestId: "req-123",
    frontmatter: {},
    body: "Test request body",
  };

  const result = await router.route(request);

  assertEquals(result.type, "agent");
  assertEquals(result.agentId, "default-agent");
  assertEquals(mockAgentRunner.executedAgents.length, 1);
  assertEquals(mockAgentRunner.executedAgents[0].blueprint.agentId, "default-agent");
  assertEquals(mockLogger.events[0].action, "request.routing.default");
});

Deno.test("RequestRouter: throws error for invalid flow ID", async () => {
  const mockFlowRunner = new MockFlowRunner();
  const mockAgentRunner = new MockAgentRunner();
  const mockFlowValidator = new MockFlowValidator();
  const mockLogger = new MockEventLogger();

  const router = new TestRequestRouter(
    mockFlowRunner as any,
    mockAgentRunner as any,
    mockFlowValidator as any,
    mockLogger as any,
    "default-agent",
    "/tmp/blueprints",
  );

  const request = {
    traceId: "test-trace-123",
    requestId: "req-123",
    frontmatter: { flow: "nonexistent-flow" },
    body: "Test request body",
  };

  await assertRejects(
    () => router.route(request),
    RoutingError,
    "Flow 'nonexistent-flow' not found",
  );

  assertEquals(mockLogger.events[0].action, "request.routing.flow");
});

Deno.test("RequestRouter: throws error for conflicting flow and agent fields", async () => {
  const mockFlowRunner = new MockFlowRunner();
  const mockAgentRunner = new MockAgentRunner();
  const mockFlowValidator = new MockFlowValidator();
  const mockLogger = new MockEventLogger();

  const router = new TestRequestRouter(
    mockFlowRunner as any,
    mockAgentRunner as any,
    mockFlowValidator as any,
    mockLogger as any,
    "default-agent",
    "/tmp/blueprints",
  );

  const request = {
    traceId: "test-trace-123",
    requestId: "req-123",
    frontmatter: { flow: "code-review", agent: "senior-coder" },
    body: "Test request body",
  };

  await assertRejects(
    () => router.route(request),
    RoutingError,
    "Request cannot specify both 'flow' and 'agent' fields",
  );
});

Deno.test("RequestRouter: flow takes priority over agent when both present (should not happen)", async () => {
  // This test verifies that if both fields are somehow present (bypassing validation),
  // flow takes priority. In practice, this should be prevented by the conflicting fields check.
  const mockFlowRunner = new MockFlowRunner();
  const mockAgentRunner = new MockAgentRunner();
  const mockFlowValidator = new MockFlowValidator();
  const mockLogger = new MockEventLogger();

  const router = new TestRequestRouter(
    mockFlowRunner as any,
    mockAgentRunner as any,
    mockFlowValidator as any,
    mockLogger as any,
    "default-agent",
    "/tmp/blueprints",
  );

  // Temporarily bypass the conflicting fields check for this test
  const originalRoute = router.route.bind(router);
  router.route = async function (request: any) {
    // Skip the conflicting fields check for this test
    const flowId = request.frontmatter.flow;
    const agentId = request.frontmatter.agent;

    if (flowId) {
      return await (router as any).routeToFlow.call(router, flowId, request);
    }
    if (agentId) {
      return await (router as any).routeToAgent.call(router, agentId, request);
    }
    return await (router as any).routeToDefaultAgent.call(router, request);
  };

  const request = {
    traceId: "test-trace-123",
    requestId: "req-123",
    frontmatter: { flow: "code-review", agent: "senior-coder" },
    body: "Test request body",
  };

  const result = await router.route(request);

  assertEquals(result.type, "flow");
  assertEquals(result.flowId, "code-review");
  assertEquals(mockFlowRunner.executedFlows.length, 1);
  assertEquals(mockAgentRunner.executedAgents.length, 0); // Agent should not be called
});
