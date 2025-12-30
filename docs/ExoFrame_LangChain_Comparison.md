# Architecture Decision Record: ExoFrame Flows vs. LangChain

**Status:** Decided (Keep Native Flows)
**Date:** 2025-12-30
**Context:** Evaluation of switching ExoFrame's native orchestration engine to LangChain / LangGraph.

## 1. Executive Summary

**Recommendation:** **REJECT** the switch to LangChain. Continue development of ExoFrame Native Flows.

**Rationale:**
ExoFrame's core philosophy is "Safe-by-Design," "Local-First," and "Dependencies as Liability." LangChain violates these principles by introducing a massive, rapidly shifting dependency tree, obscure abstraction layers ("Magic"), and a runtime model optimized for Python/Node.js, not Deno.

ExoFrame's Native Flows (`src/flows/`) provide a lightweight (<700 LOC), type-safe, transparency-first DAG execution engine that fits perfectly with the "Files as API" architecture. Switching would increase complexity, reduce security auditability, and introduce "Framework lock-in" with zero gain in core capability.

---

## 2. Architectural Comparison

| Feature               | ExoFrame Native Flows                                                 | LangChain / LangGraph                                              |
| :-------------------- | :-------------------------------------------------------------------- | :----------------------------------------------------------------- |
| **Philosophy**        | **Explicit DAG**: Static definition, transparent execution.           | **Chain of Thought**: Dynamic, runtime graph construction.         |
| **Dependency Weight** | **Minimal**: Pure TypeScript, Zod, zero external runtime deps.        | **Heavy**: Massive tree (Axis, Cheerio, etc.), often Node-centric. |
| **Runtime**           | **Deno Native**: Uses extensive `Permission` primitives.              | **Node.js First**: Deno support is secondary/experimental.         |
| **State Management**  | **File-Based**: Inputs/Outputs explicit in `source` config.           | **Memory Objects**: In-memory state classes (BufferMemory, etc.).  |
| **Debugging**         | **Whitebox**: `FlowRunner` is readable code. You see the `for` loops. | **Blackbox**: "Runnable" abstractions hide the control flow.       |
| **Security**          | **OS-Level**: Kernel primitives via Deno flags.                       | **App-Level**: Relies on library code to be secure.                |
| **Definition**        | **Static Data**: JSON/Object structured (Zod validated).              | **Code**: Classes and method chaining.                             |

## 3. Deep Dive: ExoFrame Flows

### Architecture

ExoFrame Flows are implementation independent of the execution engine. They are explicitly defined data structures (Schema: `src/schemas/flow.ts`).

- **Waves**: The runner resolves the dependency graph into "waves" of parallel tasks.
- **Fail-Fast**: Explicit error handling strategies defined in data.
- **Transparency**: Every step logs to the Activity Journal with no hidden logic.

### Strengths

1. **Auditability**: A security auditor can read `src/flows/flow_runner.ts` (approx. 300 LOC) and understand exactly how code executes.
2. **Type Safety**: The entire flow structure is Zod-validated at load time.
3. **Deno Alignment**: Designed for Deno's security model (Sandboxed vs Hybrid).
4. **Zero "Magic"**: No "PromptTemplates" hiding the actual string being sent to the LLM.

### Weaknesses

1. **Smaller Ecosystem**: No pre-built integrations for 500+ vector stores (we must build what we need).
2. **Manual Wiring**: You must define `dependsOn` explicitly (though this is arguably a feature).

## 4. Deep Dive: LangChain / LangGraph

### Architecture

LangChain is a framework for chaining LLM components. It abstracts the "boring" parts of LLM interaction.

- **Runnables**: The atomic unit of work.
- **LCEL**: A custom expression language for piping inputs/outputs.

### Strengths

1. **Velocity**: Rapid prototyping with pre-built chains (e.g., "SQLDatabaseChain").
2. **Integrations**: Massive library of community connectors.
3. **Community**: Standard pattern for many Python/Node developers.

### Weaknesses

1. **Abstraction Leakage**: When a chain fails, debugging the internal state of a compiled Runnable is notoriously difficult.
2. **Versioning Instability**: The API surface area changes frequently.
3. **Token Overhead**: Default prompts often waste tokens on verbose instructions.
4. **Security Opacity**: Hard to guarantee what a generic `ToolsAgent` is doing under the hood regarding file access.

## 5. The "Switch" Analysis

### Cost to Switch

1. **Refactor**: Rewrite `FlowRunner`, `DependencyResolver`, and all `Blueprints/Flows`.
2. **Dependency Hell**: Integrating LangChain (npm) into Deno often requires polyfills or compatibility layers (Node compat mode), breaking the "Pure Deno" strictness.
3. **Security Regression**: We lose the granular control over exactly which bytes are sent to the model and which files are touched, as we delegate that to library code.

### Benefit of Switching

1. **Pre-made Agents**: We gain access to "out of the box" ReAct agents.
   - _Counter-point_: ExoFrame's `AgentExecutor` (Step 6.4) already implements this more securely with native MCP support.
2. **Vector Store integrations**: Easier RAG setup.
   - _Counter-point_: We only need strict RAG over the local codebase, which is better served by a custom `grep`/`embedding` tool optimized for the local FS (e.g. `fast-embed` or simple cosine similarity).

## 6. Conclusion

**Stay the Course.**

ExoFrame is building an **Operating System for Agents**, not a **Chatbot Script**.

- An OS needs a **Kernel** (The implementation specific `FlowRunner`).
- LangChain is **Userland Drivers**.

We will continue to treat the "Flow" as a static, serializable, and auditable definition. We will build only the integrations we actually need (MCP, specific Providers), maintaining 100% control over the runtime security and performance.

### Action Items

1. **Reinforce**: Add this decision to `docs/Building_with_AI_Agents.md` to prevent future "Framework Envy".
2. **Expand**: Continue improving `defineFlow` type helpers to rival LangChain's DX without its runtime weight.
