import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { RoutingError } from "../../src/services/request_router.ts";

import {
  createMockAgentRunner,
  createMockEventLogger,
  createMockFlowRunner,
  createMockFlowValidator,
  createTestRequestRouter,
  sampleRouterRequest,
} from "./helpers.ts";

// Test-specific helpers are provided by tests/services/helpers.ts

// Test RequestRouter class
Deno.test("RequestRouter: routes flow requests to FlowRunner", async () => {
  const mockFlowRunner = createMockFlowRunner();
  const mockAgentRunner = createMockAgentRunner();
  const mockFlowValidator = createMockFlowValidator();
  const mockLogger = createMockEventLogger();

  const router = createTestRequestRouter({
    flowRunner: mockFlowRunner,
    agentRunner: mockAgentRunner,
    flowValidator: mockFlowValidator,
    logger: mockLogger,
    defaultAgent: "default-agent",
    blueprintsPath: "/tmp/blueprints",
  });

  const request = sampleRouterRequest({ frontmatter: { flow: "code-review" } });

  const result = await router.route(request);

  assertEquals(result.type, "flow");
  assertEquals(result.flowId, "code-review");
  assertEquals(mockFlowRunner.executedFlows.length, 1);
  assertEquals(mockFlowRunner.executedFlows[0].flow.id, "code-review");
  assertEquals(mockLogger.events.length, 2); // routing.flow + flow.validated
  assertEquals(mockLogger.events[0].action, "request.routing.flow");
});

Deno.test("RequestRouter: routes agent requests to AgentRunner", async () => {
  const mockFlowRunner = createMockFlowRunner();
  const mockAgentRunner = createMockAgentRunner();
  const mockFlowValidator = createMockFlowValidator();
  const mockLogger = createMockEventLogger();

  const router = createTestRequestRouter({
    flowRunner: mockFlowRunner,
    agentRunner: mockAgentRunner,
    flowValidator: mockFlowValidator,
    logger: mockLogger,
    defaultAgent: "default-agent",
    blueprintsPath: "/tmp/blueprints",
  });

  const request = sampleRouterRequest({ frontmatter: { agent: "senior-coder" } });

  const result = await router.route(request);

  assertEquals(result.type, "agent");
  assertEquals(result.agentId, "senior-coder");
  assertEquals(mockAgentRunner.executedAgents.length, 1);
  assertEquals(mockAgentRunner.executedAgents[0].blueprint.agentId, "senior-coder");
  assertEquals(mockLogger.events[0].action, "request.routing.agent");
});

Deno.test("RequestRouter: routes requests without flow/agent to default agent", async () => {
  const mockFlowRunner = createMockFlowRunner();
  const mockAgentRunner = createMockAgentRunner();
  const mockFlowValidator = createMockFlowValidator();
  const mockLogger = createMockEventLogger();

  const router = createTestRequestRouter({
    flowRunner: mockFlowRunner,
    agentRunner: mockAgentRunner,
    flowValidator: mockFlowValidator,
    logger: mockLogger,
    defaultAgent: "default-agent",
    blueprintsPath: "/tmp/blueprints",
  });

  const request = sampleRouterRequest({ frontmatter: {} });

  const result = await router.route(request);

  assertEquals(result.type, "agent");
  assertEquals(result.agentId, "default-agent");
  assertEquals(mockAgentRunner.executedAgents.length, 1);
  assertEquals(mockAgentRunner.executedAgents[0].blueprint.agentId, "default-agent");
  assertEquals(mockLogger.events[0].action, "request.routing.default");
});

Deno.test("RequestRouter: throws error for invalid flow ID", async () => {
  const mockFlowRunner = createMockFlowRunner();
  const mockAgentRunner = createMockAgentRunner();
  const mockFlowValidator = createMockFlowValidator();
  const mockLogger = createMockEventLogger();

  const router = createTestRequestRouter({
    flowRunner: mockFlowRunner,
    agentRunner: mockAgentRunner,
    flowValidator: mockFlowValidator,
    logger: mockLogger,
    defaultAgent: "default-agent",
    blueprintsPath: "/tmp/blueprints",
  });

  const request = sampleRouterRequest({ frontmatter: { flow: "nonexistent-flow" } });

  await assertRejects(
    () => router.route(request),
    RoutingError,
    "Flow 'nonexistent-flow' not found",
  );

  assertEquals(mockLogger.events[0].action, "request.routing.flow");
});

Deno.test("RequestRouter: throws error for conflicting flow and agent fields", async () => {
  const mockFlowRunner = createMockFlowRunner();
  const mockAgentRunner = createMockAgentRunner();
  const mockFlowValidator = createMockFlowValidator();
  const mockLogger = createMockEventLogger();

  const router = createTestRequestRouter({
    flowRunner: mockFlowRunner,
    agentRunner: mockAgentRunner,
    flowValidator: mockFlowValidator,
    logger: mockLogger,
    defaultAgent: "default-agent",
    blueprintsPath: "/tmp/blueprints",
  });

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
  const mockFlowRunner = createMockFlowRunner();
  const mockAgentRunner = createMockAgentRunner();
  const mockFlowValidator = createMockFlowValidator();
  const mockLogger = createMockEventLogger();

  const router = createTestRequestRouter({
    flowRunner: mockFlowRunner,
    agentRunner: mockAgentRunner,
    flowValidator: mockFlowValidator,
    logger: mockLogger,
    defaultAgent: "default-agent",
    blueprintsPath: "/tmp/blueprints",
  });

  // Temporarily bypass the conflicting fields check for this test
  const _originalRoute = router.route.bind(router);
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

  const request = sampleRouterRequest({ frontmatter: { flow: "code-review", agent: "senior-coder" } });

  const result = await router.route(request);

  assertEquals(result.type, "flow");
  assertEquals(result.flowId, "code-review");
  assertEquals(mockFlowRunner.executedFlows.length, 1);
  assertEquals(mockAgentRunner.executedAgents.length, 0); // Agent should not be called
});
