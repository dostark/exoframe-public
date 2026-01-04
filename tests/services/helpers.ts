import { RequestRouter } from "../../src/services/request_router.ts";

export function createMockFlowRunner() {
  class MockFlowRunner {
    executedFlows: Array<{ flow: any; request: any }> = [];

    execute(flow: any, request: any): Promise<any> {
      this.executedFlows.push({ flow, request });
      return Promise.resolve({ success: true, flowId: flow.id, output: `Flow ${flow.id} executed` });
    }
  }
  return new MockFlowRunner();
}

export function createMockAgentRunner() {
  class MockAgentRunner {
    executedAgents: Array<{ blueprint: any; request: any }> = [];

    run(blueprint: any, request: any): Promise<any> {
      this.executedAgents.push({ blueprint, request });
      return Promise.resolve({
        success: true,
        agentId: blueprint.agentId,
        output: `Agent ${blueprint.agentId} executed`,
      });
    }
  }
  return new MockAgentRunner();
}

export function createMockFlowValidator() {
  class MockFlowValidator {
    validFlows = new Set(["code-review", "deploy", "research"]);
    invalidFlows = new Set(["broken-flow", "missing-deps"]);

    validateFlow(flowId: string): Promise<{ valid: boolean; error?: string }> {
      if (this.validFlows.has(flowId)) {
        return Promise.resolve({ valid: true });
      }
      if (this.invalidFlows.has(flowId)) {
        return Promise.resolve({ valid: false, error: `Flow '${flowId}' has validation errors` });
      }
      return Promise.resolve({ valid: false, error: `Flow '${flowId}' not found` });
    }
  }

  return new MockFlowValidator();
}

export function createMockEventLogger() {
  class MockEventLogger {
    events: Array<{ action: string; target: string; payload?: any; traceId?: string }> = [];

    log(event: any) {
      this.events.push(event);
    }
  }

  return new MockEventLogger();
}

export function createTestRequestRouter(
  {
    flowRunner,
    agentRunner,
    flowValidator,
    logger,
    defaultAgent = "default-agent",
    blueprintsPath = "/tmp/blueprints",
  }: any,
) {
  class TestRequestRouter extends RequestRouter {
    private mockBlueprints: Map<string, any> = new Map();

    constructor() {
      super(flowRunner, agentRunner, flowValidator, logger, defaultAgent, blueprintsPath);
      this.mockBlueprints.set("senior-coder", { agentId: "senior-coder", name: "Senior Coder" });
      this.mockBlueprints.set("default-agent", { agentId: "default-agent", name: "Default Agent" });
    }

    protected override loadBlueprint(agentId: string): Promise<any> {
      return Promise.resolve(this.mockBlueprints.get(agentId) || null);
    }
  }

  return new TestRequestRouter();
}

export function sampleRouterRequest(overrides: Record<string, any> = {}) {
  return {
    traceId: overrides.traceId ?? "test-trace-123",
    requestId: overrides.requestId ?? "req-123",
    frontmatter: overrides.frontmatter ?? {},
    body: overrides.body ?? "Test request body",
    ...overrides,
  };
}

/**
 * Creates a complete test context for RequestRouter tests with all mocks wired up.
 * Reduces boilerplate in tests that repeat the same setup pattern.
 */
export function createRouterTestContext(overrides: {
  defaultAgent?: string;
  blueprintsPath?: string;
} = {}) {
  const mockFlowRunner = createMockFlowRunner();
  const mockAgentRunner = createMockAgentRunner();
  const mockFlowValidator = createMockFlowValidator();
  const mockLogger = createMockEventLogger();
  const router = createTestRequestRouter({
    flowRunner: mockFlowRunner,
    agentRunner: mockAgentRunner,
    flowValidator: mockFlowValidator,
    logger: mockLogger,
    defaultAgent: overrides.defaultAgent ?? "default-agent",
    blueprintsPath: overrides.blueprintsPath ?? "/tmp/blueprints",
  });

  return {
    mockFlowRunner,
    mockAgentRunner,
    mockFlowValidator,
    mockLogger,
    router,
  };
}
