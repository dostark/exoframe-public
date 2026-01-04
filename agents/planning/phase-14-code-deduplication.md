# Phase 14: Code Deduplication Refactoring

**Status**: 📋 PLANNING
**Created**: 2026-01-04
**Tool Used**: `npx jscpd src/ tests/`

---

## Executive Summary

jscpd analysis reveals **300 code clones** across 243 files with **3,340 duplicated lines** (4.2% of codebase).

### Critical Findings

| Priority | Area | Duplication % | Files Affected | Tokens |
|----------|------|---------------|----------------|--------|
| 🔴 HIGH | AI Provider Tests | 91-127% | 3 | ~4000 |
| 🔴 HIGH | AI Providers (src) | 22-55% | 3 | ~600 |
| 🟠 MEDIUM | TUI View Tests | 47-48% | 2 | ~5200 |
| 🟠 MEDIUM | Service Tests | 77% (request_router) | 1 | ~700 |
| 🟡 LOW | Memory Dialogs | 25% | 1 | ~750 |
| 🟡 LOW | Execution Loop | 21% | 1 | ~450 |

---

## Phase 14.1: AI Provider Test Consolidation 🔴

**Files**:
- [tests/ai/openai_provider_test.ts](../../tests/ai/openai_provider_test.ts) - 127.72% duplication
- [tests/ai/anthropic_provider_test.ts](../../tests/ai/anthropic_provider_test.ts) - 91.41% duplication
- [tests/ai/google_provider_test.ts](../../tests/ai/google_provider_test.ts) - 62.72% duplication

**Detected Clones** (11-20 line blocks repeated across all 3 files):
```
Pattern: Mock setup + provider instantiation + generateText call + assertion
Lines affected: ~50 lines per file × 3 = 150 duplicated lines
```

**Refactoring Plan**:
1. Create `tests/ai/helpers/provider_test_helper.ts`:
   ```typescript
   export interface ProviderTestContext {
     createProvider: (config?: Partial<ProviderConfig>) => AIProvider;
     mockResponse: (response: string) => void;
     expectGeneratedText: (input: string, expected: string) => Promise<void>;
   }

   export function createProviderTestSuite(
     name: string,
     factory: () => AIProvider
   ): ProviderTestContext
   ```

2. Extract common test patterns:
   - `testBasicGeneration()`
   - `testStreamingResponse()`
   - `testErrorHandling()`
   - `testRateLimiting()`

**Estimated Impact**: Reduce 150 lines → 50 lines (66% reduction)

---

## Phase 14.2: AI Provider Source Consolidation 🔴

**Files**:
- [src/ai/providers/openai_provider.ts](../../src/ai/providers/openai_provider.ts) - 55.56% duplication
- [src/ai/providers/anthropic_provider.ts](../../src/ai/providers/anthropic_provider.ts) - 28.77% duplication
- [src/ai/providers/google_provider.ts](../../src/ai/providers/google_provider.ts) - 22.08% duplication

**Detected Clones**:
```typescript
// Pattern: Initialization logic (17-21 lines identical)
constructor(config: Config) {
  this.apiKey = config.apiKey || Deno.env.get("...");
  this.model = config.model || DEFAULT_MODEL;
  this.maxTokens = config.maxTokens || 4096;
  // ... same structure across all 3
}
```

**Refactoring Plan**:
1. Create `src/ai/providers/base_provider.ts`:
   ```typescript
   export abstract class BaseAIProvider implements AIProvider {
     protected apiKey: string;
     protected model: string;
     protected maxTokens: number;

     constructor(config: ProviderConfig, defaults: ProviderDefaults) {
       this.apiKey = config.apiKey || Deno.env.get(defaults.envKey) || "";
       this.model = config.model || defaults.defaultModel;
       this.maxTokens = config.maxTokens || defaults.maxTokens;
     }

     abstract generateText(prompt: string): Promise<string>;
     abstract streamText(prompt: string): AsyncIterable<string>;
   }
   ```

2. Refactor each provider to extend `BaseAIProvider`

**Estimated Impact**: Reduce 60 lines → 20 lines (66% reduction)

---

## Phase 14.3: TUI View Test Helpers 🟠

**Files**:
- [tests/tui/request_manager_view_test.ts](../../tests/tui/request_manager_view_test.ts) - 48.89% (396 lines duplicated)
- [tests/tui/monitor_view_test.ts](../../tests/tui/monitor_view_test.ts) - 47.46% (318 lines duplicated)

**Detected Clones**:
```typescript
// Pattern: View setup + mock creation + render + assertion (13-29 lines)
const mockContext = createMockTuiContext();
const view = new RequestManagerView(mockContext);
await view.render();
assertEquals(view.getSelectedIndex(), 0);
// Navigation tests repeat this pattern extensively
```

**Refactoring Plan**:
1. Extend `tests/tui/helpers.ts` with:
   ```typescript
   export class TuiViewTestHarness<T extends TuiView> {
     constructor(ViewClass: new (ctx: TuiContext) => T);
     async render(): Promise<void>;
     async pressKey(key: string): Promise<void>;
     async pressKeys(keys: string[]): Promise<void>;
     assertSelectedIndex(expected: number): void;
     assertRenderedContent(pattern: RegExp): void;
   }
   ```

2. Create shared navigation test suite:
   ```typescript
   export function testNavigationBehavior(harness: TuiViewTestHarness<any>) {
     // j/k navigation, search, selection
   }
   ```

**Estimated Impact**: Reduce 714 lines → 250 lines (65% reduction)

---

## Phase 14.4: Request Router Test Extraction 🟠

**Files**:
- [tests/services/request_router_test.ts](../../tests/services/request_router_test.ts) - 77.89% duplication

**Detected Clones**:
```typescript
// 15-line setup block repeated 5 times
const mockDb = createMockDb();
const router = new RequestRouter(mockDb);
const request = createTestRequest({ status: "pending" });
await router.route(request);
```

**Refactoring Plan**:
1. Create `tests/services/helpers/request_router_helper.ts`:
   ```typescript
   export function createRouterTestContext() {
     return {
       mockDb: createMockDb(),
       router: new RequestRouter(mockDb),
       createRequest: (overrides?: Partial<Request>) => createTestRequest(overrides),
       assertRouted: async (request: Request, expected: string) => {...}
     };
   }
   ```

**Estimated Impact**: Reduce 75 lines → 25 lines (66% reduction)

---

## Phase 14.5: Memory Dialogs Consolidation 🟡

**Files**:
- [src/tui/dialogs/memory_dialogs.ts](../../src/tui/dialogs/memory_dialogs.ts) - 25.15% duplication

**Detected Clones**:
```typescript
// 9-13 line blocks for field rendering repeated 6 times
const field = this.createTextField({
  label: "...",
  value: this.state.field,
  onChange: (v) => this.setState({ field: v }),
});
```

**Refactoring Plan**:
1. Create field factory method in `DialogBase`:
   ```typescript
   protected createBoundTextField(
     fieldName: keyof State,
     label: string,
     options?: TextFieldOptions
   ): TextField
   ```

**Estimated Impact**: Reduce 70 lines → 30 lines (57% reduction)

---

## Phase 14.6: Execution Loop Simplification 🟡

**Files**:
- [src/services/execution_loop.ts](../../src/services/execution_loop.ts) - 21.48% duplication

**Detected Clones**:
```typescript
// 13-29 line blocks for step execution (3 occurrences)
try {
  const result = await this.executeStep(step);
  await this.logStepResult(result);
  if (result.status === "error") {
    await this.handleStepError(result);
  }
} catch (err) {
  await this.handleStepException(err);
}
```

**Refactoring Plan**:
1. Extract `executeStepWithLogging()` method
2. Use strategy pattern for step handlers

**Estimated Impact**: Reduce 80 lines → 40 lines (50% reduction)

---

## Additional Candidates (Future Phases)

| File | Duplication | Lines | Notes |
|------|-------------|-------|-------|
| tests/cli/memory_commands_pending_test.ts | 43.53% | 143 | Similar to memory_commands_test.ts |
| tests/agents/self_improvement_process_test.ts | 43.13% | 71 | Cross-file with openai_enhancements |
| tests/mission_reporter_test.ts | 38.93% | 60 | Internal duplication |
| tests/mcp/server_prompts_test.ts | 37.13% | 45 | Can share with prompts_test.ts |
| tests/flows/define_flow_test.ts | 36.6% | 84 | Internal test setup |
| tests/helpers/env.ts | 35.29% | 6 | Minor, single pattern |
| tests/cli/exoctl_all_test.ts | 66 lines | - | 100% duplicate of exoctl_coverage_test.ts |

---

## Implementation Order

```
Phase 14.1 (AI Provider Tests)     ████████████  ~4 hours
Phase 14.2 (AI Providers Source)   ██████████    ~3 hours
Phase 14.3 (TUI View Tests)        ████████████  ~4 hours
Phase 14.4 (Request Router)        ████          ~1 hour
Phase 14.5 (Memory Dialogs)        ██████        ~2 hours
Phase 14.6 (Execution Loop)        ██████        ~2 hours
                                   ─────────────────────────
                                   Total: ~16 hours
```

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Total clones | 300 | < 150 |
| Duplicated lines | 3,340 | < 1,500 |
| Duplication % | 4.2% | < 2% |
| Files > 30% duplication | 18 | 0 |

---

## Rollback Plan

Each phase is independently reversible via git revert. Test coverage must be maintained (currently 656 TUI tests + others).

---

## References

- jscpd report: [jscpd-report/jscpd-report.json](../../jscpd-report/jscpd-report.json)
- Previous TUI work: [phase-13-tui-enhancement.md](phase-13-tui-enhancement.md)
- Testing guidelines: [agents/tests/testing.md](../tests/testing.md)
