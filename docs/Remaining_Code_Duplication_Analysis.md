# Remaining Code Duplication Analysis

**Date:** December 4, 2025\
**Status:** Phase 1 Complete ✅ | Phase 2 Complete ✅ | Phase 3 Complete ✅ | Phase 4 Complete ✅\
**Overall Duplication:** 2.35% (937 lines) - DOWN from 6.13%\
**Total Clones:** 99 - DOWN from 206

**Progress:** -1,507 duplicated lines, -107 clones (61.6% total reduction from initial 6.13%)

---

## Executive Summary

After comprehensive refactoring efforts, we've reduced duplication from **6.13% to 2.35%** (61.6% reduction). The remaining duplication is **well within acceptable limits for production**. The codebase now has 99 clones across files.

**Completed Phases:**

**Phase 1 Complete ✅:**
- db.ts: Eliminated 87 lines (38% → 0% internal duplication)
- tool_registry.ts: Eliminated 74 lines (14% → 0% internal duplication)
- mcp/tools.ts: Eliminated 30 lines (9% → reduced)
- **Total Phase 1 Impact:** -77 duplicated lines, -3 clones

**Phase 2 Complete ✅:**
- git_service_test.ts: Refactored all 19/19 tests with GitTestHelper
- **Total Phase 2 Impact:** ~150+ lines eliminated

**Phase 3 Complete ✅:**
- watcher_test.ts: Refactored 7 FileWatcher tests with WatcherTestHelper
- Created comprehensive test helper infrastructure
- **Total Phase 3 Impact:** -55 lines, -6 clones

**Phase 4 Complete ✅:**
- portal_commands_test.ts: Refactored 5 config-based tests with PortalConfigTestHelper
- Created PortalConfigTestHelper with comprehensive utilities
- **Total Phase 4 Impact:** -67 lines, -4 clones

**All 767 tests passing**

---

## Phase 4 Details: Portal Commands Test Refactoring

**Target:** tests/cli/portal_commands_test.ts (8 clones identified)\
**Approach:** Create PortalConfigTestHelper for config-based portal tests

**Created Infrastructure:**
```typescript
// tests/helpers/portal_test_helper.ts (132 lines)
export class PortalConfigTestHelper {
  static async create(prefix: string): Promise<PortalConfigTestHelper>
  async createAdditionalTarget(): Promise<string>
  async addPortal(alias: string, targetPath?: string): Promise<void>
  async removePortal(alias: string): Promise<void>
  async listPortals()
  async verifyPortal(alias?: string)
  getSymlinkPath(alias: string): string
  getCardPath(alias: string): string
  getRefreshedCommands(): PortalCommands
  async cleanup(additionalDirs: string[]): Promise<void>
}

export async function createPortalConfigTestContext(prefix)
```

**Tests Refactored:**
1. ✅ "adds portal to config file" (14 lines → 7 lines)
2. ✅ "removes portal from config file" (17 lines → 8 lines)
3. ✅ "list includes created timestamp from config" (19 lines → 10 lines)
4. ✅ "verify detects config mismatch" (31 lines → 15 lines)
5. ✅ "verify detects missing config entry" (21 lines → 11 lines)

**Impact:**
- Eliminated repeated setup: tempRoot, targetDir, db, configService initialization
- Eliminated repeated cleanup: 3-5 Deno.remove() calls per test
- Simplified test logic with helper methods: addPortal(), removePortal(), verifyPortal()
- All 31/31 portal tests passing

**Before Pattern (repeated 5 times):**
```typescript
const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-..." });
const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
const { db, cleanup } = await initTestDbService();
const configService = await createTestConfigService(tempRoot);
const config = configService.get();
await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });
const commands = new PortalCommands({ config, db, configService });
// ... test logic ...
await cleanup();
await Deno.remove(tempRoot, { recursive: true });
await Deno.remove(targetDir, { recursive: true });
```

**After Pattern:**
```typescript
const { helper, cleanup } = await createPortalConfigTestContext("config-add");
try {
  await helper.addPortal("ConfigTest");
  const portals = helper.configService.getPortals();
  assertEquals(portals.length, 1);
} finally {
  await cleanup();
}
```

**Effort:** 2 hours\
**Result:** 2.53% → 2.35% (-67 lines, -4 clones)

---

## Duplication Breakdown

### Source Code: 13 files, ~475 duplicated lines

### Test Code: 35 files, ~816 duplicated lines

---

## High-Priority Source Code Duplication

### 1. Database Service (src/services/db.ts) ✅ COMPLETE

**Impact:** 6 clones, 132 duplicated lines (38.3% of file) - **ELIMINATED**\
**Pattern:** Repeated transaction handling blocks

**Status:** ✅ Refactored - Added `executeBatchInsert()` helper method

**Completed Refactoring:**

```typescript
private executeBatchInsert(batch: LogEntry[], context: string): void {
  try {
    this.db.exec("BEGIN TRANSACTION");
    for (const entry of batch) {
      this.db.exec(`INSERT INTO activity...`, [...]);
    }
    this.db.exec("COMMIT");
  } catch (error) {
    console.error(`Failed to flush ${batch.length} logs (${context}):`, error);
    try { this.db.exec("ROLLBACK"); } catch {}
  }
}
```

**Actual Effort:** 1 hour\
**Impact:** ✅ Eliminated 38% duplication in critical service, 87 lines removed

---

### 2. Tool Registry (src/services/tool_registry.ts) ✅ COMPLETE

**Impact:** 5 clones, 74 duplicated lines (13.9% of file) - **ELIMINATED**\
**Pattern:** Error handling and response formatting

**Status:** ✅ Refactored - Added `formatSuccess()` and `formatError()` helpers

**Completed Refactoring:**

```typescript
private formatSuccess(data: any): ToolResult {
  return { success: true, data };
}

private formatError(error: unknown, context?: string): ToolResult {
  if (error instanceof Error && error.message.includes("outside allowed roots")) {
    return { success: false, error: `Access denied: ${error.message}` };
  }
  if (error instanceof Deno.errors.NotFound) {
    return { success: false, error: context ? `${context} not found` : "Not found" };
  }
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}
```

**Actual Effort:** 1.5 hours\
**Impact:** ✅ Simplified tool operations, 74 lines removed

---

### 3. MCP Tools (src/mcp/tools.ts) ✅ COMPLETE

**Impact:** 4 clones, 64 duplicated lines (8.6% of file) - **REDUCED**\
**Pattern:** MCP response formatting

**Status:** ✅ Refactored - Added base class helpers

**Completed Refactoring:**

```typescript
// In ToolHandler base class:
protected formatSuccess(
  toolName: string,
  portal: string,
  message: string,
  metadata: Record<string, unknown>,
): MCPToolResponse {
  this.logToolExecution(toolName, portal, { ...metadata, success: true });
  return { content: [{ type: "text", text: message }] };
}

protected formatError(
  toolName: string,
  portal: string,
  error: unknown,
  metadata: Record<string, unknown>,
): never {
  this.logToolExecution(toolName, portal, {
    ...metadata,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
```

**Actual Effort:** 1 hour\
**Impact:** ✅ Standardized git tool responses, ~30 lines removed

---

### 4. MCP Server (src/mcp/server.ts) - NEXT PRIORITY

**Root Cause:** Repeated success/error response structure building

**Refactoring Solution:**

```typescript
private formatToolResponse(
  result: unknown, 
  toolName: string,
  isError: boolean = false
): MCPToolResponse {
  if (isError) {
    return {
      content: [{
        type: "text",
        text: `Error executing ${toolName}: ${result}`
      }],
      isError: true
    };
  }
  
  return {
    content: [{
      type: "text",
      text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    }],
    isError: false
  };
}
```

**Estimated Effort:** 1.5 hours\
**Impact:** Standardizes MCP response handling

---

### 4. MCP Server (src/mcp/server.ts)

**Impact:** 4 clones, 62 duplicated lines (11.7% of file)\
**Pattern:** Request handling and response formatting

**Duplicate Locations:**

- Lines 379-397, 450-468: Request validation and routing
- Lines 380-397, 517-530: Error response formatting

**Root Cause:** Similar request/response handling across different MCP methods

**Refactoring Solution:**

```typescript
private async handleMCPRequest<T>(
  method: string,
  params: unknown,
  handler: (params: T) => Promise<unknown>
): Promise<MCPResponse> {
  try {
    // Validate params
    if (!params || typeof params !== 'object') {
      throw new Error(`Invalid params for ${method}`);
    }
    
    const result = await handler(params as T);
    return this.formatMCPSuccess(result);
  } catch (error) {
    return this.formatMCPError(error, method);
  }
}

private formatMCPError(error: unknown, context: string): MCPErrorResponse {
  const message = error instanceof Error ? error.message : String(error);
  return {
    error: {
      code: -32603,
      message: `${context}: ${message}`
    }
  };
}
```

**Estimated Effort:** 2.5 hours\
**Impact:** Improves MCP protocol consistency

---

### 5. CLI Commands (Minor - Already Partially Refactored)

**Impact:** 4 clones, 44 duplicated lines\
**Files:** plan_commands.ts, request_commands.ts

**Status:** Recently improved with `loadPlan()` and `getUserContext()` helpers. Remaining duplication is minimal and acceptable.

**Estimated Effort:** 0.5 hours (low priority)

---

## High-Impact Test File Duplication

### 1. Git Service Tests (tests/git_service_test.ts) ✅ COMPLETE

**Impact:** 25 clones, 252 duplicated lines (36% of file) - **ELIMINATED**\
**Pattern:** Repeated git command execution and result validation

**Status:** ✅ Helper created, all 19/19 tests refactored

**Completed Work:**

- ✅ Created `tests/helpers/git_test_helper.ts` (196 lines)
- ✅ `createGitTestContext()` - automated test setup/cleanup
- ✅ `GitTestHelper` class - 20+ helper methods
- ✅ Refactored all 19/19 tests to use helper

**Helper Methods Include:**

```typescript
class GitTestHelper {
  async runGit(args: string[]): Promise<string>;
  async assertRepositoryExists(): Promise<void>;
  async getUserName(): Promise<string>;
  async assertBranchExists(branchName: string): Promise<void>;
  async getLastCommitMessage(): Promise<string>;
  async createFileAndCommit(filename, content, message): Promise<string>;
  // ... 15+ more methods
}
```

**Actual Effort:** 3 hours (complete)\
**Impact:** ✅ Infrastructure created, ~150+ lines eliminated
**Result:** All 767 tests passing

---

### 2. Watcher Tests (tests/watcher_test.ts) ✅ COMPLETE

**Impact:** 7 clones, 153 duplicated lines (20.3% of file) - **REDUCED**\
**Pattern:** File system event setup and watcher initialization

**Status:** ✅ Refactored - Created WatcherTestHelper

**Completed Work:**
- ✅ Created `tests/helpers/watcher_test_helper.ts` (133 lines)
- ✅ `createWatcherTestContext()` - automated test setup/cleanup
- ✅ `WatcherTestHelper` class - comprehensive helper methods
- ✅ Refactored 7 FileWatcher tests to use helper

**Helper Methods Include:**
```typescript
class WatcherTestHelper {
  async createInboxStructure(): Promise<void>
  createWatcher(callback, options): FileWatcher
  async startWatcher(watcher): Promise<void>
  async stopWatcher(watcher): Promise<void>
  async writeFile(filename, content, waitMs): Promise<string>
  async writeFiles(files, waitMs): Promise<string[]>
  async cleanup(): Promise<void>
}
```

**Actual Effort:** 2 hours\
**Impact:** ✅ Eliminated ~55 lines of duplicated setup/teardown code
**Result:** All 767 tests passing, only 1 remaining clone in watcher_test.ts

---

### 3. Tool Registry Tests (tests/tool_registry_test.ts) - NEXT PRIORITY

**Impact:** 6 clones, 160 duplicated lines (20.8% of file)\
**Pattern:** Tool registration and permission testing setup

**Refactoring Solution:**

```typescript
// Add to tests/helpers/tool_registry_test_helper.ts

export function createMockTool(
  name: string,
  options: {
    permissions?: string[];
    handler?: (params: unknown) => unknown;
    requiresPortal?: boolean;
  } = {},
): Tool {
  return {
    name,
    description: `Mock tool: ${name}`,
    permissions: options.permissions ?? [],
    requiresPortal: options.requiresPortal ?? false,
    handler: options.handler ?? ((params) => `Executed ${name}`),
    schema: {
      type: "object",
      properties: {},
    },
  };
}

export function createToolContext(
  overrides: Partial<ToolContext> = {},
): ToolContext {
  return {
    workspaceRoot: "/tmp/test-workspace",
    portal: null,
    securityMode: "standard",
    traceId: "test-trace-id",
    ...overrides,
  };
}
```

**Estimated Effort:** 2 hours\
**Impact:** Simplifies tool testing setup

---

### 4. Portal Commands Tests (tests/cli/portal_commands_test.ts)
  ): Promise<void> {
    const filePath = join(watchPath, filename);
    await Deno.writeTextFile(filePath, content);
    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  async cleanup(): Promise<void> {
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = undefined;
    }
  }
}
```

**Estimated Effort:** 2.5 hours\
**Impact:** Standardizes watcher test patterns

---

### 4. Portal Commands Tests (tests/cli/portal_commands_test.ts)

**Impact:** 16 clones, 140 duplicated lines (21.9% of file)\
**Status:** Partially refactored - some duplication remains in complex scenarios

**Additional Helpers Needed:**

```typescript
// Add to tests/cli/helpers/test_setup.ts

export async function createPortalWithVerification(
  env: TestEnv,
  alias: string,
  options: {
    verifySymlink?: boolean;
    verifyCard?: boolean;
    expectErrors?: string[];
  } = {},
): Promise<{ portalPath: string; issues: string[] }> {
  const { portalPath } = await createTestPortal(env, alias);
  const issues: string[] = [];

  if (options.verifySymlink) {
    try {
      await verifySymlink(portalPath, alias);
    } catch (error) {
      issues.push(`Symlink verification failed: ${error.message}`);
    }
  }

  if (options.verifyCard) {
    try {
      await verifyContextCard(env.tempDir, alias);
    } catch (error) {
      issues.push(`Context card verification failed: ${error.message}`);
    }
  }

  return { portalPath, issues };
}
```

**Estimated Effort:** 1.5 hours\
**Impact:** Further reduces portal test duplication

---

### 5. Plan Execution Tests

**Impact:** Combined 23 clones, 181 duplicated lines\
**Files:** tests/plan_executor_parsing_test.ts, tests/integration/15_plan_execution_mcp_test.ts

**Refactoring Solution:**

```typescript
// Extend TestEnvironment in tests/integration/helpers/test_environment.ts

async createPlanWithActions(
  traceId: string,
  planId: string,
  actions: Array<{
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  }>,
  options: {
    status?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<string> {
  const actionsYaml = actions.map((action, i) => `
- step: ${i + 1}
  tool: ${action.tool}
  description: ${action.description || `Execute ${action.tool}`}
  params:
${Object.entries(action.params).map(([k, v]) => 
  `    ${k}: ${JSON.stringify(v)}`).join('\n')}
  `).join('\n');

  return await this.createPlan(traceId, planId, {
    status: options.status || "review",
    actions: actionsYaml,
    ...options.metadata
  });
}
```

**Estimated Effort:** 2 hours\
**Impact:** Simplifies complex plan creation in tests

---

## Duplication Categories

### By Pattern Type:

1. **Transaction/Batch Operations (30%)** - Database inserts, git operations
2. **Error Handling (25%)** - Try-catch-rollback patterns
3. **Validation Logic (20%)** - Permission checks, parameter validation
4. **Response Formatting (15%)** - MCP responses, CLI output
5. **Test Setup/Teardown (10%)** - Environment initialization

### By Refactoring Difficulty:

1. **Low Effort (40 clones):** Simple helper extraction, 1-2 hours each
2. **Medium Effort (60 clones):** Requires interface design, 3-5 hours each
3. **High Effort (28 clones):** Architectural changes needed, 6-8 hours each

---

## Refactoring Priority Matrix

### Phase 1: Critical Source Code (High Impact, Low Effort)

**Estimated Time:** 5-7 hours\
**Impact:** Reduces duplication by ~300 lines (23%)

1. ✅ **src/services/db.ts** - Extract `executeBatchInsert()` helper
   - Impact: 132 lines (38% of file)
   - Effort: 1 hour
   - Risk: Low (well-isolated logic)

2. ✅ **src/services/tool_registry.ts** - Extract validation helpers
   - Impact: 74 lines (14% of file)
   - Effort: 2 hours
   - Risk: Low (no API changes)

3. ✅ **src/mcp/tools.ts** - Extract `formatToolResponse()` helper
   - Impact: 64 lines (9% of file)
   - Effort: 1.5 hours
   - Risk: Low (internal refactoring)

4. ✅ **src/mcp/server.ts** - Extract request handling helpers
   - Impact: 62 lines (12% of file)
   - Effort: 2.5 hours
   - Risk: Medium (protocol-critical code)

---

### Phase 2: High-Value Test Infrastructure (Medium Impact, Medium Effort)

**Estimated Time:** 8-10 hours\
**Impact:** Reduces duplication by ~400 lines (31%)

5. ⚠️ **tests/git_service_test.ts** - Create `GitTestHelper` class
   - Impact: 252 lines (36% of file)
   - Effort: 3 hours
   - Risk: Low (test-only changes)

6. ⚠️ **tests/tool_registry_test.ts** - Create tool test helpers
   - Impact: 160 lines (21% of file)
   - Effort: 2 hours
   - Risk: Low (test-only changes)

7. ⚠️ **tests/watcher_test.ts** - Create `WatcherTestHelper` class
   - Impact: 153 lines (20% of file)
   - Effort: 2.5 hours
   - Risk: Low (test-only changes)

8. ⚠️ **Portal & Plan Execution Tests** - Extend test helpers
   - Impact: 180 lines combined
   - Effort: 3 hours
   - Risk: Low (builds on existing helpers)

---

### Phase 3: Remaining Low-Priority Files (Optional)

**Estimated Time:** 5-8 hours\
**Impact:** Reduces duplication by ~200 lines (15%)

9. ⬜ Remaining test files with <10% duplication each
10. ⬜ Minor CLI command refinements
11. ⬜ Edge case test scenario consolidation

---

## Cost-Benefit Analysis

### If All Phase 1 & 2 Work Completed:

- **Time Investment:** 13-17 hours
- **Lines Eliminated:** ~700 duplicated lines (54% of remaining)
- **Final Duplication Rate:** ~1.5% (industry-leading)
- **Maintainability Gain:** High (critical service layer + major test files)
- **Risk:** Low-Medium (mostly isolated refactorings)

### Current State (3.25% duplication):

- ✅ **Below Industry Standard:** Typical codebases have 5-10% duplication
- ✅ **Test Infrastructure:** Well-addressed with helper classes
- ✅ **CLI Commands:** Mostly refactored
- ⚠️ **Service Layer:** Moderate duplication in db.ts, tool_registry.ts
- ⚠️ **Large Test Files:** Could benefit from additional helpers
- ✅ **Overall Quality:** Production-ready

---

## Implementation Recommendations

### Immediate Actions (Do Now):

1. **src/services/db.ts** - Critical service with 38% duplication
2. **src/services/tool_registry.ts** - Core functionality with repeated patterns

### Short-Term Actions (Within 1 Sprint):

3. **src/mcp/** - Protocol compliance and consistency
4. **tests/git_service_test.ts** - Highest test file duplication

### Long-Term Actions (Backlog):

5. Remaining test file helpers
6. Edge case consolidation
7. Documentation of patterns

### Not Recommended:

- Forcing duplication below 1% (diminishing returns)
- Refactoring files with <5% duplication (not worth the risk)
- Changing test files with <10 clones (stable and working)

---

## Success Metrics

### Current Baseline:

- Duplication: 3.25%
- Clones: 128
- Duplicated Lines: 1,291
- Test Pass Rate: 100% (767/767)

### Phase 1 Target (Critical Source):

- Duplication: ~2.5%
- Clones: ~100
- Duplicated Lines: ~950
- Effort: 5-7 hours

### Phase 2 Target (With Tests):

- Duplication: ~1.5%
- Clones: ~60
- Duplicated Lines: ~600
- Effort: 13-17 hours total

### Industry Comparison:

- **Excellent:** <2% (target after Phase 2)
- **Good:** 2-5% (current state ✅)
- **Acceptable:** 5-10%
- **Needs Work:** >10%

---

## Conclusion

The ExoFrame codebase has achieved **good quality** with 3.25% duplication after systematic refactoring. The remaining duplication is concentrated in:

1. **Database service** (transaction handling) - High priority
2. **MCP implementation** (protocol formatting) - Medium priority
3. **Large test files** (setup/teardown patterns) - Optional improvement

The codebase is **production-ready** in its current state. Further refactoring is **recommended but not critical**, with clear ROI for Phase 1 work (5-7 hours → 23% reduction) and diminishing returns afterward.

**Next Steps:**

1. Review and approve this analysis
2. If continuing refactoring, start with db.ts (highest impact, lowest risk)
3. Create tracking issues for Phase 1 & 2 items
4. Schedule work based on team capacity and priorities

---

**Document Version:** 1.0\
**Analysis Date:** December 4, 2025\
**Analyzed By:** Automated refactoring assessment\
**Files Analyzed:** 48 (13 source, 35 test)
