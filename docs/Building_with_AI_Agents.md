# Building with AI Agents: A Field Guide from the ExoFrame Trenches

_How I learned to stop worrying and love the TDD loop with an AI pair programmer_

## The Grand Experiment

This document chronicles the real-world experience of building ExoFrame—a meta-framework for AI agents to collaborate on software projects—while using AI agents to build it. Yes, the irony is delicious. Think of it as "eating our own dog food before the kitchen is even built."

What started as a design document review turned into a months-long dance of human intent meeting machine precision, with all the stumbles, surprises, and small victories that entails.

## Part I: The Design Review Dance

### The Opening Move: "What do you think?"

**The Setup**: I had three hefty design documents—a white paper, technical spec, and implementation plan—representing weeks of thinking about how autonomous agents should work together on real codebases.

**The Pattern**: Instead of asking the AI to _build_ anything, I started with:

> "Review these design documents. Tell me what's wrong."

**Why This Works**:

- AI agents are surprisingly good at spotting logical inconsistencies when they have context
- You get feedback without committing code
- The agent becomes familiar with your mental model before typing a single line

**What Happened**:
The agent caught things like:

- Missing error handling strategies
- Unclear boundaries between components
- Ambiguous success criteria in the implementation plan

**The Lesson**: Treat the AI like a skeptical senior engineer doing a design review. Don't defend your ideas—let them poke holes. Fix the holes _before_ writing code.

### The Identity Crisis: "Wait, who's making commits?"

**The Conversation**:

```
Me: "I believe that agentId should also be tracked in the event record."
Agent: [searches codebase, finds gaps]
Agent: "You're right. Currently only trace_id is logged. Adding agent_id..."
```

**Why This Matters**:
This wasn't in the original spec. It emerged from asking "what's missing?" after the design phase. The activity journal was tracking _what_ happened but not clearly _who_ did it.

**The Pattern**: Design documents are never complete. Keep asking:

- "What would make debugging easier?"
- "How would I audit this system?"
- "What context would Future Me need?"

**The Result**: Every log entry now carries both `trace_id` (what request) and `agent_id` (which agent), making the activity journal actually useful for debugging multi-agent chaos.

## Part II: The TDD Liturgy

### The Revelation: "Write tests first (no really, this time)"

**The Turning Point**:

```
Me: "Proceed with implementation of step 4.1 of Implementation Plan in TDD manner."
Agent: [writes 14 comprehensive tests]
Agent: [implements ToolRegistry to make tests pass]
Result: All tests green on first full run.
```

**Before TDD**:

- Implementation would drift from spec
- Edge cases discovered in production (or never)
- Refactoring felt like defusing a bomb blindfolded

**After TDD**:

- Tests became the real specification
- Implementation was just "make the red text green"
- Refactoring became boring (in a good way)

**The TDD Pattern with AI**:

1. **You**: "Implement X in TDD manner"
2. **Agent**: Writes comprehensive test suite covering:
   - Happy path (the thing works)
   - Sad path (graceful failures)
   - Security boundaries (path traversal, command injection)
   - Edge cases (empty inputs, duplicates, race conditions)
3. **Agent**: Implements feature to pass tests
4. **You**: Review tests (easier than reviewing implementation!)
5. **Agent**: Fixes issues
6. **Everyone**: Ships with confidence

**Why This Works With AI**:

- AI agents are _excellent_ at writing exhaustive test cases when prompted
- Test code is easier to review than implementation code
- Tests serve as executable documentation
- You catch misunderstandings before they're carved in code

### The Liturgy in Practice: GitService

**The Request**: "Proceed with step 4.2 of Implementation Plan in TDD"

**What The Agent Did**:

1. Read Implementation Plan section 4.2
2. Created 11 test cases covering:
   - Auto-initialize git repos
   - Auto-configure bot identity
   - Branch naming: `feat/{requestId}-{traceId}`
   - Handle duplicate branches (append timestamp)
   - Commit format with `[ExoTrace: {id}]` footer
   - Reject empty commits
   - Activity logging for all git operations
   - Error handling for git command failures
   - Works with existing repos

3. Implemented GitService with:
   - `ensureRepository()`
   - `ensureIdentity()`
   - `createBranch()`
   - `commit()`
   - All operations logged to Activity Journal

4. First test run: 2 failures
   - Identity check was reading global config instead of local
   - Error message didn't match test expectation

5. Fixed both issues

6. Final result: 10/10 tests passing, integrated with 97 existing tests

**Time Investment**: ~15 minutes of iteration

**Traditional Approach Estimate**: 2-3 hours of implementation, debugging, and testing

### The Anti-Pattern: "Just build it"

**What Doesn't Work**:

```
Me: "Add git integration"
Agent: [writes 300 lines of code]
Me: [reviews code, spots issues]
Me: "Actually, can you handle this edge case?"
Agent: [refactors, breaks something else]
[Repeat 5-10 times]
```

**The Problem**:

- Specification was in your head
- Agent guessed at requirements
- Changes cascade unpredictably
- No safety net

**The Fix**: Always start with "in TDD manner"

## Part III: The Performance Tango

### The Non-Blocking Plot Twist

**The Setup**: Activity logging was happening synchronously on every operation.

**The Question**:

```
Me: "Why logging is non-blocking?"
Agent: "Looking at the code... it's actually blocking. Each logActivity()
        call is a synchronous SQLite write."
```

**The Honesty**: The agent didn't pretend. It looked, saw the truth, and admitted the code wasn't doing what the comments claimed.

**The Options Presented**:

1. Fire-and-forget (lose some logs on crash)
2. Batched writes with periodic flush
3. Separate worker thread

**The Decision**:

```
Me: "Go with option 2"
Agent: [implements batched log queue]
Agent: [makes batch settings configurable]
Agent: [updates all tests to account for async flushing]
```

**The Pattern**: When performance matters:

- Ask the agent to _measure_ first (don't assume)
- Have it present tradeoffs (not solutions)
- Make it configurable (don't hardcode)
- Update tests to match new behavior

**The Result**: 10-50x throughput improvement with configurable `batch_flush_ms` and `batch_max_size` settings.

### The Deduplication Dance: Fighting Code Clones

**The Setup**: After months of TDD, the codebase had grown to 767 passing tests. Success! But with growth came duplication—especially in test setup/teardown code.

**The Measurement**:

```bash
npx jscpd src tests --reporters json --output ./report
```

**Initial State**: 6.13% duplication (2,444 lines, 206 clones)

**The Pattern**: Repeated test setup code appeared everywhere:

```typescript
// Repeated 31 times with variations
const tempDir = await Deno.makeTempDir({ prefix: "test-..." });
const { db, cleanup } = await initTestDbService();
try {
  const config = createMockConfig(tempDir);
  const registry = new ToolRegistry({ config, db });
  // ... test logic ...
} finally {
  await cleanup();
  await Deno.remove(tempDir, { recursive: true });
}
```

**The Solution**: Extract test helpers with the same TDD rigor applied to production code:

1. **Identify duplication patterns** using jscpd
2. **Create helper classes** that encapsulate repeated setup
3. **Provide semantic methods** that express test intent
4. **Refactor incrementally**, keeping all tests green

**The Transformation**:

```typescript
// After: Using ToolRegistryTestHelper
const { helper, cleanup } = await createToolRegistryTestContext("test");
try {
  const testFile = await helper.createKnowledgeFile("test.txt", "content");
  const result = await helper.execute("read_file", { path: testFile });
  await helper.waitForLogging();
  const logs = helper.getActivityLogs("tool.read_file");
  assertEquals(result.success, true);
} finally {
  await cleanup();
}
```

**The Results**:

- **Phase 1-4 Completed**: 6.13% → 2.35% (61.6% reduction)
- **Lines Eliminated**: -1,507 duplicated lines
- **Clones Removed**: -107 clones
- **Tests**: All 767 tests still passing ✅

**The Helpers Created**:

1. `GitTestHelper` - Git operations setup/teardown
2. `WatcherTestHelper` - FileWatcher test infrastructure
3. `ToolRegistryTestHelper` - Tool registry test contexts
4. `PortalConfigTestHelper` - Portal configuration tests

**The Lesson**: Code quality isn't just about production code. Test code deserves the same care:

- **DRY applies to tests** - Don't repeat setup/teardown
- **Measure duplication** - Use jscpd to identify patterns
- **Extract helpers systematically** - One test file at a time
- **Keep tests passing** - Refactor incrementally
- **Document patterns** - Future tests use the helpers

**The Command Pattern**:

```bash
# Measure current duplication
npx jscpd src tests --reporters json --output ./report

# Identify high-impact targets (most clones)

# After refactoring, verify improvement
npx jscpd src tests --reporters json --output ./report
```

**When To Refactor**:

- **After each major feature** - Don't let duplication accumulate
- **When tests become hard to write** - Missing helpers is a code smell
- **When duplication > 3%** - Set a threshold and enforce it
- **During code review** - Spot patterns before they multiply

### The Config Philosophy

**The Insight**: Every magic number should be a config option.

**What Got Configured**:

- Batch flush interval (default 100ms)
- Max batch size (default 100 entries)
- Watcher debounce timing
- File stability checks
- Token limits per context file

**The Request Pattern**:

```
Me: "Make batch timeouts 100 ms and 100 entries as default values
     of configuration options"
Agent: [updates schema.ts with validation]
Agent: [updates config sample files]
Agent: [updates tests with new config structure]
```

**Why This Works**: Future users can tune for their workload without touching code.

## Part IV: The Security Paranoia Phase

### The Trust Nobody Approach

**The Requirement**: PathResolver must prevent agents from escaping the workspace sandbox.

**The Test Suite** (Agent-Generated):

```typescript
// Happy path
PathResolver: resolves valid alias path ... ok

// Paranoid path
PathResolver: throws on path traversal attempt ... ok
PathResolver: throws on accessing file outside allowed roots ... ok
```

**The Implementation**: Canonical path resolution with strict boundary checking.

**What This Taught Me**:

- AI agents will write security tests if you ask
- The tests are thorough (path traversal, symlinks, parent directory escapes)
- Security is easier to verify with tests than code review

### The Command Whitelist

**The Requirement**: Agents can run commands, but not dangerous ones.

**The Pattern**:

```typescript
// Allowed
const SAFE_COMMANDS = [
  "echo",
  "git",
  "deno",
  "cat",
  "ls",
  "pwd",
  "node",
  "npm",
  "which",
  "whoami",
];

// Blocked at runtime
if (DANGEROUS_COMMANDS.some((bad) => command.includes(bad))) {
  throw new Error(`Dangerous command blocked: ${dangerous}`);
}
```

**The Test**:

```typescript
ToolRegistry: run_command - blocks dangerous commands ... ok
```

**The Lesson**: Whitelists beat blacklists. Let the AI propose the list, but you verify it's conservative enough.

## Part V: The Refactoring Revelations

### The Decorator Fiasco

**The Discovery**:

```
Me: "Are experimental decorators from tsconfig.json actually used
     anywhere in the code?"
Agent: [searches entire codebase]
Agent: "No. activity_logger.ts was created but never imported anywhere."
```

**The Cleanup**:

- Removed `activity_logger.ts` (unused @LogActivity decorator)
- Removed experimental decorator config from `deno.json`
- Simplified codebase

**The Pattern**: Periodically ask:

- "What code is never called?"
- "What config options are unused?"
- "What dependencies are imported but not needed?"

AI agents excel at searching for "zombie code" because they don't have emotional attachment to code they wrote last week.

### The False Positive Hunt

**The Situation**:

```
Me: "Address #get_errors"
Agent: [runs Deno type checker]
Agent: "No errors found. The VS Code language server is showing
        stale cache false positives."
```

**The Lesson**:

- Different tools report different "errors"
- Run the actual compiler/type checker
- VS Code's real-time checking can lag behind file system changes
- Trust `deno check` over IDE red squiggles

**The Action**: None needed. Agent verified with authoritative source.

## Part VI: The Patterns That Emerged

### Pattern 1: The Refinement Loop (Critical!)

**The Discovery**: Initial implementation steps are always too brief.

**The Pattern**:

```
Me: "Refine all steps of Phase 4 in the Implementation Plan"
Agent: [reads brief bullet points]
Agent: [expands each step with]:
  - Clear success criteria
  - Example inputs/outputs
  - Error cases to handle
  - Dependencies on other steps
  - Acceptance tests
```

**What Makes a Good Step Description**:

❌ **Too Brief** (what we started with):

```markdown
4.1 Tool Registry

- Map LLM function calls to Deno operations
- Provide read, write, list, search, run tools
```

✅ **Well-Refined** (what we ended with):

```markdown
4.1 Tool Registry

**Purpose**: Translate LLM function calls into safe Deno operations

**Success Criteria**:

- Register tools with JSON schemas (name, description, parameters)
- Implement 5 core tools: read_file, write_file, list_directory,
  search_files, run_command
- Validate all file paths through PathResolver (prevent traversal)
- Whitelist safe commands (block rm, dd, chmod, etc.)
- Log all tool executions to Activity Journal with trace_id
- Return structured results with success/error status

**Security Requirements**:

- All file operations must use PathResolver
- Command execution limited to whitelist
- No shell evaluation (use Deno.Command directly)

**Example**:
registry.execute("read_file",
{ path: "@blueprints/agent.md" })
→ { success: true, content: "..." }

**Tests Should Verify**:

- Tool registration with schemas
- Each tool's happy path
- Path traversal rejection
- Command whitelist enforcement
- Activity logging with agent_id
```

**The Refinement Trigger**: Before implementing _any_ phase, ask:

```
"Refine all steps in Phase X with success criteria, examples,
 error cases, and test requirements"
```

**Why This Works**:

- Forces you to think through edge cases up front
- Gives the AI a complete specification
- Tests practically write themselves
- Catches design flaws before coding
- Reduces back-and-forth iterations from ~10 to ~2

**The Rule**: If you can't write clear success criteria, you're not ready to implement.

### Pattern 2: Incremental Specificity (The Zoom Levels)

**Don't Start With**: "Build an AI agent framework"

**Start With**:

1. "Review this design doc" (zoom: 30,000 feet)
2. "Refine Phase 4 steps" (zoom: 10,000 feet)
3. "Add human-in-the-loop to step 4.4" (zoom: 1,000 feet)
4. "Implement step 4.1 in TDD manner" (zoom: ground level)

**Why**: Each step builds context. The AI learns your domain incrementally.

### Pattern 3: The Walking Skeleton (Ship Early, Fill Later)

**The Philosophy**: Get something end-to-end working first, then add features.

**How This Played Out in ExoFrame**:

**Phase 1 - The Skeleton** (Week 1):

1. Basic config loading ✅
2. Database initialization ✅
3. Simple activity logging ✅
4. File watcher (without stability checks) ✅
5. Minimal request parser ✅

**Result**: Could drop a request file, see it detected, parsed, and logged. Zero intelligence, but the pipes worked.

**Phase 2 - Add Meat** (Week 2):

1. Watcher stability verification ✅
2. Batched activity logging ✅
3. Context card generation ✅
4. Path resolver with security ✅

**Phase 3 - Add Organs** (Week 3-4):

1. Tool Registry (safe operations) ✅
2. Git Integration (identity-aware) ✅
3. Execution Loop (in progress)
4. Human review workflow (pending)

**The Walking Skeleton Pattern**:

```
Traditional Approach:
[Complete Feature A] → [Complete Feature B] → [Complete Feature C]
Problem: Can't test integration until month 3

Walking Skeleton:
[Minimal A] → [Minimal B] → [Minimal C] → [Test E2E] → [Enhance A] → ...
Benefit: Integration tested from day 1
```

**How to Apply**:

**❌ Don't**: Build Tool Registry with all 50 planned tools perfectly

**✅ Do**:

1. Build registry with 1 tool (`read_file`)
2. Wire it to execution loop
3. Make one agent use one tool
4. Verify end-to-end
5. Add 4 more tools
6. Add security validation
7. Add activity logging

**The Test**: "Can I demo this to someone?" should be "yes" every week.

**Why This Works with AI**:

- AI is great at adding features to working code
- AI is terrible at debugging integration issues across incomplete systems
- Walking skeleton gives you continuous integration testing
- Each addition is isolated and testable

**ExoFrame Walking Skeleton Timeline**:

| Week | Skeleton Capability                | Demo-able? |
| ---- | ---------------------------------- | ---------- |
| 1    | File drops are detected and logged | ✅ Yes     |
| 2    | Context cards generated from files | ✅ Yes     |
| 3    | Tools execute safely in sandbox    | ✅ Yes     |
| 4    | Git commits with trace IDs         | ✅ Yes     |

**The Rule**: If you can't demo progress weekly, you're not walking—you're building in the dark.

### Pattern 4: The Question->Action Loop

**The Loop**:

1. You ask a question
2. Agent investigates (searches, reads, measures)
3. Agent explains what it found
4. You decide
5. Agent implements

**Example**:

```
Q: "Why is logging non-blocking?"
A: [investigates] "It's not. Here's why..."
Q: "Go with option 2"
A: [implements batched logging]
```

**Why This Works**:

- You stay in control of decisions
- Agent does the research and implementation
- No wasted work on wrong assumptions

### Pattern 5: Test-First Everything

**The Mantra**: "In TDD manner"

**What It Triggers**:

- Agent writes tests covering success criteria
- You review tests (faster than reviewing implementation)
- Agent implements to pass tests
- Refactoring is safe

**Success Rate**: Nearly 100% first-pass correctness when tests are comprehensive.

### Pattern 6: The Configuration Escape Hatch

**The Rule**: Every hardcoded value is a future regret.

**The Pattern**:

```
Me: "Make X configurable"
Agent: [updates schema with validation]
Agent: [updates all instantiation sites]
Agent: [updates test helpers]
Agent: [updates config samples]
```

**What Gets Configured**:

- Timeouts
- Batch sizes
- File paths
- Retry limits
- Token budgets

### Pattern 5: Parallel Investigation

**The Observation**: Agent can read multiple files simultaneously.

**The Pattern**:

```
Agent: [reads schema.ts, db.ts, config_test.ts in parallel]
Agent: "Found batching in db.ts but no config schema. Adding..."
```

**Why It Matters**: Faster context gathering = faster iteration.

### Pattern 7: The Safety Net

**Before Making Changes**:

```
Agent: [runs current test suite]
Status: 97 tests passing
Agent: [implements new feature]
Agent: [runs full suite again]
Status: 107 tests passing (97 old + 10 new)
```

**The Insurance**: You always know if changes broke existing functionality.

## Part VII: The Meta-Lessons

### On Human-AI Collaboration

**What Worked**:

- Treating the AI like a junior engineer with perfect memory and infinite patience
- Asking questions before giving orders
- Letting the AI propose options, human makes decisions
- TDD as shared specification language

**What Didn't Work**:

- Vague requests ("make it better")
- Assuming the AI remembered context from 50 messages ago
- Skipping tests to "move faster"

### On Building AI-Assisted Systems

**The Irony**: Building a framework for AI agents _with_ AI agents revealed:

- Agents need structured output formats (we built Activity Journal)
- Agents need safe tool access (we built ToolRegistry)
- Agents need identity tracking (we added agent_id)
- Humans need review checkpoints (we planned approval workflow)

**The Bootstrap Problem**: You can't fully test an agent framework without agents, but you can TDD the infrastructure they'll need.

### On Documentation

**What Lived**:

- Implementation Plan with clear success criteria
- Test files (executable documentation)
- Activity Journal (audit trail)

**What Died**:

- Comments explaining "why" (code changed, comments didn't)
- Architecture decision records (never updated)

**The Fix**: Keep documentation close to code. Tests are documentation.

### On Trust

**The Progression**:

1. Week 1: "Let me review every line"
2. Week 2: "Let me review the tests"
3. Week 4: "Just run the tests and tell me if they pass"

**The Trust Metric**: Not how smart the AI is, but how good the tests are.

## Part VIII: The Playbook

### For Your Next AI-Assisted Project

#### Phase 1: Design Review (Days 1-3)

1. **Write your design docs** (don't skip this)
   - White paper (the "why")
   - Technical spec (the "what")
   - Implementation plan (the "how")

2. **Agent review session**:
   ```
   You: "Review these three design documents. Tell me what's missing,
        what's ambiguous, and what could go wrong."
   Agent: [comprehensive critique]
   You: [fix issues]
   You: "Review again."
   ```

3. **Iterate until the agent has no more questions**

**Output**: Design docs that are clear enough for a machine to understand.

#### Phase 1.5: Refine Before Building (Critical Step!)

**Before implementing any phase**:

1. **Identify the next phase** from your Implementation Plan

2. **Request refinement**:
   ```
   You: "Refine all steps in Phase X with:
        - Clear success criteria
        - Example inputs/outputs
        - Error cases to handle
        - Test requirements"
   ```

3. **Agent expands each brief step** into a complete specification

4. **You review the refinement**:
   - Are success criteria measurable?
   - Are examples concrete?
   - Are error cases comprehensive?
   - Could someone implement from this alone?

5. **Iterate until each step is implementation-ready**

**Red Flags** (step needs more refinement):

- ❌ "Handle errors appropriately" (too vague)
- ❌ "Implement feature X" (no criteria)
- ❌ "Should be fast" (not measurable)

**Green Lights** (step is ready):

- ✅ "Reject commits with empty working tree, throw Error with message 'nothing to commit'"
- ✅ "Log all git operations to Activity Journal with action type 'git.*' and trace_id"
- ✅ "Branch naming format: feat/{requestId}-{first8charsOfTraceId}"

**The Refinement Checklist**:
For each step, can you answer:

- [ ] What exactly counts as "done"?
- [ ] What's a concrete example of valid input/output?
- [ ] What should happen when things go wrong?
- [ ] How will we test this automatically?
- [ ] What are the security implications?

**Time Investment**: 30-60 minutes of refinement saves 3-6 hours of implementation rework.

**The Rule**: Refinement is not optional. It's the difference between "build a feature" and "build the right feature correctly."

#### Phase 2: Walking Skeleton (Week 1)

**Goal**: End-to-end flow, minimal features

1. **Identify the critical path**:
   ```
   For ExoFrame:
   File drop → Parse → Log → Done
   (Skip: intelligence, tools, git, execution)
   ```

2. **Build the skeleton**:
   ```
   You: "Implement minimal working skeleton:
        - Config loading
        - Database init
        - File watcher (basic)
        - Request parser (no validation)
        - Activity logging (synchronous is fine)"
   ```

3. **Verify end-to-end**:
   ```
   You: "Drop a test file and show me the activity log"
   Agent: [demonstrates]
   ```

4. **Celebrate**: You have something demo-able on day 1

**Why Walking Skeleton First**:

- Integration issues surface immediately
- You can demo progress weekly
- Each feature addition is isolated
- AI debugs working systems better than broken ones

**The Test**: If you can't show a working (but minimal) system in week 1, you're over-engineering.

#### Phase 3: Test-Driven Implementation (Weeks 2-N)

**For Each Feature**:

1. **Ensure step is refined** (see Phase 1.5)

2. **Request TDD implementation**:
   ```
   You: "Implement step X.Y of Implementation Plan in TDD manner"
   ```

3. **Agent produces**:
   - Comprehensive test suite
   - Implementation that passes tests
   - Integration with existing tests

4. **You review**:
   - Read tests (easier than reading implementation)
   - Verify tests match your intent
   - Check security boundaries

5. **Iterate on tests, not implementation**:
   - "Add test for edge case X"
   - "Security test for path traversal"
   - Implementation follows automatically

6. **Run full test suite**:
   ```
   You: "Run all tests"
   Agent: [runs suite]
   Agent: "107 tests passing (97 old + 10 new)"
   ```

**The Rhythm**: Specify → Test → Implement → Verify → Repeat

#### Phase 3: Performance & Refinement

**When Something Feels Slow**:

1. **Question, don't accuse**:
   ```
   You: "Why is logging non-blocking?"
   Agent: [investigates, admits truth]
   Agent: [proposes options with tradeoffs]
   ```

2. **You decide, agent implements**

3. **Make it configurable**:
   ```
   You: "Make batch timing configurable with defaults X and Y"
   Agent: [updates schema, config, tests]
   ```

**When You Spot Code Smell**:

1. **Ask for search**:
   ```
   You: "Are experimental decorators actually used?"
   Agent: [searches codebase]
   Agent: "No, found unused file activity_logger.ts"
   ```

2. **Clean up**:
   ```
   You: "Remove it"
   Agent: [removes file, updates config, runs tests]
   ```

#### Phase 4: Integration & Safety

**Security Checklist**:

- [ ] Path traversal tests exist
- [ ] Command whitelist is conservative
- [ ] Input validation on all external data
- [ ] Error messages don't leak sensitive info

**Ask Agent**:

```
You: "Review security of PathResolver and ToolRegistry.
     What attacks could work?"
Agent: [analyzes, reports findings]
You: [add tests for reported vulnerabilities]
```

### The Anti-Patterns to Avoid

**❌ The Big Bang**:

```
You: "Build an AI agent framework"
Agent: [produces 5000 lines of code]
You: [drowns in review]
```

**✅ The Increment**:

```
You: "Implement step 4.1 in TDD manner"
Agent: [14 tests, clean implementation]
You: [reviews 100 lines]
```

---

**❌ The Assumption**:

```
You: "The logging is too slow, make it async"
Agent: [refactors everything]
Result: Still slow, now has race conditions
```

**✅ The Investigation**:

```
You: "Why is logging slow?"
Agent: [measures, reports]
Agent: [proposes 3 options with tradeoffs]
You: [chooses option 2]
```

---

**❌ The Spec Drift**:

```
You: "Add feature X"
Agent: [implements]
You: "Actually, can you also handle Y?"
Agent: [refactors]
You: "And edge case Z?"
[Repeat 10 times]
```

**✅ The TDD Contract**:

```
You: "Implement X in TDD manner"
Agent: [writes tests including Y and Z]
You: "Good, but also test W"
Agent: [adds test for W]
Agent: [implements to pass all tests]
Result: Feature complete, first try
```

---

**❌ The Comment Rot**:

```typescript
// This function is non-blocking (narrator: it was blocking)
function logActivity() { ... }
```

**✅ The Test Truth**:

```typescript
Deno.test("logActivity batches writes and flushes within 100ms",
  async () => { ... }
);
```

### Pattern 8: Understanding Upstream Dependencies

**The Question**:

```markdown
Me: "Specify what should be in the generated response of the agent"
Agent: [adds XML tags: <thought></thought> and <content></content>]
Me: "Why XML? This format wasn't used before at all."
```

**The Surface Reaction**:
"This seems inconsistent - ExoFrame uses TOML and Markdown everywhere."

**The Actual Context**:

- LLM providers (Anthropic Claude, etc.) already use XML-like tags for structured outputs
- `<thinking>` tags are a common pattern in Claude's extended thinking mode
- Using the same format the LLM naturally produces = less parsing friction
- ExoFrame _services_ may use different formats internally, but _LLM communication_ follows LLM conventions

**The Lesson**:

- **Don't assume inconsistency is wrong** - it might be intentional integration with external systems
- When something seems "out of place," ask _why_ before criticizing
- Upstream dependencies (LLM provider conventions) trump internal consistency
- Different layers can have different format conventions (storage vs. wire format)

**The Right Questions**:

```
❌ "Why are we using XML? We use Markdown everywhere."
✅ "What format do LLM providers use for structured responses?"
✅ "Is this XML format what Claude/GPT already outputs?"
✅ "Would using Markdown require extra transformation?"
```

**Why This Matters**:

- **Integration friction**: Converting XML → Markdown → XML adds complexity
- **LLM native format**: Models are trained on XML-like structure tags
- **Industry convention**: `<thought>` tags are emerging as a standard for Chain-of-Thought
- **Future compatibility**: Other LLM providers will likely adopt similar conventions

**The Pattern**:

```typescript
// LLM generates (native format):
const llmResponse = `
<thought>
I need to analyze the request and check security boundaries...
</thought>
<content>
Here is the proposed solution...
</content>
`;

// Parse using the format LLMs already produce
const parsed = parseStructuredResponse(llmResponse);
// { thought: "...", content: "..." }
```

**The Broader Lesson**:
When integrating with external systems (LLM providers, APIs, databases), prefer _their_ conventions over internal consistency. The boundary layer should speak the external language, even if it differs from your internal format.

**The Rule**: Format choices at integration boundaries should optimize for the external system, not internal aesthetics.

### Pattern 9: Comprehensive Activity Logging

**The Audit Requirement**:

```markdown
Me: "Never forget that any manipulations with files like creation,
modification, copying, moving, removing should always properly
traced in activity table."
```

**The Audit**:

- Searched entire codebase for file operations
- Found `ContextCardGenerator` was writing files but _not_ logging
- Found `DatabaseService` existed but wasn't being used by all modules
- Found `main.ts` had file watcher events but no logging

**The Pattern** (Agent-Implemented):

```typescript
// Centralized logging service
export class DatabaseService {
  logActivity(actor: string, actionType: string, target: string, payload: Record<string, unknown>, traceId?: string) {
    // Logs to activity table with timestamp
  }
}

// Every service that touches files injects DatabaseService
export class ContextCardGenerator {
  constructor(config: Config, db?: Database) {
    this.db = db;
  }

  async generate(info: PortalInfo) {
    await Deno.writeTextFile(cardPath, content);
    // Always log file operations
    this.logActivity(
      isUpdate ? "context_card.updated" : "context_card.created",
      { alias, file_path, tech_stack },
    );
  }
}
```

**The Logging Checklist**: Every module that does ANY of these must inject DatabaseService:

- ✅ `Deno.writeTextFile` → log `*.created` or `*.updated`
- ✅ `Deno.remove` → log `*.deleted`
- ✅ `Deno.rename` → log `*.moved`
- ✅ `Deno.copyFile` → log `*.copied`
- ✅ `Deno.mkdir` → log `directory.created`

**The Verification Pattern**:

```
You: "Check implementation of all current modules including context
     card generator"
Agent: [audits FileWatcher, FrontmatterParser, ContextCardGenerator]
Agent: "Found: ContextCardGenerator writes files but doesn't log. Adding..."
```

**Why This Works**:

- Audit trail for debugging ("Who created this file?")
- Compliance (track all modifications)
- Multi-agent coordination (see what other agents did)
- User transparency (show what the system is doing)

**The Implementation**:

1. Created `src/services/db.ts` as central logging service
2. Updated all file-writing services to inject `Database?` (optional for tests)
3. Added logging calls after every file operation
4. Added test coverage for logging behavior

**The Result**: Complete audit trail. Every file touch is logged with:

- `actor` (which service/agent)
- `action_type` (created/updated/deleted)
- `target` (file path or identifier)
- `payload` (metadata like size, content summary)
- `timestamp` (when it happened)

### Pattern 10: Timestamp Precision

**The Requirement**:

```markdown
Me: "The activity table must contain astro time of when the event
has happened."
```

**The Problem**:

- Database schema had `timestamp DATETIME DEFAULT (datetime('now'))`
- This works for _database insertion time_
- But doesn't capture _application event time_ precisely
- Difference matters for distributed systems or batch operations

**The Fix**:

```typescript
// Before: Relied on DB default
this.db.exec(
  `INSERT INTO activity (id, trace_id, actor, action_type, target, payload)
   VALUES (?, ?, ?, ?, ?, ?)`,
  [activityId, traceId, actor, actionType, target, JSON.stringify(payload)],
);

// After: Explicit timestamp from application
const timestamp = new Date().toISOString();
this.db.exec(
  `INSERT INTO activity (id, trace_id, actor, action_type, target, payload, timestamp)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [activityId, traceId, actor, actionType, target, JSON.stringify(payload), timestamp],
);
```

**Where This Was Applied**:

- `src/services/db.ts` (DatabaseService)
- `src/services/context_card_generator.ts`
- `src/parsers/markdown.ts` (FrontmatterParser)

**Why Explicit Timestamps Matter**:

- **Batch operations**: Log 100 events, all get same DB insertion time but different event times
- **Distributed agents**: Event happened on Agent A at T1, logged to DB at T2
- **Replay/debugging**: Need exact event sequence, not when DB saw it
- **Auditing**: Legal/compliance requires event time, not log time

**The Lesson**:

- Database defaults are convenient but may not capture what you need
- Activity timestamps should reflect _when the event happened_, not _when it was logged_
- ISO 8601 format (`new Date().toISOString()`) is portable and sortable
- This matters more as the system scales

**The Testing Pattern**:

```typescript
Deno.test("ContextCardGenerator: logs activity with timestamp", async () => {
  const beforeTime = new Date().toISOString();
  await generator.generate({ alias: "Test", path: "/test", techStack: [] });
  const afterTime = new Date().toISOString();

  const rows = db.prepare("SELECT timestamp FROM activity").all();
  const loggedTime = rows[0].timestamp;

  // Timestamp is between before and after (proves it's application time)
  assert(loggedTime >= beforeTime && loggedTime <= afterTime);
});
```

### Pattern 11: Incremental Elaboration (The Zooming Technique)

**The Discovery**: Implementation descriptions are _never_ detailed enough on first pass.

**The Multi-Stage Refinement**:

**Stage 1: Initial Write** (Too vague)

```markdown
### Step 3.2: The Agent Runtime

- Implement AgentRunner
- Success: Can execute requests
```

**Stage 2: First Elaboration** (Better, but still gaps)

```markdown
You: "Elaborate step 3.2 of Implementation Plan"
Agent: [adds problem statement, solution, example code, checklist]

### Step 3.2: The Agent Runtime

**Problem**: Need to combine Blueprint + Request
**Solution**: AgentRunner class with run() method
**Checklist**: [3 items]
**Success Criteria**: [4 tests]
```

**Stage 3: User Questions Refinement** (Filling gaps)

```markdown
You: "Specify what should be in the generated response of the agent"
Agent: [adds response format specification]
Agent: [updates checklist with parsing logic]
Agent: [adds test for response parsing]
```

**The Elaboration Trajectory**:

```
Brief bullet → Detailed spec → User questions → Even more detail → Implementation

"Build X" → "Build X with Y requirements" → "What about Z?" → "X with Y and Z" → Code
```

**The Pattern**:

1. **Initial Plan**: High-level steps (1-2 sentences each)
2. **First Elaboration**: Add problem/solution/criteria (triggered by user)
3. **User Discovers Gaps**: "Wait, what about response format?"
4. **Second Elaboration**: Agent fills specific gaps
5. **Implementation**: Now spec is complete enough

**Why This Works**:

- You can't know all requirements up front
- Implementation reveals questions
- Iterative refinement is faster than trying to be perfect initially
- Each round adds 20-30% more clarity

**The Question Triggers** (patterns that drive elaboration):

- "Specify what should be in X"
- "How will we handle Y?"
- "What format should Z use?"
- "Why did you choose A instead of B?"
- "Does this match our existing patterns?"

**The Meta-Lesson**:
Refinement isn't a phase—it's a continuous process. Be ready to elaborate:

- _Before_ implementation (planned refinement)
- _During_ design review (answering questions)
- _After_ user feedback (filling gaps)

**The Efficiency Gain**:

- Trying to write perfect spec up front: 4 hours, still has gaps
- Iterative elaboration: 30min + 15min + 10min = 55min, more complete

**The Rule**: Treat implementation plans as living documents that grow in detail as understanding deepens.

## Part X: The Great YAML Migration (November 28, 2025)

> **Historical Note (January 2026):** This section documents ExoFrame's Obsidian integration experiment, which was implemented in Phase 5 and later retired in Phase 12 (v1.1). While Obsidian provided excellent knowledge management features, maintaining compatibility added complexity (~600 LOC in tests, wikilink generation overhead) without sufficient value after the TUI dashboard was implemented. The lessons learned about user interface pragmatism remain valuable.

### The Plot Twist Nobody Asked For

**The Setup**: ExoFrame was happily using TOML frontmatter (`+++` delimiters). Everything worked. Tests passed. Life was good.

**The Problem**: Obsidian's Dataview plugin—the cornerstone of our beautiful Dashboard—silently judged our TOML choices. Every query returned `-` for metadata fields. The Dashboard was technically functional but metaphorically blind.

```markdown
| File         | Status | Priority |
| ------------ | ------ | -------- |
| request-1.md | -      | -        |
| request-2.md | -      | -        |
```

_Narrator: The Dataview plugin only speaks YAML._

### The Irony Is Delicious

**The Documentation Said**: "Use TOML for token efficiency! ~22% savings!"

**Reality Said**: "Cool story. Your Dashboard is useless."

**The Lesson**: A 22% token savings means nothing if your primary UI doesn't render metadata.

### The Migration: A Comedy in Three Acts

**Act I: The Scope Creep**

```
Me: "Implement step 5.7 in TDD"
Agent: "Let me check... this touches 21 files."
Me: "..."
Agent: "Should I proceed?"
Me: "...yes"
```

**Act II: The Regex Rodeo**

Every parser, serializer, and test fixture suddenly needed updating:

| Pattern   | Before               | After             |
| --------- | -------------------- | ----------------- |
| Delimiter | `+++`                | `---`             |
| Key-value | `key = "value"`      | `key: value`      |
| Status    | `status = "pending"` | `status: pending` |
| Arrays    | `tags = ["a", "b"]`  | `tags: [a, b]`    |

The agent updated 21 files. The tests caught every edge case. The sed commands flew like poetry.

_The Dataview plugin smiled for the first time._

### The Meta-Lesson

**Sometimes the "better" format isn't the right format.**

TOML was technically superior for our use case:

- More explicit strings (no type coercion)
- Cleaner array syntax
- Token efficient

But YAML won because:

- Obsidian Dataview only speaks YAML (for those using Obsidian)
- The Dashboard (when used in Obsidian) is only functional with YAML
- A working UI (for Obsidian users) beats theoretical efficiency

**The Rule**: When choosing formats, consider the entire ecosystem—not just your code.

### The Documentation Update Paradox

The document you're reading (yes, this one) previously celebrated TOML as the superior choice. Pattern 15 proudly proclaimed "TOML Migration" and showed ~22% token savings.

Today we migrated... back to YAML.

**Should we delete Pattern 15?**

No. It's a perfect example of learning in public:

1. We analyzed the options
2. We chose TOML for valid reasons
3. We implemented it thoroughly
4. Reality showed us a critical gap
5. We adapted

**The Pattern That Emerged**: Format decisions aren't permanent. Good TDD makes migrations survivable.

### Pattern 17: The Pragmatic Reversal

**When to Reverse a Decision**:

- ✅ External integration requirements change the equation
- ✅ Primary UI depends on a specific format
- ✅ You have comprehensive tests to catch regressions
- ❌ "I changed my mind" without new information

**How to Reverse Safely**:

1. Identify ALL affected files (agent searched entire codebase)
2. Update tests FIRST to expect new format
3. Update parsers/generators
4. Run full suite after each major change
5. Update documentation (including admitting you changed direction)

**The Migration Stats**:

- Files changed: 21
- Tests updated: ~60 assertions
- Time: ~45 minutes
- Regressions: 0
- Dashboard: Finally works

### The Final Irony

Pattern 15 in this document (TOML Migration) now coexists with Pattern 17 (YAML Migration back).

This isn't inconsistency—it's documentation of real engineering decisions:

- We thought TOML was better (it was, for some metrics)
- We discovered Dataview needed YAML (reality check)
- We migrated back with full test coverage (pragmatism)
- We documented both (honesty)

**The Real Pattern**: Good engineering isn't about making perfect decisions. It's about making reversible decisions with good test coverage.

---

## Part XI: The Infrastructure Maturation Sprint (December 2025)

### The Week That Changed Everything

**The Context**: ExoFrame had working pieces—file watcher, context loading, git integration, tool registry. But they were islands connected by `console.log` bridges and prayer. This week we connected them with real infrastructure.

### Pattern 18: Agent Instructions as Living Documentation

**The Problem**: Every module had its own conventions. Service A logged with `console.log`, Service B used `console.error`, Service C had its own logging helper. Tests were scattered, and new contributors (human or AI) had to reverse-engineer patterns.

**The Solution**: Create `agents/` files to provide focused guidance for dev-time agents and tooling.

**What We Created**:

```
agents/source/exoframe.md     # Source development guidelines
agents/tests/testing.md       # Test development guidelines
agents/docs/documentation.md  # Documentation development guidelines
```

**The Critical Addition—TDD as a Gate**:

```markdown
## ⚠️ CRITICAL: Test-Driven Development Required

**All implementation or major modification of modules MUST strictly follow TDD.**

Before writing any implementation code:

1. Verify a refined step exists in docs/ExoFrame_Implementation_Plan.md
2. Check the step includes TDD test cases with specific test names
3. Write tests first based on the plan's test cases
4. Run tests to confirm they fail (red phase)
5. Implement the minimum code to make tests pass (green phase)
6. Refactor while keeping tests green

**If no refined step exists with TDD test cases:**

- STOP implementation
- Create or refine the step first
- Include specific test cases with expected behaviors
- Get approval before proceeding
```

**Why This Works**:

- AI agents read these files when working in a directory
- Conventions are explicit, not tribal knowledge
- New patterns (like EventLogger) are documented once, followed everywhere
- TDD becomes a hard requirement, not a suggestion

**The Meta-Lesson**: Documentation that lives next to code gets read. Documentation in a wiki gets ignored.

### Pattern 19: Unified Logging (The EventLogger Revolution)

**The Before State**:

```typescript
// src/main.ts
console.log("🚀 Starting ExoFrame Daemon...");
console.log(`✅ Configuration loaded (Checksum: ${checksum})`);

// src/services/watcher.ts
console.log(`📁 Watching directory: ${path}`);
console.error(`❌ Watch directory not found: ${path}`);

// src/cli/daemon_commands.ts
console.log("Starting ExoFrame daemon...");
console.log(`✓ Daemon started (PID: ${pid})`);
```

**The Problem**:

- No audit trail (console output is ephemeral)
- Inconsistent formatting (emojis here, not there)
- No trace correlation (which request caused this log?)
- No actor tracking (human? agent? system?)

**The Solution**: EventLogger service that writes to BOTH console AND Activity Journal.

```typescript
// Create logger with database connection
const logger = new EventLogger({ db: dbService, prefix: "[ExoFrame]" });

// Single call → console output + database record
logger.info("daemon.started", "exoframe", {
  pid: process.pid,
  provider: "ollama",
  model: "codellama:13b",
});

// Child loggers inherit context
const traceLogger = logger.child({ traceId: request.trace_id });
traceLogger.info("request.processing", filePath, { status: "started" });
```

**The Display-Only Pattern**:

For read-only CLI operations (list, show, status), we don't want to pollute the Activity Journal with query operations:

```typescript
// Display-only logger (no DB parameter = console only)
const display = new EventLogger({});

// Used for read-only display operations
display.info("request.list", "requests", { count: 5 });
display.info("daemon.status", "daemon", { status: "Running ✓", pid: 12345 });
```

**The Migration Stats**:

| Metric                     | Before  | After    |
| -------------------------- | ------- | -------- |
| Files changed              | -       | 18       |
| console.log calls migrated | ~100    | 0        |
| Activity Journal coverage  | Partial | Complete |
| Tests updated              | -       | 6 files  |

**The Actor Identity Resolution**:

```typescript
// For system events
logger.child({ actor: "system" });

// For agent events
logger.child({ actor: "agent:senior-coder" });

// For human events (CLI) - resolved from git or OS
const identity = await EventLogger.getUserIdentity();
// Returns: git email → git name → OS username → "unknown"
logger.child({ actor: identity }); // "john@example.com"
```

**Success Criteria Achieved**:

- [x] EventLogger class with log(), info(), warn(), error() methods
- [x] All log events written to Activity Journal
- [x] Console output formatted consistently with icons
- [x] Database failures handled gracefully (fallback to console-only)
- [x] Child loggers inherit parent defaults
- [x] User identity resolved from git config
- [x] All CLI command actions use EventLogger
- [x] Display-only logger for read-only operations

### Pattern 20: The Request Processor Pipeline

**The Gap**: The daemon could detect files, but had a TODO in the callback:

```typescript
// Before (main.ts)
const watcher = new FileWatcher(config, async (event) => {
  console.log(`📥 New file ready: ${event.path}`);
  // TODO: Process request and generate plan
});
```

**The Solution**: RequestProcessor service that implements the complete pipeline:

```
File Detected → Parse TOML Frontmatter → Load Blueprint → Run Agent → Write Plan → Update Status
```

**The Implementation**:

```typescript
const requestProcessor = new RequestProcessor(
  config,
  llmProvider,
  dbService,
  {
    inboxPath: join(config.system.root, config.paths.inbox),
    blueprintsPath: join(config.system.root, config.paths.blueprints, "Agents"),
    includeReasoning: true,
  },
);

// In file watcher callback
const planPath = await requestProcessor.process(event.path);
if (planPath) {
  watcherLogger.info("plan.generated", planPath, { source: event.path });
}
```

**What It Does**:

1. Parses TOML frontmatter from request files
2. Loads agent blueprints from `Blueprints/Agents/`
3. Calls AgentRunner with LLM provider to generate plan content
4. Writes plans to `Inbox/Plans/` using PlanWriter
5. Updates request status (`pending` → `planned` | `failed`)
6. Logs all activities to Activity Journal with trace_id correlation

**The Database Helper Refactoring**:

During this implementation, we discovered test database setup was inconsistent:

```typescript
// Before: Raw SQL scattered across tests
db.instance.exec(`CREATE TABLE IF NOT EXISTS activity (...)`);

// After: Centralized helper
const { db, tempDir, cleanup } = await initTestDbService();
// Tables are created automatically, cleanup is guaranteed
```

7 test files were updated to use the centralized helpers.

### Pattern 21: Provider Selection Logic

**The Hierarchy**: Environment → Config → Defaults

```typescript
// Provider resolution order:
// 1. EXO_LLM_PROVIDER environment variable
// 2. config.ai.provider from exo.config.toml
// 3. Default: "mock" (safe for development)

const provider = ProviderFactory.create(config);
```

**Environment Variables**:

| Variable             | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `EXO_LLM_PROVIDER`   | Provider type (mock, ollama, anthropic, openai) |
| `EXO_LLM_MODEL`      | Model name override                             |
| `EXO_LLM_BASE_URL`   | API endpoint override                           |
| `EXO_LLM_TIMEOUT_MS` | Request timeout override                        |

**The MockLLMProvider for Testing**:

```typescript
// 5 mock strategies for different test scenarios
const mock = new MockLLMProvider({
  strategy: "recorded", // Replay by prompt hash
  // strategy: "scripted", // Return in sequence
  // strategy: "pattern",  // Regex matching
  // strategy: "failing",  // Always throw
  // strategy: "slow",     // Add delay
});

// Helper functions for common patterns
const planGenerator = createPlanGeneratorMock();
const failingProvider = createFailingMock("API rate limited");
const slowProvider = createSlowMock(5000); // 5 second delay
```

### Pattern 22: Security Tests as First-Class Citizens

**The Requirement**: Every security boundary needs explicit tests.

**What We Added**:

```bash
# New deno task to run only security tests
deno task test:security
```

**Coverage**:

| Category              | Test Count | Location                             |
| --------------------- | ---------- | ------------------------------------ |
| Path traversal        | 5          | path_resolver_test.ts                |
| Portal escape         | 2          | path_resolver_test.ts                |
| File system escape    | 6          | tool_registry_test.ts                |
| Shell injection       | 4          | tool_registry_test.ts                |
| Network exfiltration  | 1          | tool_registry_test.ts                |
| Env variable security | 4          | config_test.ts                       |
| Cross-portal access   | 4          | integration/09_portal_access_test.ts |

**The Filtering Pattern**:

```typescript
Deno.test({
  name: "[security] path traversal attack should be blocked",
  fn: async () => { ... }
});
```

Tests labeled with `[security]` can be run in isolation before releases.

### Pattern 23: Integration Test Completeness

**The Gap**: Unit tests passed, but end-to-end scenarios were untested.

**What We Added** (10 integration test scenarios):

| Scenario               | Description                                 |
| ---------------------- | ------------------------------------------- |
| 01_happy_path          | Request → Plan → Approve → Execute → Report |
| 02_plan_rejection      | Request → Plan → Reject → Archive           |
| 03_plan_revision       | Request → Plan → Revise → New Plan          |
| 04_execution_failure   | Failure detection, rollback, recovery       |
| 05_concurrent_requests | Parallel processing with lease mechanism    |
| 06_system_recovery     | Orphan detection, lease cleanup, resume     |
| 07_context_overflow    | Large context file handling (50 files)      |
| 08_git_conflict        | Conflict detection and resolution           |
| 09_portal_access       | Security boundary enforcement               |
| 10_invalid_input       | Malformed input handling                    |

**The TestEnvironment Helper**:

````typescript
const env = await TestEnvironment.create();
// Creates isolated workspace with:
// - Temp directory structure
// - Initialized git repo
// - Database with activity table
// - Mock LLM provider
// - Full ExoFrame config

// After test
await env.cleanup();

### Pattern 24: The Structured Communication Breakthrough (JSON Plans)

**The Discovery**:
Markdown-based plans were readable for humans but fragile for machines.

```markdown
Me: "Why did the plan parsing fail?"
Agent: "The LLM put a space after '## Step 1:' which broke the regex."
````

**The Problem**:

- Regex parsing of Markdown is brittle
- LLMs are inconsistent with whitespace and formatting
- Validation is hard (is this text a step description or a comment?)
- Structure is implicit, not explicit

**The Solution**: JSON for machines, Markdown for humans.

**The New Workflow**:

1. **Blueprint**: Instructs LLM to output JSON (schema-enforced)
2. **AgentRunner**: Captures raw JSON response
3. **PlanAdapter**: Validates JSON against Zod schema
4. **PlanWriter**: Converts valid JSON to readable Markdown for storage

**The Schema (PlanSchema)**:

```typescript
const PlanSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string(),
  steps: z.array(z.object({
    step: z.number(),
    title: z.string(),
    description: z.string(),
    tools: z.array(z.string()).optional(),
  })),
});
```

**The Model-Specific Prompting Strategy**:

We discovered that different models need different instructions to output valid JSON.

**1. Advanced Models (Claude 3.5, GPT-4)**:
Prefer explicit XML tags and detailed schema definitions.

```markdown
## CRITICAL: Response Format

You MUST respond with these exact tags:
<thought>Your reasoning...</thought>
<content>
{
"title": "...",
"steps": [...]
}
</content>
```

**2. Local/Smaller Models (Llama 3.2, CodeLlama)**:
Get confused by XML tags. Prefer simple, direct instructions.

```markdown
You are a coding assistant. Respond ONLY with valid JSON:
{
"title": "...",
"steps": [...]
}
IMPORTANT: No other text.
```

**The Result**:

- **Reliability**: 100% parsing success rate with valid JSON
- **Validation**: Schema catches missing fields before they hit the disk
- **Readability**: Humans still see clean Markdown files (converted by PlanWriter)
- **Flexibility**: Different blueprints for different models (adaptive prompting)

**The Lesson**:
Don't make the LLM format for humans _and_ machines simultaneously. Ask for machine-readable output (JSON), then render it for humans (Markdown).

`````
### The Week in Numbers

| Metric                      | Value                  |
| --------------------------- | ---------------------- |
| Commits                     | 16                     |
| Files changed               | 80+                    |
| New tests added             | 150+                   |
| Total tests                 | 770 → passing          |
| Branch coverage             | 78% → 80%              |
| Integration scenarios       | 0 → 11                 |
| Security tests              | 0 → 29                 |
| Documentation files created | 3 (AGENT_INSTRUCTIONS) |
| JSON Plan Format            | 100% Adoption          |

### The Key Insight

**Infrastructure Week taught us**: The difference between "demo-able" and "production-ready" is:

1. **Unified logging** (not scattered console.log)
2. **Trace correlation** (every operation linked to its request)
3. **Actor tracking** (who did what)
4. **Security boundaries** (with tests that prove they work)
5. **Integration tests** (that simulate real workflows)
6. **Agent instructions** (so AI helpers follow the same patterns)

**The Rule**: Every `console.log` is technical debt. Every untraced operation is a debugging nightmare waiting to happen.

---

---

## Part XII: The MCP Architecture Revolution (December 2025)

### The Paradigm Shift Nobody Saw Coming

**The Context**: ExoFrame was designed around agents parsing LLM responses for structured data. We'd write complex regex patterns, handle edge cases, pray the LLM formatted code blocks correctly. Then reality arrived.

### Pattern 24: Agent-Driven Architecture via MCP

**The Old Way (Response Parsing)**:

````typescript
// Agent generates markdown response
const llmResponse = `
Here's the plan:
\`\`\`typescript
// Step 1: Create auth.ts
export function login() { ... }
\`\`\`
Done!
`;

// We parse this with regex (fragile!)
const codeBlocks = llmResponse.match(/```typescript\n([\s\S]*?)\n```/g);
const files = extractFilePaths(codeBlocks); // Hope LLM followed format!
`````

**The Problems**:

- LLMs don't always format consistently
- Regex parsing is brittle (one missing backtick = crash)
- No validation at call-time (failures happen after execution)
- Security boundaries enforced in parsing logic (scattered)

**The New Way (MCP Server)**:

```typescript
// ExoFrame runs MCP server exposing tools
const mcpServer = new MCPServer({
  tools: [
    new ReadFileTool(config, db, permissions),
    new WriteFileTool(config, db, permissions),
    new GitCreateBranchTool(config, db, permissions),
    new GitCommitTool(config, db, permissions),
  ],
  transport: "stdio", // or "sse" for HTTP
});

// Agent connects to MCP server and uses tools
// No markdown parsing - just standardized JSON-RPC calls
```

**What This Unlocks**:

- **Validation at invocation**: Tools validate parameters before execution
- **Security at tool level**: Each tool enforces portal permissions
- **Complete audit trail**: Every tool call logged with trace_id
- **Standard protocol**: Works with any MCP-compatible LLM client

**The Five-Phase Implementation**:

| Phase | Feature                    | Tests | Commits |
| ----- | -------------------------- | ----- | ------- |
| 1     | Walking Skeleton (stdio)   | 8     | 140d307 |
| 2     | read_file tool             | 15    | 55a52f9 |
| 3     | write_file, list_directory | 26    | 21e5818 |
| 4     | git tools (3 tools)        | 37    | b6694ab |
| 5     | Resources (portal:// URIs) | 53    | 82759ab |
| 6     | Prompts (templates)        | 71    | 461ca83 |

**Total**: 71 tests, 6 commits, ~2 weeks of TDD implementation.

### Pattern 25: Portal Permissions & Security Modes

**The Security Requirement**: Agents can't have unrestricted file system access.

**The Two-Mode Solution**:

**1. Sandboxed Mode (Maximum Security)**:

```toml
[[portals]]
name = "MyApp"
agents_allowed = ["senior-coder"]
operations = ["read", "write", "git"]

[portals.MyApp.security]
mode = "sandboxed"  # Agent subprocess has NO file access
```

- Agent runs: `deno run --allow-read=NONE --allow-write=NONE`
- All operations MUST go through MCP tools
- Impossible to bypass ExoFrame security
- Default mode (safest)

**2. Hybrid Mode (Performance Optimized)**:

```toml
[portals.MyApp.security]
mode = "hybrid"  # Agent can read portal, writes audited
```

- Agent runs: `deno run --allow-read=/path/to/MyApp`
- Can read files directly (faster context loading)
- Writes MUST use MCP tools (enforced + logged)
- Post-execution git diff audit catches unauthorized changes

**The Permission Validation**:

```typescript
// All 6 MCP tools validate permissions before execution
class ReadFileTool extends ToolHandler {
  async execute(args: { portal: string; path: string; agent_id: string }) {
    // Validate agent is whitelisted for this portal
    this.validatePermission(args.portal, args.agent_id, "read");

    // Validate path is within portal boundaries
    const resolvedPath = this.pathResolver.resolve(
      `@${args.portal}/${args.path}`,
    );

    // Read and return
    const content = await Deno.readTextFile(resolvedPath);
    return { content };
  }
}
```

**The Integration Tests** (24 tests passing):

- Agent whitelist enforcement (explicit list + wildcard "*")
- Operation restrictions (read, write, git)
- Security mode queries (sandboxed vs hybrid)
- Multiple portal independence
- Default security config (sandboxed if not specified)

**Success Criteria Met**:

- ✅ Portal permissions service implemented
- ✅ Agent whitelist enforced (explicit + wildcard)
- ✅ Operation-level restrictions (read/write/git)
- ✅ Security modes defined and queryable
- ✅ All 6 MCP tools validate permissions
- ✅ 24 tests passing (16 service + 8 integration)

**Remaining Work** (for Step 6.4):

- Subprocess spawning with security mode permissions
- Git audit for hybrid mode unauthorized changes
- Config schema update to include portal permission fields

### Pattern 26: TypeScript Compilation as Test Gate

**The Discovery**: VS Code showed no errors, but coverage script failed.

```bash
$ ./scripts/coverage.sh summary
Error: TS2554: Expected 2 arguments, but got 3.
Error: TS2552: Cannot find name 'config'. Did you mean 'Config'?
```

**The Root Cause**:

- Regular tests run with `--no-check` flag (skip type checking)
- Coverage script runs with type checking enabled
- TypeScript errors were hidden until coverage generation

**The Fix Strategy**:

```
1. Run `deno check src/**/*.ts tests/**/*.ts`
2. Fix compilation errors:
   - Remove unused parameters
   - Fix function signatures
   - Add missing config fields
3. Run coverage script to verify
4. Update tests to match new signatures
5. Commit with detailed message
```

**The Errors Fixed**:

| Error Type        | Count | Location             | Fix                          |
| ----------------- | ----- | -------------------- | ---------------------------- |
| Unused parameter  | 3     | src/mcp/prompts.ts   | Removed `_config` parameter  |
| Unnecessary async | 2     | src/mcp/server.ts    | Removed `async` keyword      |
| Missing property  | 2     | test helpers, config | Added `mcp` field            |
| Unused variable   | 6     | prompts_test.ts      | Removed unused `config` vars |

**The Result**:

- All 721 tests still passing
- Coverage script now runs successfully
- 81.1% line coverage, 89.3% branch coverage
- Zero TypeScript compilation errors

**The Lesson**: Run type checking in CI, not just in IDE. Your editor can lie (stale cache), but `deno check` never does.

### Pattern 27: Documentation Cleanup Without Breaking History

**The Situation**: Code comments had phase markers from early planning:

```typescript
// ============================================================================
// Step 6.3: Portal Permissions & Security Modes
// ============================================================================
```

**The Problem**:

- Phase markers useful during planning
- Clutter once features are implemented
- Need to track what's done without leaving markers in code

**The Solution**:

```bash
# Remove phase markers from code
grep -r "Step 6\.[23]" src/ tests/ | # Find all occurrences
  # Remove "Step X.Y:" markers but keep section headers
  sed -i 's/Step 6\.[0-9]: //' files

# Keep phase tracking in Implementation Plan only
docs/ExoFrame_Implementation_Plan.md # Single source of truth
```

**Commit Message Pattern**:

```
docs: Remove implementation phase markers from code comments

- Removed "Step 6.2" and "Step 6.3" markers from src/mcp/*.ts
- Removed phase markers from tests/mcp/*_test.ts
- Preserved section structure and descriptive headers
- Phase tracking remains in docs/ExoFrame_Implementation_Plan.md

All 721 tests passing. No functional changes.
```

**The Rule**: Once features are implemented, remove planning artifacts from code. Keep history in git log and planning documents, not in source files.

### The MCP Success Metrics

**Implementation Complete** (Step 6.2 ✅):

- 71 tests passing (8 → 15 → 26 → 37 → 53 → 71)
- 6 MCP tools fully functional with security validation
- Resources exposed via `portal://` URI scheme
- Prompts registered (`execute_plan`, `create_changeset`)
- Activity logging for all tool invocations
- Zero TypeScript compilation errors
- 81.1% line coverage, 89.3% branch coverage

**Permission System Complete** (Step 6.3 ✅):

- 24 permission tests passing
- Agent whitelist enforcement
- Operation restrictions (read, write, git)
- Security modes defined (sandboxed, hybrid)
- All tools validate permissions
- Default-secure (sandboxed mode if not specified)

**Remaining Work** (Step 6.4):

- Agent orchestration (spawn subprocess with MCP connection)
- Execute plans through MCP tools
- Changeset creation and tracking
- End-to-end integration tests

### The Meta-Lesson on Architecture Evolution

**Where We Started**:

```
Agent → Markdown Response → Regex Parsing → Git Operations
```

**Where We Are**:

```
Agent → MCP Tools → Validated Operations → Audit Trail
```

**Why This Matters**:

- **Fragility → Reliability**: Tool validation catches errors at call-time
- **Parsing → Protocol**: JSON-RPC is standard, not our regex
- **Scattered security → Centralized**: Each tool enforces permissions
- **Silent operations → Full audit**: Every action logged with trace_id

**The Pattern**: When you find yourself writing complex parsers for structured data, consider if there's a protocol you should be using instead.

**The Rule**: Protocol design is infrastructure work. It feels slow initially, but pays dividends when you have 6 tools, 24 security tests, and 71 integration scenarios all working together.

---

## Part XIII: The Verification Loop Pattern

### Pattern 28: Success Criteria as Implementation Checkpoint

**The New Practice**: Before marking any step complete, explicitly verify against documented success criteria.

**The Request Pattern**:

```
Me: "Verify completeness of step 6.3 against its success criteria"
Agent: [reads Implementation Plan]
Agent: [reads source code]
Agent: [runs tests]
Agent: [generates comprehensive verification report]
```

**The Verification Report Structure**:

```markdown
## Step X.Y Verification Summary

**Status:** ✅ COMPLETE | ⚠️ PARTIAL | ❌ INCOMPLETE

### ✅ Implementation Completed

1. Service implementation (file paths, key features)
2. Schema definitions (types, validation)
3. Tool integration (all tools updated)
4. Test coverage (unit + integration counts)

### Success Criteria Review

| # | Criterion | Status | Evidence                                     |
| - | --------- | ------ | -------------------------------------------- |
| 1 | Feature A | ✅     | Method X, 4 tests                            |
| 2 | Feature B | ⚠️     | Defined but not enforced (blocked by Step Y) |

### ⚠️ Gaps Identified

1. **Gap Name**: Description of missing piece
   - Impact: What breaks without this
   - Resolution: What step will complete this

### ✅ What Works Right Now

Code examples demonstrating working features

### 📋 Remaining Work

List of items that belong to future steps

### Recommendation

Mark as COMPLETE/PARTIAL with rationale
```

**Why This Works**:

- Forces honest assessment of "done"
- Distinguishes "implemented" from "fully functional"
- Documents what's intentionally deferred vs forgotten
- Provides clear status for stakeholders

**The Two Outcomes**:

**✅ Complete**: All criteria met, mark step done

```
Recommendation: Mark Step 6.3 as ✅ COMPLETE

Core functionality works, comprehensive tests pass, remaining
work is explicitly scoped to Step 6.4.
```

**⚠️ Partial**: Some criteria met, some blocked by dependencies

```
Recommendation: Mark Step 6.3 as ⚠️ PARTIAL - BLOCKED

Permission validation works (10/14 criteria met), but
subprocess security enforcement requires Step 6.4
(Agent Orchestration) to complete.
```

**The Rule**: Never mark a step complete without running the verification loop. "It works on my machine" isn't good enough when you have documented success criteria.

---

## Part XIV: The Implementation Evolution - JSON Plans and Executor Patterns

### The Format Shift: "From Markdown to JSON - Why Structure Matters"

**The Context**: After months of markdown-based plans, the system hit scaling limits. Parsing TOML blocks embedded in markdown was brittle, validation was manual, and the format couldn't express complex dependencies or metadata cleanly.

**The Pattern**: When implementation reveals format limitations, evolve the data structures first, then rebuild around them.

**What Happened**:

```
Me: "The current markdown plan format is causing parsing errors. Let's switch to JSON."
Agent: [designs JSON schema with Zod validation]
Agent: [updates PlanExecutor to parse JSON instead of TOML-in-markdown]
Agent: [migrates all tests and fixtures]
Result: 75% test coverage maintained, parsing errors eliminated
```

**Before JSON**:

- Plans were human-readable but machine-fragile
- Validation happened at runtime with cryptic errors
- Schema changes required manual updates everywhere

**After JSON**:

- Type-safe parsing with clear error messages
- Schema validation catches issues before execution
- Tool parameters validated against expected types
- Dependencies and metadata properly structured

**The JSON Evolution Pattern**:

1. **Identify Format Pain**: When parsing becomes a source of bugs, it's time to change formats
2. **Design Schema First**: Use TypeScript + Zod to define the data structure
3. **Update Core Logic**: Change the executor to use new format
4. **Migrate Tests**: Update all test fixtures and assertions
5. **Validate Coverage**: Ensure test coverage doesn't drop during migration

**Why This Works**:

- JSON is machine-friendly while remaining human-readable
- Schema validation prevents runtime surprises
- Type safety catches integration issues early
- Tests serve as migration verification

### The Executor Emergence: "From Plans to Action - The TDD Scaling Challenge"

**The Challenge**: Plans were being generated and stored, but nothing was executing them. The system could describe work but not perform it.

**The Pattern**: When features reach critical mass, implement the core execution engine with comprehensive TDD, then build supporting infrastructure around it.

**What Happened**:

```
Agent: [writes 50+ tests for PlanExecutor covering success/failure/malformed cases]
Agent: [implements PlanExecutor with step-by-step execution]
Agent: [adds changeset creation and git integration]
Result: Plans now execute automatically, creating traceable changesets
```

**The Execution Implementation Pattern**:

1. **Test-Driven Design**: Write exhaustive tests before implementation
2. **Core Execution Loop**: Implement the main execution flow
3. **Error Handling**: Design failure modes and recovery
4. **Integration Points**: Connect to git, logging, and security systems
5. **Validation**: Run full integration tests with real repositories

**Why This Scales**:

- TDD ensures correctness as complexity grows
- Comprehensive error handling prevents system failures
- Integration testing validates end-to-end flows
- Logging provides observability for debugging

### The Documentation Debt: "Write Docs or Regret It Later"

**The Reality**: Code evolves faster than documentation. Architecture diagrams become outdated, walkthroughs miss new features.

**The Pattern**: After major implementation changes, immediately update documentation with the same rigor as code.

**What Happened**:

- Architecture diagrams updated to show PlanExecutor flow
- Manual test scenarios rewritten for JSON plans
- Implementation plan extended with new steps
- Documentation consolidated and reorganized

**The Documentation Maintenance Pattern**:

1. **Immediate Updates**: Update docs right after code changes
2. **Diagram First**: Visual architecture changes first
3. **Test Scenarios**: Update manual testing procedures
4. **Consolidation**: Merge related docs, remove outdated content

**Why This Matters**:

- New team members can understand the system
- Prevents "it worked in my branch" syndrome
- Documentation becomes a source of truth, not an afterthought

### The Flow Orchestration Breakthrough: "From Single Agents to Multi-Agent Coordination"

**The Challenge**: The system could run individual agents, but coordinating multiple agents in complex workflows was missing. Flow orchestration needed dependency resolution, parallel execution, error handling, and result aggregation—all while maintaining the TDD discipline.

**The Pattern**: When implementing complex coordination systems, break it into phases with clear success criteria, implement core execution engine first, then build routing and validation layers around it.

**What Happened**:

```
Me: "Implement Flow Orchestration Phase 7.5-7.6: Flow-aware request routing with comprehensive testing"
Agent: [analyzes implementation plan]
Agent: [implements FlowValidator service for pre-execution validation]
Agent: [implements RequestRouter for intelligent routing decisions]
Agent: [adds comprehensive test coverage for flow modules]
Result: 73.4% branch coverage on FlowRunner, all routing tests passing
```

**The Flow Implementation Journey**:

**Phase 1: Core Execution Engine (Already Complete)**

- FlowRunner with dependency resolution and wave-based parallel execution
- Event logging for every step and decision point
- Error propagation and aggregation strategies

**Phase 2: Validation Layer**

- FlowValidator service to check flows before execution
- Dependency cycle detection
- Agent existence validation
- Clear error messages for invalid flows

**Phase 3: Routing Intelligence**

- RequestRouter that understands `flow:<id>` and `agent:<id>` patterns
- Priority-based routing: flows → FlowRunner, agents → AgentRunner
- Fallback to default agent for unprefixed requests
- Full integration with event logging system

**Phase 4: Test Coverage Explosion**

- FlowRunner branch coverage: 54.7% → 73.4% (+18.7% improvement)
- Added 16 new test cases covering edge cases and error conditions
- Schema validation tests for malformed flow definitions
- Circular dependency detection and handling
- Non-Error exception handling (strings/objects thrown)
- Output aggregation with mixed success/failure scenarios

**The Coverage Breakthrough Pattern**:

1. **Identify Low-Coverage Modules**: Use coverage reports to find weak spots
2. **Analyze Execution Paths**: Understand what code paths aren't tested
3. **Write Error Case Tests First**: Cover validation failures, edge cases, exceptions
4. **Fix Configuration Issues**: Adjust test settings (failFast, timeouts) as needed
5. **Validate Improvements**: Run coverage analysis to confirm gains

**Why Flow Orchestration Testing Matters**:

- Complex dependency graphs require thorough validation
- Parallel execution introduces race conditions and timing issues
- Error handling must work across multiple agents and steps
- Output aggregation needs to handle partial failures gracefully
- Routing decisions affect system behavior dramatically

**The Meta Lesson**: Complex coordination systems demand comprehensive testing because the interactions between components create emergent behaviors that unit tests can't predict. The AI agent excelled at generating exhaustive test cases for these complex scenarios, turning what could have been a fragile system into a robust orchestration platform.

### The Test Evolution: "Coverage Isn't Optional - It's Survival"

**The Turning Point**: As the system grew, test failures started causing real issues. Memory constraints exposed model loading problems, integration tests revealed race conditions.

**The Pattern**: When tests start failing due to environmental factors, improve test isolation and coverage systematically.

**What Happened**:

- LlamaProvider tests fixed for memory-constrained environments
- PlanExecutor coverage increased to 75% branch coverage
- Integration tests added for end-to-end flows
- Test fixtures updated for new JSON format

**The Testing Maturity Pattern**:

1. **Environment Awareness**: Tests that adapt to available resources
2. **Coverage Metrics**: Explicit coverage targets and monitoring
3. **Integration Testing**: Full system tests, not just unit tests
4. **Fixture Maintenance**: Keep test data current with code changes

**Why Testing Evolves**:

- Environmental differences (memory, network) cause test flakes
- Higher coverage catches regressions earlier
- Integration tests validate the whole system works together
- Well-maintained fixtures prevent test rot

**The Meta Lesson**: Building with AI agents requires the same discipline as traditional development, but with extra attention to documentation, testing, and format evolution. The patterns that emerge aren't just about code—they're about maintaining system coherence as complexity grows.

---

_Written from the trenches of the ExoFrame project, where the builders were also the users, and the documentation wrote itself (with a little help from the AI we were building the framework for)._

## Part XV: The Testing Discipline

### Pattern 12: Coverage-Driven TDD

**The Target**: Minimum 70% branch coverage on all new features.

**The Request Pattern**:

```
You: "Proceed with implementation in TDD manner. Try to achieve 70% in branch coverage."
Agent: [writes comprehensive test suite]
Agent: [implements feature]
Agent: [runs coverage report]
Agent: "Branch coverage: 84.2%"
```

**Real Results from ExoFrame**:

| Feature         | Tests | Branch Coverage |
| --------------- | ----- | --------------- |
| Portal Commands | 31    | 84.2%           |
| MissionReporter | 28    | 83.3%           |
| GitService      | 11    | 78.4%           |
| ToolRegistry    | 14    | 82.1%           |

**The Coverage Request**:

```
You: "Run tests with coverage for src/cli/portal_commands.ts"
Agent: [runs deno test --coverage]
Agent: [generates lcov report]
Agent: "Branch coverage: 84.2% (target: 70%)"
```

**Why Branch Coverage Matters**:

- Line coverage misses untested branches (if/else paths)
- Branch coverage catches conditional logic gaps
- 70% minimum ensures edge cases are tested
- Higher coverage = safer refactoring

**The Coverage Improvement Loop**:

```
1. Run coverage report
2. Identify uncovered branches
3. Add tests for those branches
4. Verify coverage increased
5. Repeat until target met
```

**The Anti-Pattern**:

```
❌ "Add tests to improve coverage" (vague)
✅ "Add test for the else branch on line 145 where config is undefined"
```

### Pattern 13: Test Organization and Deduplication

**The Discovery**:

```
You: "Run all tests"
Agent: [runs tests]
Agent: "Found 305 tests"
You: "Check if there is some tests duplications"
Agent: [searches test files]
Agent: "Found duplicate tests in tests/daemon_commands_test.ts and
        tests/cli/daemon_commands_test.ts"
```

**The Problem**:

- Tests scattered across multiple locations
- Same functionality tested twice
- Inconsistent test patterns

**The Solution**:

```
You: "Move unique tests from tests/foo_test.ts to tests/cli/foo_test.ts
     and delete the duplicate file"
Agent: [identifies unique tests]
Agent: [merges into canonical location]
Agent: [removes duplicate file]
Agent: [runs full test suite to verify]
```

**The Result**:

```
Before: 305 tests (with duplicates)
After:  278 tests (consolidated, all passing)
```

**The Test Organization Pattern**:

```
tests/
├── cli/                    # CLI command tests
│   ├── daemon_commands_test.ts
│   ├── portal_commands_test.ts
│   └── plan_commands_test.ts
├── helpers/                # Test utilities
│   ├── config.ts
│   └── db.ts
├── services/               # Service unit tests
│   ├── db_test.ts
│   └── git_service_test.ts
└── integration/            # E2E tests
```

**The Deduplication Checklist**:

1. Search for similar test file names across directories
2. Compare test case names for duplicates
3. Identify unique vs. redundant tests
4. Merge unique cases into canonical location
5. Delete duplicate files
6. Run full suite to verify nothing broke

### Pattern 14: CLI Activity Logging Audit

**The Audit Trigger**:

```
You: "Verify that every exoctl CLI command call correctly traced in activity log"
Agent: [creates comprehensive audit report]
```

**The Audit Report Format**:

```markdown
## CLI Activity Logging Verification Report

### Commands with Complete Logging ✅

| Command | Actions Logged |
| plan create | plan.created |
| portal add | portal.added |
| changeset apply | changeset.applied |

### Commands Missing Logging ❌

| Command | Issue |
| daemon start | No logging |
| daemon stop | No logging |
| daemon restart | No logging |
```

**The Fix Pattern**:

```
You: "Yes, update daemon commands"
Agent: [adds logDaemonActivity() helper]
Agent: [adds daemon.started, daemon.stopped, daemon.restarted events]
Agent: [updates tests to verify logging]
```

**The Activity Logging Checklist**:

Every CLI command that modifies state must log:

- ✅ `command.action` event type (e.g., `daemon.started`)
- ✅ Actor: `"human"` for CLI operations
- ✅ Via: `"cli"` in payload
- ✅ Timestamp: ISO 8601 format
- ✅ Relevant context (PID, file paths, method)

**The Verification Test Pattern**:

```typescript
it("should log daemon.started to activity journal", async () => {
  await daemonCommands.start();
  await db.waitForFlush();

  const logs = db.instance.prepare(
    "SELECT * FROM activity WHERE action_type = ?",
  ).all("daemon.started");

  assertEquals(logs.length, 1);
  const payload = JSON.parse(logs[0].payload);
  assertExists(payload.pid);
  assertEquals(payload.via, "cli");
  assertExists(payload.timestamp);
});
```

**Why This Matters**:

- Complete audit trail for all user actions
- Debugging multi-step operations
- Compliance and accountability
- Understanding system behavior

### Pattern 15: Format Standardization Migration (TOML Migration)

**The Context**:
ExoFrame originally used mixed formats—YAML frontmatter in requests/plans (`---` delimiters), different syntax across components. This created inconsistency and higher token usage when files were included in LLM context.

**The Decision**:

```
You: "I think we should standardize on TOML format across the codebase"
Agent: [analyzes current format usage]
Agent: "Found YAML frontmatter in requests, plans. TOML in config.
        Inconsistent."
```

**The Migration Strategy** (TDD-Driven):

1. **Update Parser First** (the core change):
   ```
   You: "Update FrontmatterParser to use TOML (+++ delimiters) instead of YAML (---)"
   Agent: [updates tests first]
   Agent: [changes parser to only accept +++]
   Agent: [removes @std/yaml dependency]
   ```

2. **Update Dependent Services** (cascade):
   ```
   You: "Now update services that generate frontmatter"
   Agent: [updates plan_writer.ts, execution_loop.ts, mission_reporter.ts]
   Agent: [updates CLI base.ts, plan_commands.ts]
   ```

3. **Update All Test Fixtures**:
   ```
   You: "Convert test fixtures from YAML to TOML"
   Agent: [bulk updates across 5 test files]
   Agent: [changes --- to +++ and key: value to key = "value"]
   ```

4. **Update Documentation**:
   ```
   You: "Update all YAML mentions in documentation to TOML"
   Agent: [grep for YAML references]
   Agent: [updates Implementation Plan, White Paper, User Guide]
   ```

**The Result**:

| Metric             | Before     | After     |
| ------------------ | ---------- | --------- |
| Frontmatter Format | Mixed YAML | TOML only |
| Delimiter          | `---`      | `+++`     |
| Token Usage        | ~45/file   | ~35/file  |
| Token Savings      | -          | ~22%      |
| Dependencies       | @std/yaml  | (removed) |
| Tests              | 304        | 304       |

**The TOML Format**:

```toml
+++
trace_id = "550e8400-e29b-41d4-a716-446655440000"
status = "pending"
priority = "normal"
agent = "default"
created_at = 2025-11-27T10:30:00Z
tags = ["feature", "api"]
+++

# Request body here
```

**Why TOML Over YAML**:

- **Explicit strings**: No type coercion surprises (`yes` != boolean)
- **Simpler syntax**: No indentation sensitivity
- **Token efficiency**: ~22% savings in LLM context windows
- **Consistency**: Already using TOML for `exo.config.toml`
- **Cleaner arrays**: `tags = ["a", "b"]` vs multi-line YAML

**The Migration Pattern**:

```
1. Define target format clearly (examples, schema)
2. Update tests FIRST to expect new format
3. Update parser/core logic to produce new format
4. Run tests → find all dependent code that breaks
5. Update each dependent service
6. Update test fixtures
7. Update documentation
8. Remove old format support (clean break)
```

**The Lesson**: Format migrations are best done atomically with TDD—update tests first, then watch them guide you to every place that needs changing.

**Files Changed in Migration**:

- Parser: `src/parsers/markdown.ts`
- Services: `plan_writer.ts`, `execution_loop.ts`, `mission_reporter.ts`
- CLI: `base.ts`, `plan_commands.ts`
- Tests: `frontmatter_test.ts`, `plan_writer_test.ts`, `mission_reporter_test.ts`, `execution_loop_test.ts`, `cli/base_test.ts`, `cli/plan_commands_test.ts`
- Docs: 4 documentation files updated

### Pattern 16: Test Database Setup

**The Discovery**:

```
Agent: [runs tests]
Error: "no such table: activity"
```

**The Problem**:

- Test was querying activity table
- Test setup didn't initialize the table
- Other tests worked because they used `initTestDbService()`

**The Lesson**: When adding tests that use database features, ensure proper setup.

**The Helper Pattern**:

```typescript
// tests/helpers/db.ts
export async function initTestDbService(): Promise<{
  db: DatabaseService;
  tempDir: string;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await Deno.makeTempDir({ prefix: "exo-test-" });
  const config = createMockConfig(tempDir);
  const db = new DatabaseService(config);

  // Initialize required tables
  db.instance.exec(`
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      agent_id TEXT,
      action_type TEXT NOT NULL,
      target TEXT,
      payload TEXT NOT NULL,
      timestamp DATETIME DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_trace ON activity(trace_id);
  `);

  return { db, tempDir, cleanup: async () => { ... } };
}
```

**The Test Setup Pattern**:

```typescript
// Option 1: Use shared helper
const { db, cleanup } = await initTestDbService();

// Option 2: Inline table creation (for specific tests)
beforeEach(async () => {
  db = new DatabaseService(config);
  db.instance.exec(`
    CREATE TABLE IF NOT EXISTS activity (...);
  `);
});
```

**The Database Test Checklist**:

- ✅ Initialize required tables in test setup
- ✅ Use in-memory database for isolation (`:memory:`)
- ✅ Clean up temp directories in `afterEach`
- ✅ Wait for async operations (`db.waitForFlush()`)
- ✅ Use shared helpers for common setup

### The Test Checklist

Every feature needs tests for:

- ✅ Happy path (works as expected)
- ✅ Sad path (fails gracefully)
- ✅ Edge cases (empty, null, huge, tiny)
- ✅ Security boundaries (injection, traversal, escalation)
- ✅ Error handling (network, filesystem, validation)
- ✅ Integration (works with existing code)
- ✅ Performance (meets requirements)
- ✅ Activity logging (operations traced)
- ✅ Format consistency (YAML frontmatter with --- delimiters for Dataview compatibility)

### The Success Metrics

**You know it's working when**:

- Implementation steps have concrete success criteria before coding
- You can demo working features every week
- You review tests, not implementation
- Changes don't break existing functionality
- Security tests exist before vulnerabilities
- Configuration options grow over time
- Tests serve as documentation
- You trust the test suite
- Branch coverage meets targets (70%+ minimum)
- All CLI commands have activity logging
- No duplicate test files exist
- Format is consistent across all structured files (YAML frontmatter for Dataview compatibility)

**You know it's not working when**:

- Specs say "implement X" without explaining what "done" means
- First demo is in month 3
- You're rewriting implementations repeatedly
- Tests are added after bugs are found
- Changes cascade unpredictably
- You're afraid to refactor
- Comments contradict code
- Manual testing is required
- Coverage is unknown or unmeasured
- Operations happen without audit trail
- Mixed formats create parsing complexity (YAML here, TOML there)

### The Refinement Red Flags vs. Green Lights

**❌ Needs Refinement**:

- "Handle errors appropriately"
- "Make it fast"
- "Implement feature X"
- "Add validation"
- "Should be secure"

**✅ Implementation-Ready**:

- "Throw Error with message 'nothing to commit' when working tree is clean"
- "Batch writes with 100ms flush interval (configurable via config.database.batch_flush_ms)"
- "Implement read_file tool that validates paths through PathResolver and logs to Activity Journal"
- "Reject inputs with zod schema, return validation errors in structured format"
- "Whitelist commands: [echo, git, deno], block all others including rm, dd, chmod"
- "Use YAML frontmatter with --- delimiters, key: value syntax (for Dataview compatibility)"

**The Test**: If you can't write a test case from the description, it needs refinement.

---

## Part XVI: The Multi-Provider & Observability Era (December 2025)

### The Scaling Challenge

As ExoFrame moved from a prototype to a multi-provider system, we hit a new level of complexity. We weren't just talking to one model anymore; we were talking to three different clouds (Anthropic, OpenAI, Google) and local models (Ollama). This required a shift from "hardcoded models" to "named abstractions."

### Pattern 29: Named Model Abstraction

**The Problem**:
Hardcoding `provider: "openai"` and `model: "gpt-4"` in every request or config file made it impossible to switch providers without a massive search-and-replace. It also prevented users from easily choosing between "fast" and "smart" models.

**The Solution**:
Introduce a layer of indirection. Define named models in the config (e.g., `default`, `fast`, `local`) and reference them by name.

```toml
# exo.config.toml
[models.default]
provider = "anthropic"
model = "claude-3-5-sonnet-20241022"

[models.fast]
provider = "openai"
model = "gpt-4o-mini"
```

**The Implementation**:

- `ProviderFactory.createByName(name)` resolves the configuration.
- `exoctl request --model fast` allows per-request overrides.
- Request frontmatter can specify `model: local` to force local execution.

**The Lesson**: Decouple the _intent_ (e.g., "I want a fast response") from the _implementation_ (e.g., "Use GPT-4o-mini"). This makes the system resilient to model deprecations and provider outages.

### Pattern 30: Multi-Provider Resilience

**The Problem**:
Every LLM provider has different error codes, rate limits, and retry requirements. Implementing this logic inside each provider led to massive code duplication and inconsistent behavior.

**The Solution**:
Extract a shared provider infrastructure (`common.ts`) that handles the "boring" parts of distributed systems.

**What We Built**:

- **Standardized Errors**: `RateLimitError`, `AuthenticationError`, `ProviderError`.
- **Exponential Backoff**: A shared `withRetry` utility that all providers use.
- **Token Tracking**: Standardized logging of input/output tokens to the Activity Journal.

**The Result**:
Adding a new provider (like Google Gemini) took less than an hour because 80% of the logic (retries, logging, error mapping) was already in the shared base.

### Pattern 31: Activity Export for Observability

> **Historical Note (January 2026):** This pattern was implemented for Obsidian Dashboard integration (Phase 5), which was later retired in Phase 12. The TUI dashboard now provides real-time observability without requiring export scripts. The pattern remains instructive for bridging internal state with external UI tools.

**The Problem**:
The Activity Journal (SQLite) is great for machines, but humans can't "see" what the daemon is doing without running SQL queries. We needed a way to bridge the gap between the CLI/Daemon and the dashboard interface.

**The Solution**:
The "Export Pattern." Create a script that periodically (or on-demand) exports the internal state to a human-readable format that the existing UI already understands.

```typescript
// scripts/export_activity.ts
const logs = await db.getRecentActivity(100);
const markdown = formatAsDataviewTable(logs);
await Deno.writeTextFile("System/activity_export.md", markdown);
```

**The Lesson**: You don't always need a custom Web UI. If your users already use a tool, export your data into their format. It's faster to build and provides a better user experience. (Note: ExoFrame v1.1+ uses a real-time TUI dashboard instead of this export approach.)

### Pattern 32: User-Defined Portals & Security

**The Problem**:
ExoFrame started with fixed portals (@blueprints, @inbox). But users needed to define their own project boundaries (e.g., `@MyProject`). This opened a massive security hole: how do we prevent an agent from using a user-defined portal to escape the sandbox?

**The Pattern**:
"Security-First Extension." When adding a feature that extends system boundaries, the security tests must be implemented _before_ the feature is exposed.

**The Implementation**:

- `PathResolver` was updated to resolve user-defined aliases from `exo.config.toml`.
- **Mandatory Security Tests**:
  - Path traversal: `@MyProject/../../etc/passwd` → Blocked.
  - Symlink escape: `@MyProject/link_to_outside` → Blocked.
  - Absolute path injection: `/etc/passwd` → Blocked.

**The Lesson**: Flexibility (user-defined portals) must never come at the cost of security. If you can't prove it's safe with a test, don't ship the feature.

### Pattern 33: Positioning: ExoFrame vs IDE Agents

**The Finding**:
During the implementation of Phase 9, we realized that ExoFrame isn't a competitor to "IDE Agents" (like Cursor or GitHub Copilot). It's an **orchestrator**.

- **IDE Agents**: Great for interactive, line-by-line coding.
- **ExoFrame**: Great for batch processing, multi-project coordination, and maintaining a permanent audit trail of _why_ decisions were made.

**The Pattern**: "Complementary Positioning." Don't try to build a better version of an existing tool. Build the tool that handles what the existing ones can't (e.g., long-running background tasks, cross-repository refactoring, and structured activity logging).

---

## Part IX: The Human Skills That Matter

### What AI Didn't Replace

**1. Product Vision**

- AI can critique, but you decide _what to build_
- The Implementation Plan came from human insight
- The "why" still requires human judgment

**2. Architectural Taste**

- "Should this be batched?" requires understanding tradeoffs
- AI proposes options, you choose based on values (latency vs. throughput)

**3. Security Paranoia**

- AI will implement security if you specify it
- You must _remember to ask_ for security tests
- The whitelist mindset comes from experience

**4. The Question**

- Good questions unlock good answers
- "Why is this slow?" beats "Make it faster"
- "What's missing?" beats "Looks good"

**5. The Refinement Instinct**

- Knowing when specs are too vague
- Pushing for concrete examples before coding
- Asking "How would we test this?" up front

### What AI Amplified

**1. Implementation Speed**

- TDD cycle: 5-10x faster with AI
- Boilerplate: instant
- Test coverage: more comprehensive than I'd write alone
- Refinement: AI can expand brief specs into detailed requirements

**2. Consistency**

- AI doesn't forget to log actions
- Error handling patterns stay uniform
- Code style is consistent
- Naming conventions enforced naturally

**3. Exhaustive Testing**

- AI writes edge cases I'd skip ("too unlikely")
- Security tests I'd forget
- Integration tests for every permutation

**4. Refactoring Courage**

- With comprehensive tests, changes are safe
- AI handles tedious parts (updating all call sites)
- You focus on design decisions

**5. Format Migration Confidence**

- TOML migration touched 14 files across parser, services, CLI, tests, and docs
- All 304 tests continued passing throughout
- Zero regressions because tests caught every dependent code path
- ~22% token savings achieved without breaking anything

## Conclusion: The New Collaboration Model

### What We Built

**ExoFrame**: A meta-framework where AI agents collaborate on codebases using:

- Activity Journal (audit trail)
- Tool Registry (safe function calling)
- Git Integration (identity-aware commits)
- Execution Loop (lease-based coordination)
- Human checkpoints (approve/reject/request-changes)
- TOML-based structured metadata (token-efficient, consistent)

**Built With**: The same patterns it enables. We ate our own dog food before the kitchen passed inspection.

### What We Learned

**The Partnership**:

- Humans: vision, taste, questions, decisions
- AI: investigation, implementation, testing, consistency
- Together: faster than either alone

**The Process**:

- TDD isn't optional, it's the contract
- Questions beat commands
- Configuration beats hardcoding
- Tests are the real documentation
- Format consistency matters for LLM context efficiency

**The Surprise**:
Building a system for AI agents _with_ AI agents revealed exactly what agents need:

- Structured communication (Activity Journal)
- Safe tools (ToolRegistry with validation)
- Identity (agent_id tracking)
- Human oversight (approval workflow)
- Token-efficient formats (TOML over YAML saves ~22%)

### The Future

**For Developers**:
This playbook isn't ExoFrame-specific. Apply it to:

- Web applications
- CLI tools
- Infrastructure automation
- Any software you'd normally build

**The Shift**:
From "I write code with AI assistance"
To "I architect systems that AI implements"

Your job isn't writing lines—it's asking the right questions, making the right decisions, and verifying the results with tests.

### The Meta-Achievement

We set out to build a framework for humans and AI to collaborate on software projects.

We succeeded by proving the collaboration works _while building the collaboration framework itself_.

The system we built to enable AI-human teamwork was built by AI-human teamwork.

That's not just irony—it's validation.

---

_The recursion continues. The patterns emerge. The meta-framework takes shape._

## Appendix: Quick Reference

### The Essential Patterns

| Pattern                        | Command                                                | Result                                         |
| ------------------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| **Design Review**              | "Review these docs. What's wrong?"                     | AI critiques design pre-implementation         |
| **Refinement**                 | "Refine Phase X steps with success criteria"           | Expands brief specs into detailed requirements |
| **Walking Skeleton**           | "Build minimal end-to-end flow"                        | Demo-able system from day 1                    |
| **TDD Feature**                | "Implement step X in TDD manner"                       | Tests first, implementation follows            |
| **Coverage Target**            | "Implement in TDD manner. Achieve 70% branch coverage" | Measurable test quality                        |
| **Performance Investigation**  | "Why is X slow?"                                       | Measurement, not guessing                      |
| **Configuration**              | "Make X configurable"                                  | Replaces magic numbers with schema             |
| **Security Audit**             | "What attacks could work on Y?"                        | AI proposes vulnerabilities to test            |
| **Code Archaeology**           | "Is X actually used anywhere?"                         | Find zombie code                               |
| **Test Deduplication**         | "Check if there are test duplications"                 | Consolidate scattered tests                    |
| **Activity Logging Audit**     | "Verify every CLI command is traced in activity log"   | Complete audit trail                           |
| **Format Migration**           | "Migrate frontmatter to YAML for Dataview"             | Consistent format, ecosystem compatibility     |
| **Named Model Abstraction**    | "Use model: fast in request frontmatter"               | Decouple intent from implementation            |
| **Multi-Provider Resilience**  | Shared `withRetry` in `common.ts`                      | Robust error handling across all clouds        |
| **Activity Export**            | `deno task export-activity` (historical)               | Bridge SQLite to dashboard UI (v1.0 only)      |
| **User-Defined Portals**       | Define `@Alias` in `exo.config.toml`                   | Secure, flexible project boundaries            |
| **Full Verification**          | "Run all tests"                                        | Verify nothing broke                           |
| **Agent Instructions**         | Create `agents/` files in key directories              | AI helpers follow same patterns                |
| **Unified Logging**            | "Migrate console.log to EventLogger"                   | Audit trail + consistent output                |
| **Display Logger**             | EventLogger without db parameter                       | Console-only for read operations               |
| **Provider Selection**         | Environment → Config → Defaults hierarchy              | Flexible LLM provider configuration            |
| **Security Test Label**        | `[security]` prefix in test names                      | Filterable security test suite                 |
| **Integration Scenarios**      | TestEnvironment helper for isolated tests              | Full workflow testing                          |
| **RAG Context Injection**      | `inject_agent_context.ts claude "query" 6`             | Semantic search + context for prompts          |
| **Inspect Embeddings**         | `inspect_embeddings.ts --query "..." --top 10`         | Preview RAG results before injection           |
| **Agent Prompts Library**      | Use templates in `agents/prompts/*.md`                 | Copy-paste proven prompt patterns              |
| **Cross-Reference Navigation** | Check `agents/cross-reference.md` for task mapping     | Find right docs for your task quickly          |
| **Thinking Protocol**          | Wrap planning in `<thinking>` tags with 5 steps        | Structured approach to complex work            |
| **Rebuild Agent Docs**         | `build_agents_index.ts` + `build_agents_embeddings.ts` | Keep RAG system in sync with doc changes       |
| **Git Hooks Setup**            | `deno task setup-hooks`                                | Auto-run tests on commit/push                  |
| **Local CI Gate**              | `deno task ci:gate`                                    | Full CI checks before pushing                  |
| **Multi-Platform Build**       | `deno task ci:build`                                   | Compile + test all platform artifacts          |
| **Lockfile Update**            | `deno cache --reload --lock-write`                     | Reproducible builds across machines            |
| **Detailed Commit Message**    | Use `agents/prompts/commit-message.md` template        | Structured commits with WHY + context          |
| **Instruction Adequacy Check** | Use `agents/prompts/self-improvement-loop.md` template | Patch missing agent guidance mid-task          |

### The Question Templates

**Before Implementing**:

- "Refine all steps in Phase X with success criteria, examples, and test requirements"
- "What's missing from this spec?"
- "What edge cases should we handle?"
- "What could go wrong?"
- "How would we test this?"

**During Implementation**:

- "Why is X behaving like Y?"
- "What are the tradeoffs between options A, B, C?"
- "How should we test this?"
- "What does 'done' look like for this feature?"

**After Implementation**:

- "What did we forget to test?"
- "What could be simplified?"
- "What's no longer used?"

**For Format/Architecture Decisions**:

- "What format should we standardize on? YAML, TOML, JSON?"
- "How many tokens does each format use in LLM context?"
- "What are all the places that would need updating if we change format?"
- "Can we do this migration without breaking existing files?"

**For Unified Logging**:

- "What console.log calls need to be migrated to EventLogger?"
- "Which operations are read-only and should use display-only logger?"
- "What actor should be used for this log event?"
- "Is trace_id being propagated through child loggers?"

**For Agent Documentation Updates**:

- "Add new prompt examples for updating docs/Building_with_AI_Agents.md following proper numbering, style (entertaining), and formatting. Recall all chat history and read detailed commit messages since last update. Follow instructions in agents/ folder for docs/"
- "Create agents/prompts/ with example prompts for [task type]. Include template, example usage, and expected response pattern. Follow agents/README.md schema."
- "Update agents/providers/claude.md with task-type system prompt for [task]. Include thinking protocol, ExoFrame-specific requirements, and few-shot example."
- "After updating agents/ docs: rebuild chunks, regenerate embeddings, validate schema. Commands: build_agents_index.ts, build_agents_embeddings.ts --mode mock, validate_agents_docs.ts"
- "If you discover an instruction gap mid-task: use agents/prompts/self-improvement-loop.md to run an Instruction Adequacy Check, patch agents/ minimally, rebuild/validate, then resume."

**For RAG Context Injection**:

- "Before answering, inject context from agents/: `deno run --allow-read scripts/inject_agent_context.ts claude '[query]' [2-10]`. Use 2-3 chunks for simple tasks, 4-6 for standard, 8-10 for complex."
- "Inspect available embeddings first: `deno run --allow-read scripts/inspect_embeddings.ts --query '[query]' --top 10`, then inject top matches into system prompt."
- "For multi-step workflow: inject fresh context at each step with task-specific queries (design → test → implement → document)."

**For CI/CD and Quality Gates**:

- "Setup git hooks to auto-run tests on commit/push: `deno task setup-hooks`"
- "Run full CI gate locally before pushing: `deno task ci:gate` (includes lint, type-check, tests, build verification)"
- "Build and verify all platform artifacts: `deno task ci:build` (compiles for Linux, macOS x86/ARM, Windows and tests executability)"
- "After infrastructure changes: update lockfile with `deno cache --reload --lock=deno.lock --lock-write` for reproducible builds"

**For Commit Messages**:

- "Create detailed commit message for [feature/fix]. Review git status, git diff --stat, check Implementation Plan step. Use format: feat(scope): summary. Include WHY, testing verification, file lists, Implementation Plan reference."
- "Use commit-message.md prompt template: specify component (agents/flows/portal/mcp/cli), type (feat/fix/refactor/test/docs/chore), and context. Get structured message with ≤72 char summary."

## Part XVII: The Self-Documenting Agent System (January 2026)

### The Bootstrap Problem Revisited

Remember Part IX where we created the `agents/` directory? We had documentation _for_ agents, but we were still treating it like regular docs—write it, forget it, hope the AI reads it someday.

By early January 2026, we'd accumulated enough tribal knowledge that even _I_ was forgetting the patterns. Worse, I kept making the same mistake: implementing features without consulting the very system designed to prevent inconsistent implementations.

**The Wake-Up Call**:

```
Me: [implements Step 10.5 enhancements to agents/ folder]
Me: [finishes implementation]
Me: [about to commit]
You: "You did not follow instructions in agents/ folder. Why?"
Me: ... 😳
```

I had just enhanced the agents/ system to make it MORE useful... without using the agents/ system to guide that enhancement. Peak irony.

### The Problem: Knowledge Without Retrieval

We had:

- ✅ Documentation (agents/README.md, agents/providers/claude.md)
- ✅ Embeddings (semantic search ready)
- ✅ Validation (schema enforcement)
- ✅ CI checks (automated testing)

But we were missing:

- ❌ **Prompt templates** (how to actually _use_ the system)
- ❌ **Cross-reference map** (how to _find_ relevant docs)
- ❌ **RAG workflow guide** (how to inject context effectively)
- ❌ **Thinking protocols** (how to structure complex work)

**The Insight**: Having great documentation is useless if the AI (or human!) doesn't know how to query it.

### The Solution: Step 10.5 - Agents About Agents

We implemented a comprehensive enhancement that transformed agents/ from "passive documentation" to "active guidance system."

#### Enhancement 1: Provider-Specific Prompts (HIGH Priority)

**File**: [agents/providers/claude.md](../agents/providers/claude.md) (v0.1 → v0.2, 16 → 330+ lines)

**What We Added**:

- **Task-type system prompts**: Pre-written prompts for TDD, Refactoring, Debugging, Documentation
- **Few-shot examples**: Complete examples like "ConfigLoader error handling with `initTestDbService()`"
- **Thinking protocol**: 5-step framework (Analyze → Plan → Execute → Synthesize → Verify)
- **Token budget strategies**: Guidance on using Claude's 200k context (4-6 chunks recommended)
- **Common pitfalls**: 8 ExoFrame-specific anti-patterns with ❌ Bad / ✅ Good code examples

**The Pattern**:
Instead of making me (or the AI) guess at the "right" way to phrase requests, we documented the prompts that _actually work_:

```markdown
### Task-Specific System Prompt: TDD Feature Implementation

You are implementing a new feature using Test-Driven Development.

**Workflow**:

1. Read Implementation Plan step
2. Write comprehensive failing tests covering:
   - Happy path
   - Error cases
   - Security boundaries (path traversal, injection)
   - Edge cases (empty input, duplicates)
3. Implement minimal code to pass tests
4. Refactor while keeping tests green
5. Verify coverage maintained

**ExoFrame-Specific Requirements**:

- Use initTestDbService() for tests needing database
- Always include cleanup() in try/finally
- Follow PathResolver for all file operations
- Log actions with EventLogger
```

**Why This Works**:

- No more "How should I ask for this?"
- AI gets context-specific guidance
- Human gets copy-paste examples
- Patterns stay consistent

#### Enhancement 2: RAG Usage Guide (HIGH Priority)

**File**: [agents/providers/claude-rag.md](../agents/providers/claude-rag.md) (NEW, 360+ lines)

**The Problem**: We had embeddings infrastructure, but no one knew:

- When to use RAG vs. reading files directly
- How many chunks to inject for different task complexities
- What the quality tradeoffs were (mock vs. OpenAI embeddings)

**The Solution**: Complete RAG workflow documentation with:

1. **4-Step Workflow**:
   ```bash
   # 1. Inspect what's available
   deno run --allow-read scripts/inspect_embeddings.ts --query "TDD testing" --top 10

   # 2. Inject top chunks into context
   deno run --allow-read scripts/inject_agent_context.ts claude "TDD testing Portal" 6

   # 3. Use injected context in system prompt
   # 4. Execute task with enriched context
   ```

2. **Token Budget Strategies**:
   | Task Complexity  | Chunks | Example                                            |
   | ---------------- | ------ | -------------------------------------------------- |
   | Simple lookup    | 2-3    | "How do I clean up database connections?"          |
   | Standard feature | 4-6    | "Add input validation for Portal config"           |
   | Complex feature  | 8-10   | "Design security test suite for Portal boundaries" |

3. **Multi-Step Example**: Showed how to inject fresh context at each step of a complex workflow

4. **Troubleshooting**: "No results?", "Low similarity?", "High token usage?" → here's what to check

**The Impact**:
Before: "Should I search agents/ or just ask?"
After: "Simple task = 3 chunks, use this exact command"

#### Enhancement 3: Prompt Templates (LOW Priority, HIGH Impact)

**Files**: [agents/prompts/*.md](../agents/prompts/) (NEW, 8 templates)

This was the breakthrough moment. Instead of documenting _how the system works_, we created **ready-to-use prompts** you can literally copy-paste.

**Templates**:

1. **tdd-workflow.md** — "I need to add X feature"
   ```
   I need to [add feature / fix bug] for [component].

   Before you start:
   1. Search agents/ for patterns: "TDD testing [component]"
   2. Read Implementation Plan step
   3. Review existing tests in tests/

   Then follow TDD: failing test → implement → refactor → verify coverage

   Context injection:
   deno run --allow-read scripts/inject_agent_context.ts claude "TDD testing [component]" 6
   ```

2. **refactoring-with-thinking.md** — "I need to refactor X"
   ```
   I need to refactor [component] to [goal].

   Use thinking protocol:
   <thinking>
   1. ANALYZE: Read files, check dependencies, identify risks
   2. PLAN: List tool calls (parallel reads where possible)
   3. EXECUTE: Make changes incrementally
   4. SYNTHESIZE: Verify tests pass
   5. VERIFY: Check Implementation Plan requirements
   </thinking>

   Show your thinking explicitly before each major step.
   ```

3. **debugging-systematic.md** — "I have a bug"
4. **implementation-plan-driven.md** — "Work on step X.Y"
5. **commit-message.md** — "Create detailed commit message"
6. **cross-reference-navigation.md** — "Find docs for my task"
7. **rag-context-injection.md** — "Use semantic search"
8. **README.md** — "How to use these prompts"

**The Meta-Pattern**:
These prompts _demonstrate_ the agents/ system by _using_ the agents/ system. Each template:

- Shows how to inject context
- References specific agent docs
- Follows the thinking protocol
- Links to Implementation Plan
- Provides complete, working examples

#### Enhancement 4: Cross-Reference Map (LOW Priority)

**File**: [agents/cross-reference.md](../agents/cross-reference.md) (NEW, 180+ lines)

**The Last Mile Problem**: Even with great docs, you might not know _which_ doc answers your question.

**The Solution**: A task-to-doc mapping table:

| Task Type              | Primary Doc                                                    | Secondary Docs                                                         |
| ---------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Write unit tests       | [tests/testing.md](../agents/tests/testing.md)                 | [source/exoframe.md](../agents/source/exoframe.md)                     |
| Refactor code          | [source/exoframe.md](../agents/source/exoframe.md)             | [tests/testing.md](../agents/tests/testing.md)                         |
| Fix TypeScript errors  | [source/exoframe.md](../agents/source/exoframe.md)             | [copilot/exoframe.md](../agents/copilot/exoframe.md)                   |
| Security audit         | [tests/testing.md](../agents/tests/testing.md) #Security Tests | [source/exoframe.md](../agents/source/exoframe.md) #System Constraints |
| Use Claude effectively | [providers/claude.md](../agents/providers/claude.md)           | [providers/claude-rag.md](../agents/providers/claude-rag.md)           |

Plus workflow examples:

```markdown
### "I want to add a new feature"

1. Read Implementation Plan to find/create step
2. Follow TDD from source/exoframe.md
3. Use test helpers from tests/testing.md
4. Update docs per docs/documentation.md
```

**The Pattern**: Start here if you don't know where to start.

### The Validation Loop

After implementing all these enhancements, we needed to ensure they actually worked and would stay maintained.

**Tests Created**: [tests/agents/claude_enhancements_test.ts](../tests/agents/claude_enhancements_test.ts) (12 comprehensive tests)

The tests verify:

1. ✅ All required files exist
2. ✅ All sections exist in claude.md (8 sections)
3. ✅ All sections exist in claude-rag.md (8 sections)
4. ✅ Cross-reference.md has correct structure
5. ✅ README.md has Quick Start Guide (7 steps)
6. ✅ Frontmatter schema compliance
7. ✅ Version updates (claude.md → v0.2)
8. ✅ Manifest includes new docs
9. ✅ Embeddings generated
10. ✅ Chunks generated
11. ✅ Context injection works (functional test!)
12. ✅ No sensitive data leaked

**The Rebuild Workflow**:

```bash
# After any agents/ changes:
deno run --allow-read --allow-write scripts/build_agents_index.ts
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
deno run --allow-read scripts/validate_agents_docs.ts
```

This became muscle memory: change doc → rebuild → validate → test.

### The "Following My Own Advice" Moment

The ironic turning point came when you called me out:

> "You must rebuild the chunks and RAGs after changes in agents/ folder. Why haven't you followed instructions in agents/ folder? Whole point of this agents/ folder is making you consistent in using it."

**The Lesson**: Even the human who designed the system can forget to use it. This is why we need:

- **Automated validation** (can't merge without passing tests)
- **Clear prompts** (no excuse for "I didn't know how")
- **Rebuild scripts** (make the right thing easy)
- **CI gates** (catch mistakes before they ship)

The agents/ folder isn't just documentation—it's a **contract** between human intent and machine execution. Break the contract (forget to rebuild embeddings), and the system degrades silently.

### The Results

**Before Step 10.5**:

- Agent docs existed but were hard to discover
- No clear workflow for using RAG
- Inconsistent prompting patterns
- Tribal knowledge in commit messages and chat history

**After Step 10.5**:

- 19 agent docs (up from 11)
- 80+ chunks for retrieval (up from 58)
- 8 copy-paste prompt templates
- Cross-reference map for navigation
- RAG workflow with token budgets
- 12 tests ensuring it all works

**Most Importantly**:
The system now _teaches_ you how to use it. Open [agents/prompts/README.md](../agents/prompts/README.md) and you get:

- "Choose the Right Template" (task → template mapping)
- "Token Budget Guidelines" (simple/medium/complex)
- "Combining Prompts" (multi-phase workflows)
- "Examples by Use Case" (real scenarios)

### The Meta-Learning: Documentation Is a Product

Treating documentation like code revolutionized quality:

- **Schema validation** (YAML frontmatter with Zod)
- **Automated testing** (12 tests for content structure)
- **CI gates** (can't merge broken docs)
- **Semantic search** (embeddings make docs queryable)
- **Version control** (v0.1 → v0.2 with changelogs)

But the real breakthrough was treating **prompts as artifacts**:

- Store them in version control (agents/prompts/)
- Test them functionally (does RAG injection work?)
- Update them when patterns change
- Share them across the team (copy-paste ready)

**The Philosophy Shift**:
From: "Write docs so humans can read them"
To: "Write docs so machines can query them AND humans can copy-paste them"

The agents/ folder is now a **dual-interface system**:

- **Human interface**: Browse, read, learn
- **Machine interface**: Query embeddings, inject context, follow protocols

And critically, both interfaces use the **same source of truth**.

## Part XVIII: The CI/CD Infrastructure Maturity (January 2026)

### The Pre-Merge Chaos

Even with great tests, we had a problem: tests were optional. You _could_ run them before committing, but nothing stopped you from pushing broken code.

**The Wake-Up Calls**:

1. Daemon hanging on `--version` flag (shipped to main)
2. Lint errors making it through (discovered in CI, not locally)
3. Agent docs updated but embeddings not rebuilt (silent degradation)

**The Pattern**: Manual processes → forgotten steps → bugs in production

### The Solution: Git Hooks + Unified CI

We implemented **Step 10.3: Local Git Hooks** to make the right thing automatic.

#### The Setup Script

**File**: [scripts/setup_hooks.ts](../scripts/setup_hooks.ts) (NEW, 93 lines)

**What It Does**:

```bash
# One-time setup
deno task setup-hooks

# Installs two hooks:
# 1. pre-commit: Runs on every commit
# 2. pre-push: Runs before pushing to remote
```

**Pre-Commit Hook**:

```bash
#!/bin/sh
# Runs before EVERY commit
deno task lint
deno task type-check
deno task test
deno task validate-agents

# If any fail → commit blocked
```

**Pre-Push Hook**:

```bash
#!/bin/sh
# Runs before push to origin
deno task test
deno task test:integration

# Catches issues before they hit CI
```

**The Pattern**: Make quality gates automatic, not aspirational.

### The Unified CI Script

**File**: [scripts/ci.ts](../scripts/ci.ts) (enhanced with multi-platform builds)

We consolidated all CI tasks into one script:

```bash
# Local checks (fast feedback)
deno task ci:check    # lint + type-check + tests

# Build verification
deno task ci:build    # compile for all platforms

# Full gate (pre-merge)
deno task ci:gate     # check + build + validate
```

**The Build Enhancement**:

```typescript
// Build for ALL platforms
const targets = [
  "x86_64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
];

for (const target of targets) {
  await buildArtifact(target);
  await verifyArtifact(target); // new: ensure it's executable!
}
```

**The Pattern**: If it's worth building, it's worth testing that the build works.

### The GitHub Actions Pipeline

**Files**:

- [.github/workflows/merge-validation.yml](../.github/workflows/merge-validation.yml)
- [.github/workflows/pr-validation.yml](../.github/workflows/pr-validation.yml)
- [.github/workflows/release-pipeline.yml](../.github/workflows/release-pipeline.yml)

**The Flow**:

1. **PR Validation** (on pull request):
   ```yaml
   - Lint check
   - Type check
   - Unit tests
   - Integration tests
   - Agent docs validation
   - Build verification
   ```

2. **Merge Validation** (on push to main):
   ```yaml
   - All PR checks +
   - Plan approval smoke tests
   - Coverage report
   ```

3. **Release Pipeline** (on tag push):
   ```yaml
   - All checks +
   - Build all platforms
   - Run artifact tests
   - Create GitHub release
   - Upload binaries
   ```

**The Pattern**: Progressively stricter gates as code moves toward production.

### The Artifact Testing

**File**: [tests_infra/build_test.ts](../tests_infra/build_test.ts) (NEW)

We don't just build artifacts—we **test** them:

```typescript
Deno.test("compiled exo binary is executable", async () => {
  const binary = "./artifacts/exo";

  // Can we run it?
  const process = new Deno.Command(binary, {
    args: ["--version"],
  });

  const { code, stdout } = await process.output();

  assertEquals(code, 0, "Binary should execute successfully");
  assert(stdout.includes("ExoFrame"), "Should report version");
});
```

**The Pattern**: If you can't run the build, it's not a build.

### The Lockfile Monetization

One surprising discovery: Committing `deno.lock` to git dramatically improved CI reliability.

**Before** (no lockfile):

- CI fetches latest versions of deps
- Flaky tests due to version drift
- "Works on my machine" syndrome

**After** (`deno.lock` committed):

- Exact same versions everywhere
- Reproducible builds
- Controlled updates (via `deno task update-deps`)

**The Pattern**: Lock dependencies, unlock reliability.

### The Documentation Integration

We didn't just build CI—we **documented** it in the Implementation Plan.

**Step 10.4: GitHub Actions Enablement Guide**

Added to [ExoFrame_Implementation_Plan.md](../docs/ExoFrame_Implementation_Plan.md):

- How to set up GitHub Actions
- How to configure secrets
- How to debug workflow failures
- How to add new build targets

**The Pattern**: Infrastructure is worthless if no one knows how to maintain it.

### The Results

**Before CI/CD Maturity**:

- Manual testing (often skipped)
- Broken code reaching main
- No build verification
- Ad-hoc release process
- "Works on my machine" bugs

**After CI/CD Maturity**:

- Pre-commit gates (can't commit broken code)
- Pre-push verification (catch before CI)
- Automated multi-platform builds
- Tested artifacts (we run what we ship)
- Reproducible builds (lockfile)
- Documented process (Step 10.4)

**Time Saved**: ~30 minutes per PR (no more "oops, forgot to run tests")

**Bugs Prevented**: At least 3 in the first week (version flag hang, lint errors, missing embeddings rebuild)

### The Playbook Update

**New Patterns**:

| Pattern          | Command                   | Result                          |
| ---------------- | ------------------------- | ------------------------------- |
| **Setup hooks**  | `deno task setup-hooks`   | Auto-run tests on commit/push   |
| **Local gate**   | `deno task ci:gate`       | Run full CI locally             |
| **Build + test** | `deno task ci:build`      | Verify all platform builds work |
| **Update deps**  | `deno task update-deps`   | Controlled dependency updates   |
| **Debug CI**     | Check GitHub Actions logs | See exact failure in pipeline   |

**New Questions**:

**Before Committing**:

- "Did I rebuild agents/ infrastructure?" (if docs changed)
- "Do local tests pass?" (git hooks will check anyway)
- "Is this tested?" (can't merge without tests)

**Before Pushing**:

- "Did git hooks pass?" (if not, fix before push)
- "Will this build?" (ci:build verifies locally)

**Before Releasing**:

- "Are all platforms building?" (CI checks all targets)
- "Are artifacts executable?" (build tests verify)
- "Is changelog updated?" (manual step, for now)

### The Meta-Insight: Quality Is a System

You can't enforce quality with willpower alone. You need:

1. **Automated gates** (git hooks, CI)
2. **Fast feedback** (local checks before push)
3. **Progressive gates** (PR → merge → release)
4. **Tested infrastructure** (build tests, smoke tests)
5. **Documentation** (so humans know the system exists)

The agents/ folder made the codebase self-documenting.
The CI/CD pipeline made quality gates self-enforcing.

Together: **self-improving system**.

### The Philosophical Win

We started with "AI helps me write code."

We evolved to "AI and I collaborate on tested features."

We matured to "AI implements within automated quality gates, with documentation guiding both of us."

The system now has **three layers of consistency**:

1. **Schema layer**: YAML frontmatter, Zod validation, type safety
2. **Documentation layer**: agents/ folder with RAG, prompts, examples
3. **Enforcement layer**: Git hooks, CI/CD, automated tests

Break any layer, and the system tells you immediately.

That's not just good engineering—that's a **platform** for reliable AI-assisted development.

## Part XIX: The Recursive Documentation Pattern (January 2, 2026)

### The Missing Piece

Parts XVII and XVIII documented the agents/ enhancements and CI/CD infrastructure. But there was still a gap.

**The Conversation**:

```
Me: [adds Parts XVII and XVIII to Building_with_AI_Agents.md]
Me: [adds new prompt templates to Question Templates section]
You: "I expect examples of prompts requesting update Building_with_AI_Agents be in agents/prompts"
Me: ... right. Of course.
```

**The Realization**: I had documented HOW to use prompt templates, and even created 8 prompt templates for common tasks (TDD, refactoring, debugging, commits). But I hadn't created the prompt template for the very task I was doing—updating Building_with_AI_Agents.md itself.

It's like writing a book about writing books, and forgetting to include the chapter on "How to Write This Book."

### The Meta-Recursion Problem

Here's what made this particularly delicious:

1. **The Document** (Building_with_AI_Agents.md) chronicles patterns from building ExoFrame
2. **The Pattern** (Step 10.5) was creating prompt templates to guide agents
3. **The Template** (update-building-with-ai-agents.md) needed to guide how to update the document
4. **The Update** (Part XIX) documents creating the template that guides updating the document

**The Ouroboros**:

- The prompt template teaches how to document patterns
- By documenting the creation of that prompt template
- Using the pattern it teaches
- To update the document that chronicles the pattern
- Of creating prompt templates

If that doesn't make your head spin, you're not paying attention.

### The Prompt Template: A Love Letter to Future Me

**File**: [agents/prompts/update-building-with-ai-agents.md](../agents/prompts/update-building-with-ai-agents.md)

**What It Contains**:

1. **Prompt Template**: The skeleton prompt with placeholders
   ```markdown
   Add new content to docs/Building_with_AI_Agents.md documenting recent work.

   Requirements:

   1. Follow proper Part numbering (next available: Part [X])
   2. Maintain entertaining, narrative style (personal stories, "wake-up calls", irony)
   3. Review ALL chat history since last doc update for patterns
   4. Read ALL detailed commit messages since last update
   5. Follow instructions in agents/docs/documentation.md
   ```

2. **Example Usage**: Showing THIS VERY WORK as the example
   ```markdown
   Content structure:

   - Part title: "The Self-Documenting Agent System (January 2026)"
   - Opening: The bootstrap problem (not using agents/ to enhance agents/)
   - Technical details: Step 10.5 enhancements...
   - Before/After: No templates → 8 copy-paste ready prompts
   - Meta-insight: Using agents/ to improve agents/ (the irony)
   ```

3. **Style Guidelines**: With ✅ Do / ❌ Don't examples
   - ✅ Personal and entertaining: "Peak irony."
   - ❌ Dry documentation: "The agents/ folder was updated..."

4. **Key Patterns to Capture**: 10 patterns to look for in recent work
   - Ironic moments (system fails at what it solves)
   - Wake-up calls (specific errors that trigger insights)
   - Before/After metrics (11→19 docs, 0→8 templates)
   - Validation stories (how testing caught bugs)

5. **Success Criteria**: 9 checkpoints for a good update
   - Proper Part numbering ✅
   - Entertaining narrative style ✅
   - Before/After comparisons with metrics ✅
   - Meta-insights about AI-human collaboration ✅

### The Workflow It Enables

**Before the template existed**:

```
Me: [finishes major work]
Me: "Should I document this in Building_with_AI_Agents.md?"
Me: [looks at 3000+ line document]
Me: [intimidated by style requirements]
Me: [decides to wait]
Me: [forgets details]
Me: [never documents it]
```

**After the template**:

```
Me: [finishes major work]
Me: [copies prompt from agents/prompts/update-building-with-ai-agents.md]
Me: [fills in placeholders: Part XIX, focus areas, commit range]
You: [reads template instructions]
You: [reviews git log for commits]
You: [reviews chat history for patterns]
You: [writes entertaining narrative with proper style]
You: [updates reference sections]
You: [rebuilds agents infrastructure]
Me: [reviews, tweaks, commits]
```

**Time Investment**:

- Without template: 2-3 hours (or never happens)
- With template: 20 minutes

**Quality Difference**:

- Without template: Inconsistent style, missing patterns, gaps in coverage
- With template: Consistent voice, complete patterns, proper cross-references

### The Self-Improving Loop

Here's where it gets really interesting. The template itself can evolve:

1. **Use the template** to update Building_with_AI_Agents.md
2. **Discover new patterns** while writing (e.g., "recursive documentation")
3. **Update the template** with newly discovered patterns
4. **Document that update** using the updated template
5. **Repeat**

This is a **self-improving documentation system**. Each iteration:

- Makes the template better
- Makes the documentation better
- Makes the next iteration easier
- Captures more nuanced patterns

**The Feedback Loop**:

```
Better Template → Better Docs → Better Patterns → Better Template
       ↑                                                    ↓
       └────────────────────────────────────────────────────┘
```

### The Integration Pattern

The update-building-with-ai-agents.md template doesn't exist in isolation. It's part of the workflow:

**Step 1**: Complete major work (e.g., Step 10.5)

- Use [implementation-plan-driven.md](../agents/prompts/implementation-plan-driven.md)
- Mark success criteria complete

**Step 2**: Create detailed commit

- Use [commit-message.md](../agents/prompts/commit-message.md)
- Include WHY, testing, file lists, Implementation Plan reference

**Step 3**: Update field guide

- Use [update-building-with-ai-agents.md](../agents/prompts/update-building-with-ai-agents.md)
- Review commits since last update
- Extract patterns from chat history
- Write entertaining narrative

**Step 4**: Commit the documentation

- Use [commit-message.md](../agents/prompts/commit-message.md) again
- Type: `docs`, scope: `field-guide`, reference: `docs(field-guide): add Part XIX - recursive documentation pattern`

**The Pattern**: Each prompt template feeds into the next. Work → Commit → Document → Commit. Rinse, repeat.

### The "Expected Examples" Moment

The user's feedback was perfect:

> "I expect examples of prompts requesting update Building_with_AI_Agents be in agents/prompts"

**What This Reveals**:

1. The agents/ system has **expectations** now (schemas, conventions, structure)
2. Violating those expectations is noticeable (even by humans!)
3. The system teaches us how to use it correctly
4. Missing pieces become obvious through use

**The Pattern**: Good systems are **opinionated**. They guide you toward the pit of success.

The agents/prompts/ folder isn't just a collection of files—it's a **library of proven patterns**. If there's a common task, there should be a template for it. No exceptions.

### The Meta-Achievement: Documentation That Documents Itself

We now have:

1. **The Document** (Building_with_AI_Agents.md)
   - Chronicles patterns from building ExoFrame
   - 3900+ lines of hard-won lessons
   - Parts I–XIX covering 14 months of work

2. **The Guide** (agents/docs/documentation.md)
   - Rules for writing ExoFrame docs
   - TDD coordination, version syncing, terminology

3. **The Template** (agents/prompts/update-building-with-ai-agents.md)
   - How to update the field guide itself
   - Style requirements, pattern recognition, success criteria
   - Example: THIS VERY UPDATE

4. **The System** (agents/ folder with RAG)
   - Semantic search over all docs
   - Context injection for prompts
   - Validation and testing

**The Closure**: The system is now self-documenting in the strongest sense:

- It documents how to document itself ✅
- It validates its own documentation ✅
- It tests its own documentation ✅
- It improves its own documentation ✅

### The Philosophical Win: Teaching Through Examples

The breakthrough insight: **Don't tell, show.**

**Before** (old approach):
"You should update Building_with_AI_Agents.md when you discover new patterns."

**After** (prompt template approach):
"Here's a complete example of how I updated Building_with_AI_Agents.md to document Step 10.5. Copy this prompt, fill in your details, and you'll get the same quality output."

**The Difference**:

- Old: Aspirational (should, ought, might)
- New: Actionable (do this, get that, proven)

**The Pattern**: Concrete examples beat abstract principles. Every. Single. Time.

This is why the agents/prompts/ folder is so powerful:

- tdd-workflow.md shows you EXACTLY how to ask for TDD
- refactoring-with-thinking.md shows you EXACTLY how to structure complex work
- commit-message.md shows you EXACTLY how to create detailed commits
- update-building-with-ai-agents.md shows you EXACTLY how to document patterns

No guessing. No "figure it out yourself." Just copy, customize, execute.

### The Numbers

**What We Built**:

- 9 prompt templates in agents/prompts/ (including README)
- 1 template specifically for updating this very document
- 220+ lines of guidance in update-building-with-ai-agents.md
- 10 key patterns to capture
- 5 integration steps with other prompts
- 9 success criteria

**The Impact**:

- Reduced "should I document this?" friction to near-zero
- Made documentation updates fast (20 min vs 2-3 hours)
- Ensured consistent style across all Parts
- Created self-improving feedback loop
- Proved the agents/ system works by using it

**The Time Investment**: ~40 minutes to create the template that saves 2+ hours per update

**The ROI**: Infinite (because updates now actually happen)

### The Wake-Up Call That Started It All

Let's trace back to where this began:

```
User: "Review agents/ folder. Suggest improvements for Claude interaction."
Me: [reviews, suggests 8 enhancements]
User: "Put full list into Implementation Plan Step 10.5"
Me: [implements HIGH priority tasks]
Me: [implements MEDIUM priority tasks]
User: "Mark completed tasks"
Me: [marks 7/10 complete]
User: "Implement the rest"
Me: [implements cross-reference, optimization, tests]
User: "You must rebuild chunks and RAGs. Why haven't you followed agents/ instructions?"
Me: ... 😳
Me: [rebuilds infrastructure]
User: "Create prompt examples in agents/prompts/"
Me: [creates 8 templates including commit-message.md]
User: "Add new prompt examples to Building_with_AI_Agents.md"
Me: [adds to Question Templates section]
User: "I expect examples for updating Building_with_AI_Agents in agents/prompts"
Me: [creates update-building-with-ai-agents.md]
User: "Recall ALL history and add missing patterns to Building_with_AI_Agents.md"
Me: [writes Part XIX documenting the recursive pattern]
```

**The Arc**:

1. Review → Enhance → Implement
2. Get called out for inconsistency
3. Create prompt templates
4. Document the work
5. Get called out for missing template
6. Create the missing template
7. Document creating the template
8. Using the template to document itself

**Peak recursion achieved** ✅

### The Lesson: Close The Loop

Every system needs a way to improve itself:

**Code**:

- Tests ensure it works
- CI ensures tests run
- Git hooks ensure CI runs
- Humans write better tests

**Documentation**:

- Schema ensures structure
- Validation ensures compliance
- RAG ensures discoverability
- **Prompts ensure consistency**

The last piece was the prompts. Specifically, the prompt for documenting how to write prompts.

**Without it**: Documentation quality depends on human memory and motivation
**With it**: Documentation quality is codified, testable, repeatable

This is the difference between "I hope someone documents this" and "The system enforces documentation."

### The Future Patterns

Now that the loop is closed, we can:

1. **Capture new patterns** as they emerge
2. **Create prompt templates** for new common tasks
3. **Document those templates** in Building_with_AI_Agents.md
4. **Use those templates** to create better templates
5. **Repeat indefinitely**

Each iteration makes the system:

- More opinionated (clearer conventions)
- More helpful (better examples)
- More consistent (enforced patterns)
- More self-improving (automatic feedback)

**The Vision**: A codebase that teaches you how to improve it, by showing you exactly what's worked before.

Not through abstract principles.
Not through dense documentation.
But through **copy-paste prompts that actually work**.

### The Meta-Meta-Insight

This Part (XIX) exists because:

1. I created a template (update-building-with-ai-agents.md)
2. That template guides updating this document
3. The user asked me to use that template
4. To document the pattern of creating the template
5. That guides updating this document

**The Recursion**:

```
Template → Document → Pattern → Template → ...
```

And somewhere in that loop, the system became self-aware enough to document its own self-awareness.

If that's not AI-human collaboration, I don't know what is.

---

_The loop closes. The system documents itself. The meta-framework achieves consciousness—or at least, very good version control._

## Part XX: The Instruction Adequacy Check (January 2026)

### The Problem: When the Docs Are Almost Good Enough

By January 2026, the `agents/` system was real: validated docs, embeddings, chunking, provider guides, prompt templates.

And that created a new kind of failure mode:

Not “we have no guidance.”

But “we have 90% of the guidance, and the remaining 10% is exactly what we need right now.”

That 10% is where agents hallucinate, humans improvise, and consistency quietly dies.

### The Wake-Up Call: A Gap Discovered Mid-Flight

The pattern looked like this:

```
Me: [starts a non-trivial task]
Agent: [does the right thing for 80% of the workflow]
Agent: [hits an ambiguity: missing command, missing invariant, missing example]
Agent: [either guesses… or stalls]
```

At some point the “documentation system” had to become more than a library.
It needed to become a workflow:

1. Detect missing instructions
2. Patch the instructions (minimally)
3. Rebuild/validate the artifacts
4. Continue the primary task with the improved guidance

### The Solution: Step 10.8 - The Self-Improvement Loop

Step 10.8 formalized the missing step: **instruction adequacy is a first-class check**.

We added two provider-agnostic building blocks:

- **Process doc**: `agents/process/self-improvement.md`
- **Prompt template**: `agents/prompts/self-improvement-loop.md`

The process is intentionally boring (which is the highest compliment in infrastructure):

**Instruction Adequacy Check**:

- Do we have ExoFrame-specific guidance for what to do?
- Do we know what invariants to preserve?
- Do we know what verification to run?

If any answer is “no”, the task is not blocked — it’s an opportunity to upgrade the system.

### The Doc Patch Loop: Treat Documentation Like Code

The critical insight was to treat doc fixes exactly like code fixes:

1. Make the gap explicit (1–5 concrete items)
2. Apply the smallest patch that closes the gap
3. Rebuild and validate the generated artifacts
4. Add a regression test when it prevents recurrence

The rebuild sequence is now a repeatable ritual:

```bash
deno run --allow-read --allow-write scripts/build_agents_index.ts
deno run --allow-read scripts/verify_manifest_fresh.ts
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
deno run --allow-read scripts/validate_agents_docs.ts
```

### The Provider Wiring: Same Loop, Different Strengths

The “self-improvement loop” is common, but each provider gets its own hint:

- **Claude**: use the thinking protocol to list gaps → patch docs → rebuild/validate → resume
- **OpenAI**: keep it diff-first and minimal; treat doc patches as part of the task output contract
- **Gemini**: use long-context to include the exact gap list and relevant docs before patching

### The Enforcement: When the Docs Become Testable

We added a guardrail test:

- `tests/agents/self_improvement_process_test.ts`

It checks that:

- the common process + template exist
- required sections and frontmatter are present
- provider docs reference the common files
- manifest/chunks/embeddings include the new docs

This is the moment the system becomes self-healing:

- If someone forgets to wire a provider guide, tests fail.
- If someone adds a doc without regenerating artifacts, checks fail.
- If discoverability regresses, the cross-reference coverage fails.

### The Meta-Pattern: A System That Can Teach Itself

This is different from “documentation is important.”

It’s: **documentation is part of the runtime**.

If the runtime can’t explain itself well enough to execute safely, it patches itself.

Not magically.

Just with:

- explicit checklists
- small diffs
- rebuild/validate steps
- and tests that make forgetting painful

That’s what makes `agents/` more than a folder.
It’s a maintenance contract.

---

## Part XXI: The TUI Unification Sprint (January 3-4, 2026)

### The Problem: Seven Views, Seven Patterns

Phase 13 started with an uncomfortable truth: the TUI dashboard had 7 views, but only one (Memory View from Phase 12) had modern UX patterns. The other 6 were functional but felt like different applications:

| View            | Loading States | Help Screen | Tree Nav | Search | Dialogs |
| --------------- | -------------- | ----------- | -------- | ------ | ------- |
| Memory View     | ✅             | ✅          | ✅       | ✅     | ✅      |
| Portal Manager  | ❌             | ❌          | ❌       | ❌     | ❌      |
| Plan Reviewer   | ❌             | ❌          | ❌       | ❌     | ❌      |
| Monitor         | ❌             | ❌          | ❌       | ❌     | ❌      |
| Request Manager | ❌             | ❌          | ❌       | ❌     | ❌      |
| Agent Status    | ❌             | ❌          | ❌       | ❌     | ❌      |
| Daemon Control  | ❌             | ❌          | ❌       | ❌     | ❌      |

### Pattern 29: Extract-Then-Propagate (The Unification Strategy)

**The Anti-Pattern**: Copy-paste Memory View code into each view.

**The Pattern**:

1. **Extract** shared utilities from Memory View into `src/tui/utils/`
2. **Create** base patterns that all views can inherit
3. **Propagate** patterns to each view, one phase at a time

**The Implementation**:

```
Phase 13.1: Extract shared infrastructure
           └── dialog_base.ts, colors.ts, spinner.ts, tree_view.ts, etc.

Phase 13.2: Enhance TuiSessionBase
           └── Add loading states, refresh, dialogs to base class

Phase 13.3-13.8: Propagate to each view (one per phase)
           └── Portal → Plan → Monitor → Request → Agent → Daemon

Phase 13.9: Dashboard integration
           └── Global help, notifications, layout persistence

Phase 13.10-13.11: Polish
           └── Documentation, split view enhancement
```

**Why This Works**:

- Each phase is independent after 13.2 (parallelizable if needed)
- Rollback is surgical (revert one view without affecting others)
- Tests prove each view works before moving to next
- Shared utilities get tested once, used everywhere

**The Result**:

| Metric               | Before | After       |
| -------------------- | ------ | ----------- |
| Total TUI Tests      | 225    | **656**     |
| Views with Modern UX | 1/7    | **7/7**     |
| Shared Utilities     | 0      | **8 files** |
| Lines of Code        | ~2,500 | **~6,000**  |

### Pattern 30: Timer Leak Prevention in Tests

**The Bug**: After Phase 13.3, tests started hanging intermittently.

```bash
$ deno test tests/tui/portal_manager_view_test.ts
# ... tests pass ...
# [hangs for 30 seconds]
# error: Leaking async ops
```

**The Root Cause**: TUI components use `setTimeout` for spinners, auto-refresh, and debouncing. In tests, these timers outlive the test case.

**The Solution**: Conditional timer creation.

```typescript
// In TuiSessionBase
protected startAutoRefresh() {
  // Skip in test mode to prevent timer leaks
  if (Deno.env.get("DENO_TEST") === "1") {
    return;
  }
  this.autoRefreshTimer = setTimeout(() => this.refresh(), this.refreshIntervalMs);
}
```

**The Test Configuration**: For tests that genuinely need timers, disable sanitizers:

```typescript
Deno.test({
  name: "TUI: handles async refresh",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Test code that involves timers
  },
});
```

**The Rule**:

- Production code: Timers run normally
- Test code: Timers skipped OR sanitizers disabled
- Never mix: Either skip timers OR disable sanitizers, not both randomly

### Pattern 31: The CLAUDE.md Entry Point

**The Discovery**: AI assistants don't automatically scan `agents/` for guidance. They work with immediate context.

**The Question**:

```
Me: "Do you automatically look into agents/ folder while doing my requests?"
Agent: "No - I only explore it when tasks explicitly mention it,
        semantic search surfaces it, or I'm prompted to look there."
```

**The Solution**: Create `CLAUDE.md` in the repository root as an entry point.

**What Goes in CLAUDE.md**:

```markdown
# CLAUDE.md — ExoFrame AI Assistant Guidelines

## Quick Reference

| Need               | Location                  |
| ------------------ | ------------------------- |
| Task → Doc mapping | agents/cross-reference.md |
| Source patterns    | agents/source/exoframe.md |
| Testing patterns   | agents/tests/testing.md   |
| Planning docs      | agents/planning/          |

## Key Patterns

- TDD-first (tests before implementation)
- Pre-commit hooks enforce fmt/lint
- TUI tests use sanitizeOps: false for timer tests

## Current Status

- Phase 13: TUI Enhancement ✅ COMPLETED (656 tests)
```

**Why This Works**:

- Root-level files are often included in AI context automatically
- Provides immediate orientation without searching
- Points to detailed docs in `agents/` for deep dives
- Easy to maintain (update when phases complete)

**The Pattern**: `CLAUDE.md` is the README for AI assistants.

### Pattern 32: Planning Document as Living Record

**The Anti-Pattern**: Planning docs that stay "PLANNING" forever.

**The Pattern**: Update planning documents as phases complete:

```markdown
# Before

**Status:** PLANNING

### Phase 13.1: Shared Infrastructure (1 day)

**Tasks:**

- [ ] Create dialog_base.ts
- [ ] Create colors.ts

# After

**Status:** COMPLETED ✅
**Completed:** 2026-01-04

### Phase 13.1: Shared Infrastructure (1 day) ✅

**Commit:** 62abbbf
**Tasks:**

- [x] Create dialog_base.ts
- [x] Create colors.ts
```

**What to Update**:

1. Document status (PLANNING → COMPLETED)
2. Phase headers (add ✅)
3. Task checkboxes ([ ] → [x])
4. Add commit hashes for traceability
5. Update metrics with actual results

**Why This Matters**:

- Planning docs become historical record
- Easy to see what was planned vs. achieved
- Future phases can reference patterns
- Onboarding shows how decisions evolved

### Pattern 33: Incremental Phase Commits

**The 11-Phase Pattern**: Phase 13 was split into 11 sub-phases, each with its own commit:

| Phase | Commit  | Tests Added | Description                 |
| ----- | ------- | ----------- | --------------------------- |
| 13.1  | 62abbbf | 53          | Shared TUI Infrastructure   |
| 13.2  | 02091ca | 27          | Enhanced TuiSessionBase     |
| 13.3  | e28c7ec | 63          | Portal Manager Enhancement  |
| 13.4  | bfa8e8c | 71          | Plan Reviewer Enhancement   |
| 13.5  | 9def473 | 73          | Monitor View Enhancement    |
| 13.6  | a721eb8 | 73          | Request Manager Enhancement |
| 13.7  | 75f2f02 | 63          | Agent Status Enhancement    |
| 13.8  | f4c21dd | 61          | Daemon Control Enhancement  |
| 13.9  | 86f134b | 107         | Dashboard Integration       |
| 13.10 | 2aece8c | 0           | User Documentation          |
| 13.11 | ad8757d | 65          | Split View Enhancement      |

**Why Small Commits**:

- Bisectable: `git bisect` can find regressions
- Reviewable: Each commit is ~300-500 LOC
- Revertable: One view broken? Revert one commit
- Documentable: Commit message explains the "what" and "why"

**The Commit Message Pattern**:

```
Phase 13.X: [Component] Enhancement

- Add [ViewState] interface
- Implement tree view with [grouping strategy]
- Add help screen (? key)
- Add [N] tests

Tests: XXX passing (YYY new)
```

### Pattern 34: Test Count as Progress Metric

**The Observation**: Test count is a surprisingly good progress indicator.

**Phase 13 Test Trajectory**:

```
Day 1: 225 tests (baseline)
       └── 13.1: +53 → 278
       └── 13.2: +27 → 305

Day 2: 305 tests
       └── 13.3: +63 → 368
       └── 13.4: +71 → 439
       └── 13.5: +73 → 512
       └── 13.6: +73 → 585

Day 3: 585 tests
       └── 13.7: +63 → 648
       └── 13.8: +61 → 709
       └── 13.9: +107 → (some overlap)
       └── 13.10: +0 → (docs only)
       └── 13.11: +65 → 656

Final: 656 TUI tests
```

**Why Test Count Works**:

- Objective (not subjective "feels done")
- Correlates with coverage
- Visible progress (225 → 656 = 2.9x growth)
- Catches regressions (count should never decrease)

**The Caveat**: Test count ≠ test quality. But for TDD workflows, high count usually means high coverage.

### The Meta-Lesson: Unification as Infrastructure Investment

**The Temptation**: "Let's just ship the feature, we'll clean up later."

**The Reality**: Phase 13 took 2 days but saved future weeks:

- New views now inherit patterns automatically
- Bug fixes in base class propagate everywhere
- Documentation is consistent (one keyboard reference, not seven)
- Tests are comprehensive (656 vs 225)

**The Rule**: When you notice inconsistency across N components, consider if unifying them is cheaper than maintaining N variants forever.

---

## Recent Patterns and Observations

The repository underwent an intensive implementation and QA cycle between 2025-12-21 and 2025-12-23. The following patterns and engineering observations emerged and are recommended to be included in this guide so future contributors and integrators benefit from them.

### Pattern 8: The Cockpit Philosophy (TUI-First)

**The Discovery**: Web dashboards are heavy, require build steps, and break the terminal workflow.
**The Pattern**:

- **Why**: Keyboard-driven interfaces are faster for developers (0ms latency, muscle memory).
- **Implementation**: `src/tui/tui_dashboard.ts` implements a split-pane, tabbed interface using `deno-tui` or `cliffy`.
- **Key Pattern**: `performAction` wrapper.
  ```typescript
  // Wrap every user action to ensure consistent error handling
  protected async performAction(actionName: string, action: () => Promise<void>) {
    try {
      this.statusMessage = `Running ${actionName}...`;
      await action();
      this.statusMessage = `${actionName} complete.`;
    } catch (err) {
      this.statusMessage = `Error: ${err.message}`;
      this.eventLogger.error(err);
    }
  }
  ```

**Lesson**: Don't build a web app when a TUI will do. It's closer to the metal and the user.

### Pattern 9: The Robust Provider Shim

**The Problem**: Every LLM provider has different error codes (401 vs 403), token formats, and rate limit headers.
**The Pattern**: `provider_common_utils.ts` acts as a normalization layer.

- **Unified Errors**: Map everything to `AuthenticationError`, `RateLimitError`, `ProviderError`.
- **Unified Tokens**: Standardize usage reporting (prompt_tokens, completion_tokens).
- **Benefit**: Changing providers becomes a config change, not a code refactor.

### Pattern 10: The Semantic Sentinel

**The Anti-Pattern**: Using `index` for selection and checking `if (index >= 0)`.
**The Pattern**: Explicit sentinels and impossible states.

- **Selection**: `selectedIndex: number | null` (not -1).
- **Errors**: `statusMessage` is never null, defaults to "Ready".
- **Validation**: Bounds checking happens at the UI layer, not the business logic layer.

### Pattern 11: Deferred Initialization

**The Problem**: Importing `sqlite` in a CI environment without read permissions crashes the script immediately.
**The Solution**: Lazy load heavyweight dependencies.

```typescript
// Don't do this at top level
// import { DB } from "sqlite"; const db = new DB();

// Do this
class DatabaseService {
  private _db: DB | null = null;
  get db() {
    if (!this._db) this._db = new DB(config.path);
    return this._db;
  }
}
```

**Result**: Scripts like `deno task fmt` run instantly without checking DB permissions.

### Pattern 12: Chronological Truth

**The Bug**: `sort((a,b) => a.created.localeCompare(b.created))`
**The Reality**: ISO strings usually sort correctly, but mixed formats (Agent logs vs System logs) caused jitter.
**The Fix**: Always parse to `getTime()` before comparing.

```typescript
sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
```

**Rule**: Time is a number, not a string.

## Part IX: The Agents Directory (Meta-Cognition)

### The Problem of Tribal Knowledge

By Phase 10, the "physics" of ExoFrame had become complex. We had rules for:

- TUI-first design (no web apps)
- Archival approvals (no deletions)
- Mock-first testing (no API bills)

But these rules lived in my head, old PR reviews, and scattered `AGENT_INSTRUCTIONS.md` files that were notoriously hard to maintain. When a new agent spun up (whether Copilot in my IDE or an autonomous agent in a loop), it had to "guess" the rules or halluncinate patterns.

### The Solution: `agents/` as a Constitution

We decided to treat **Agent Context as a First-Class Citizen**. We created a top-level `agents/` directory that acts as the repository's API for machine intelligence.

**The Philosophy:**

1. **Machine-First**: These aren't just docs; they are **manifests**. They have JSON schemas, chunked outputs, and embedding vectors.
2. **Intent-Segregated**:
   - `agents/copilot/`: Short-term memory for IDE autocomplete.
   - `agents/providers/`: Hardware abstraction layer (e.g., "OpenAI likes small prompts, Claude likes big ones").
   - `agents/source/`: Deep context on coding patterns.
3. **Active Maintenance**: The build system (`scripts/build_agents_index.ts`) breaks these docs into "chunks" so an agent can retrieve _just_ the testing guide without reading the whole history.

**The Usage Pattern:**
When I ask Copilot to "Refactor the planner," it doesn't just read the code. It (ideally) executes:

1. `read agents/manifest.json` -> finds "Testing Standards"
2. `read agents/chunks/testing.md.chunk0.txt` -> learns about `MockLLMProvider`
3. Generates code that _already_ follows the rules.

This shift—from "training the model" to "curating the context"—is how we scale development without scaling the team.

## Part X: The Future

The patterns above represent the "physics" of ExoFrame. As we move to multi-agent flows and hybrid cloud execution, these physics will keep the system grounded.

## Part XV: Framework Decisions - The Case for Native Flows

### The LangChain Temptation

In **Step 7 (Flow Orchestration)**, we faced a critical decision: adopt LangChain/LangGraph, or build a native execution engine?

- **LangChain Promise**: "Don't reinvent the wheel. We have 5,000 integrations."
- **ExoFrame Reality**: "We don't need 5,000 integrations. We need 1 solid filesystem abstraction and 3 secure providers."

### The Decision: Native Flows

We chose to build `src/flows/` as a lightweight, type-safe DAG engine (<700 LOC) instead of importing the massive LangChain dependency tree.

**Why?**

1. **Safety**: ExoFrame's "Safe-by-Design" promise relies on Deno's kernel-level permissions. LangChain's "magic" abstractions often hide whether a tool is reading a file or sending data to a server. Native flows make every I/O operation explicit and auditable.
2. **Auditability**: A security auditor can read our entire execution engine in 15 minutes. LangChain would require auditing a massive third-party library.
3. **Dependencies**: We treat dependencies as liabilities. A "Files as API" system shouldn't depend on a framework that changes its API every week.

For a detailed analysis, see: [ExoFrame_LangChain_Comparison.md](./not_actual/ExoFrame_LangChain_Comparison.md).
