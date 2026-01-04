# ExoFrame Architecture

**Version:** 1.11.0\
**Date:** January 4, 2026

This document provides a comprehensive architectural overview of ExoFrame components using Mermaid diagrams.

---

## System Architecture Overview

```mermaid
graph TB
    subgraph Actors["👥 Actors"]
        User[👤 User/Developer]
        Agent[🤖 AI Agent]
    end

    subgraph CLI["🖥️ CLI Layer"]
        Exoctl[exoctl CLI Entry]
        ReqCmd[Request Commands]
        PlanCmd[Plan Commands]
        ChangeCmd[Changeset Commands]
        GitCmd[Git Commands]
        DaemonCmd[Daemon Commands]
        PortalCmd[Portal Commands]
        BlueprintCmd[Blueprint Commands]
        DashCmd[Dashboard Commands]
    end

    subgraph TUI["🧩 TUI Layer"]
        TuiDash[TUI Dashboard]
        TuiViews[Views: portals / plans / requests / logs / daemon / agents]
    end

    subgraph Core["⚙️ Core System"]
        Main[main.ts - Daemon]
        ReqWatch[Request Watcher<br/>Inbox/Requests]
        PlanWatch[Plan Watcher<br/>System/Active]
        ReqProc[Request Processor]
        ReqRouter[Request Router]
        PlanExec[Plan Executor]
        AgentRun[Agent Runner]
        FlowEng[Flow Engine]
        FlowRun[Flow Runner]
        ExecLoop[Execution Loop]
    end

    subgraph Services["🔧 Services"]
        ConfigSvc[Config Service]
        DBSvc[Database Service]
        GitSvc[Git Service]
        EventLog[Event Logger]
        ContextLoad[Context Loader]
        PlanWriter[Plan Writer]
        PlanAdapter[Plan Adapter]
        MissionRpt[Mission Reporter]
        PathRes[Path Resolver]
        ToolReg[Tool Registry]
        CtxCard[Context Card Generator]
    end

    subgraph Storage["💾 Storage"]
        DB[(SQLite DB<br/>journal.db)]
        FS[/File System<br/>~/ExoFrame/]
        Inbox[/Inbox/<br/>Requests & Plans/]
        Blueprint[/Blueprints/<br/>Agents & Flows/]
        Memory[/Memory/<br/>Memory Banks/]
        Portals[/Portals/<br/>External Projects/]
        System[/System/<br/>Active & Archive/]
    end

    subgraph AI["🤖 AI Providers"]
        Factory[Provider Factory]
        Ollama[Ollama<br/>Local]
        Claude[Claude API<br/>Anthropic]
        GPT[OpenAI GPT<br/>Remote]
        Gemini[Google Gemini<br/>Remote]
        Mock[Mock Provider<br/>Testing]
    end

    %% User interactions
    User -->|CLI Commands| Exoctl
    User -->|Drop .md files| Inbox
    Agent -->|Read/Write| Portals

    %% CLI routing
    Exoctl --> ReqCmd
    Exoctl --> PlanCmd
    Exoctl --> ChangeCmd
    Exoctl --> GitCmd
    Exoctl --> DaemonCmd
    Exoctl --> PortalCmd
    Exoctl --> BlueprintCmd
    Exoctl --> DashCmd

    %% CLI to Services
    ReqCmd --> Inbox
    PlanCmd --> Inbox
    ChangeCmd --> GitSvc
    GitCmd --> GitSvc
    DaemonCmd --> Main
    PortalCmd --> ConfigSvc
    PortalCmd --> CtxCard
    BlueprintCmd --> Blueprint
    DashCmd --> TuiDash
    TuiDash --> TuiViews

    %% Core daemon flow
    Main --> ConfigSvc
    Main --> DBSvc
    Main --> Factory
    Main --> ReqWatch
    Main --> PlanWatch
    Main --> ReqProc
    Main --> ReqRouter
    Main --> PlanExec
    ReqWatch --> Inbox
    PlanWatch --> System
    ReqProc --> ReqRouter
    ReqRouter --> AgentRun
    ReqRouter --> FlowRun
    PlanExec --> AgentRun
    AgentRun --> ExecLoop
    ExecLoop --> FlowEng
    FlowRun --> FlowEng

    %% Services integration
    AgentRun --> ContextLoad
    AgentRun --> PlanWriter
    AgentRun --> MissionRpt
    AgentRun --> EventLog
    ExecLoop --> ToolReg
    ExecLoop --> GitSvc
    ContextLoad --> Memory
    ContextLoad --> Portals
    PlanWriter --> Inbox
    PlanWriter --> PlanAdapter
    EventLog --> DB
    GitSvc --> FS
    PathRes --> FS

    %% AI Provider routing
    Factory --> Ollama
    Factory --> Claude
    Factory --> GPT
    Factory --> Gemini
    Factory --> Mock
    AgentRun --> Factory

    %% Storage access
    ConfigSvc --> FS
    DBSvc --> DB
    ReqProc --> Blueprint
    PlanWatch --> System

    %% Styling
    classDef actor fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef cli fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef core fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef service fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef storage fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef ai fill:#fce4ec,stroke:#880e4f,stroke-width:2px

    class User,Agent actor
    class Exoctl,ReqCmd,PlanCmd,ChangeCmd,GitCmd,DaemonCmd,PortalCmd,BlueprintCmd,DashCmd cli
    class Main,ReqWatch,PlanWatch,ReqProc,ReqRouter,PlanExec,AgentRun,FlowEng,FlowRun,ExecLoop core
    class ConfigSvc,DBSvc,GitSvc,EventLog,ContextLoad,PlanWriter,MissionRpt,PathRes,ToolReg,CtxCard service
    class DB,FS,Inbox,Blueprint,Memory,Portals,System storage
    class Factory,Ollama,Claude,GPT,Gemini,Mock ai

    class TuiDash,TuiViews cli
```

---

## Request Processing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as exoctl CLI
    participant I as Inbox/Requests
    participant W as File Watcher
    participant RP as Request Processor
    participant RR as Request Router
    participant FV as Flow Validator
    participant AR as Agent Runner
    participant FR as Flow Runner
    participant AI as AI Provider
    participant PA as Plan Adapter
    participant PS as Plan Schema
    participant P as Inbox/Plans
    participant DB as Activity Journal

    U->>CLI: exoctl request "Fix bug"
    CLI->>I: Create request-{uuid}.md
    CLI->>DB: Log request.created
    CLI-->>U: Request created ✓

    W->>I: Detect new file
    W->>RP: Trigger processing
    RP->>I: Read request.md
    RP->>RR: Route request (flow vs agent)

    alt Flow Request
        RR->>FV: Validate flow exists
        FV->>FV: Check flow schema & dependencies
        FV-->>RR: Flow valid ✓
        RR->>FR: Generate flow execution plan
        FR->>AI: Generate plan (JSON)
        FR->>PA: Parse & Validate
        PA->>PS: Validate against Zod Schema
    else Agent Request
        RR->>AR: Load agent blueprint
        AR->>AI: Generate plan
        AI-->>AR: Plan response (JSON)
        AR->>PA: Parse & Validate
        PA->>PS: Validate against Zod Schema
    end

    alt Validation Success
        PS-->>PA: Valid Plan Object
        PA->>PA: Convert to Markdown
        PA-->>RP: Markdown Content
        RP->>P: Write plan-{uuid}.md
        RP->>DB: Log plan.generated
        P-->>U: Ready for review
    else Validation Failed
        PS-->>PA: Zod Validation Error
        PA-->>RP: PlanValidationError
        RP->>DB: Log plan.validation_failed
    end

    U->>CLI: exoctl plan list
    CLI->>P: Read plans
    CLI-->>U: Show pending plans

    U->>CLI: exoctl plan approve {uuid}
    CLI->>P: Update plan status
    CLI->>DB: Log plan.approved
    CLI-->>U: Approved ✓
```

---

## Flow-Aware Request Routing

The **Request Router** service enables intelligent routing of requests based on their frontmatter configuration. It supports both single-agent execution (legacy) and multi-agent flow execution (Phase 7).

### Routing Decision Flow

```mermaid
graph TD
    A[Request Detected] --> B[Parse Frontmatter]
    B --> C{Has 'flow' field?}
    B --> D{Has 'agent' field?}
    B --> E{No routing fields?}

    C -->|Yes| F[Validate Flow]
    F -->|Valid| G[Route to FlowRunner]
    F -->|Invalid| H[Log Error & Fail]

    D -->|Yes| I[Validate Agent]
    I -->|Valid| J[Route to AgentRunner]
    I -->|Invalid| K[Log Error & Fail]

    E -->|Yes| L[Use Default Agent]
    L --> M[Route to AgentRunner]

    G --> N[Generate Flow Plan]
    J --> O[Generate Agent Plan]
    M --> O

    N --> P[Write Plan to Inbox]
    O --> P
```

### Request Types

**Flow Request (Multi-Agent):**

```yaml
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
flow: code-review
tags: [review, security]
---
Please perform a comprehensive code review of this pull request.
```

**Agent Request (Single-Agent):**

```yaml
---
trace_id: "550e8400-e29b-41d4-a716-446655440001"
agent: senior-coder
tags: [implementation]
---
Implement the new authentication feature.
```

**Default Agent Request:**

```yaml
---
trace_id: "550e8400-e29b-41d4-a716-446655440002"
tags: [general]
---
Help me understand this codebase.
```

### Flow Validation

Before routing to FlowRunner, the Request Router validates:

- **Flow Existence:** Flow blueprint exists in `/Blueprints/Flows/`
- **Schema Validity:** Flow conforms to expected structure
- **Dependencies:** All referenced agents and transforms exist
- **No Cycles:** Flow doesn't contain circular dependencies

---

## Parsing & Schema Layer

ExoFrame centralizes file-format parsing and validation into two layers:

- **Parsers** (`src/parsers/`): extract structure from Markdown files (YAML frontmatter + body).
- **Schemas** (`src/schemas/`): validate structured objects using Zod (requests, plans, flows, portals, MCP).

Key modules:

- `src/parsers/markdown.ts` (`FrontmatterParser`)
  - Extracts YAML frontmatter delimited by `--- ... ---`.
  - Validates frontmatter using `src/schemas/request.ts`.
  - Optionally logs validation events to the Activity Journal via `DatabaseService`.
- `src/schemas/plan_schema.ts`
  - Defines the JSON schema for LLM plan output (title/description + numbered steps + optional metadata).
- `src/schemas/mcp.ts`
  - Defines MCP tool argument schemas and MCP server configuration schema.

This layer is what keeps file-driven workflows safe and deterministic: request/plan files may come from humans or LLMs, but the runtime only proceeds when schemas validate.

---

## Plan Execution Flow

The **Plan Executor** service orchestrates the step-by-step execution of approved plans. It uses a ReAct-style loop to prompt the LLM for actions, executes them via the **Tool Registry**, and commits changes to Git after each step.

```mermaid
sequenceDiagram
    participant W as Plan Watcher
    participant Main as Daemon
    participant PE as Plan Executor
    participant LLM as AI Provider
    participant TR as Tool Registry
    participant Git as Git Service
    participant DB as Activity Journal

    Note over W: Monitors System/Active/

    W->>Main: Detects plan.md
    Main->>PE: execute(planPath)

    PE->>PE: Parse Plan & Context

    loop For Each Step
        PE->>PE: Construct Prompt (Context + Step)
        PE->>LLM: generate(prompt)
        LLM-->>PE: Response (TOML Actions)

        PE->>PE: Parse Actions

        loop For Each Action
            PE->>TR: execute(tool, params)
            TR->>TR: Validate & Run
            TR-->>PE: Result
            PE->>DB: Log action result
        end

        PE->>Git: commit(step_message)
        Git-->>PE: Commit SHA
        PE->>DB: Log step completion
    end

    PE->>Git: commit(final_message)
    Git-->>PE: Final SHA
    PE->>DB: Log plan completion
    PE-->>Main: Execution Result
```

### Plan Execution Components

```mermaid
graph TB
    subgraph Detection[Detection]
        D1[File Watcher<br/>System/Active/]
        D2[Filter _plan.md files]
        D3[Parse YAML frontmatter]
        D4[Validate trace_id]
        D5[Log plan.detected]
    end

    subgraph Parsing[Parsing]
        P1[Extract body section]
        P2[Regex: ## Step N: Title]
        P3[Validate sequential numbering]
        P4[Validate non-empty titles]
        P5[Build step objects]
        P6[Log plan.parsed]
    end

    subgraph Orchestration[Agent Orchestration via MCP]
        O1[Validate portal permissions]
        O2[Start ExoFrame MCP Server]
        O3[Register MCP tools & resources]
        O4[Connect agent via MCP]
        O5[Monitor agent MCP tool calls]
        O6[Receive changeset details]
    end

    subgraph MCPServer["ExoFrame MCP Server"]
        M1[MCP Protocol Handler]
        M2[Tool Registry]
        M3[Resource Registry]
        M4[Prompt Registry]
        M5[Permission Validator]
        M6[Action Logger]
    end

    subgraph MCPTools["MCP Tools (Portal-Scoped)"]
        T1[read_file - Read portal files]
        T2[write_file - Write portal files]
        T3[list_directory - List portal dirs]
        T4[git_create_branch - Create branch]
        T5[git_commit - Commit changes]
        T6[git_status - Check git status]
    end

    subgraph Security["Security Modes"]
        SM1[Sandboxed: No file access]
        SM2[Hybrid: Read-only + audit]
    end

    subgraph Registry[Changeset Registry]
        R1[Register changeset record]
        R2[Store commit SHA]
        R3[Link to trace_id]
        R4[Set status = pending]
    end

    subgraph Status[Status Update]
        S1[Mark plan executed]
        S2[Move to Archive]
        S3[Log completion]
    end

    subgraph Error[Error Handling]
        E1[Catch agent errors]
        E2[Catch Git errors]
        E3[Log failures]
        E4[Preserve plan state]
    end

    D1 --> D2 --> D3 --> D4 --> D5
    D5 --> P1
    P1 --> P2 --> P3 --> P4 --> P5 --> P6
    P6 --> G1
    G1 --> G2 --> G3 --> G4
    G4 --> C1
    C1 --> C2 --> C3 --> C4
    C4 --> S1
    S1 --> S2 --> S3

    G2 -.error.-> E1
    C2 -.error.-> E2
    E1 --> E3 --> E4
    E2 --> E3

    classDef implemented fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef planned fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef error fill:#ffcdd2,stroke:#c62828,stroke-width:2px

    class D1,D2,D3,D4,D5,P1,P2,P3,P4,P5,P6 implemented
    class G1,G2,G3,G4,C1,C2,C3,C4,S1,S2,S3 planned
    class E1,E2,E3,E4 error
```

### MCP Server Implementation Notes

The MCP server lives under `src/mcp/` and is a JSON-RPC 2.0 server over stdio.

- `src/mcp/server.ts`
  - Routes: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`.
  - Logs lifecycle events (e.g., `mcp.server.started`) to the Activity Journal.
- `src/mcp/tools.ts`
  - Validates tool input using `src/schemas/mcp.ts` and enforces portal access via `PortalPermissionsService`.
  - Applies path safety checks (no traversal/absolute paths; resolved path must remain within the portal root).
- `src/mcp/resources.ts`
  - Implements `portal://<PortalAlias>/<path>` resource discovery and reading.

### Plan File Structure

```mermaid
graph TB
    subgraph PlanFile["_plan.md Structure"]
        FM[YAML Frontmatter<br/>---<br/>trace_id: uuid<br/>request_id: uuid<br/>agent: string<br/>status: approved<br/>---]
        Body[Markdown Body<br/># Plan Title<br/>Description]
        Step1[## Step 1: Title<br/>Content and tasks]
        Step2[## Step 2: Title<br/>Content and tasks]
        StepN[## Step N: Title<br/>Content and tasks]
    end

    subgraph Parsed["Parsed Structure"]
        Context[Context Object<br/>{trace_id, request_id,<br/>agent, status}]
        Steps[Steps Array<br/>[{number, title, content}]]
    end

    FM --> Context
    Body --> Context
    Step1 --> Steps
    Step2 --> Steps
    StepN --> Steps

    Context --> Execution[Plan Executor]
    Steps --> Execution

    classDef file fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef parsed fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef exec fill:#f3e5f5,stroke:#4a148c,stroke-width:2px

    class FM,Body,Step1,Step2,StepN file
    class Context,Steps parsed
    class Execution exec
```

### Activity Logging Events

**Detection Events:**

- `plan.detected` - Plan file found in System/Active
- `plan.ready_for_execution` - Valid plan parsed, ready for execution
- `plan.invalid_frontmatter` - YAML parsing failed
- `plan.missing_trace_id` - Required trace_id field not found
- `plan.detection_failed` - Unexpected error during detection

**Parsing Events:**

- `plan.parsed` - Plan successfully parsed with step count
- `plan.parsing_failed` - Missing body, no steps, or empty titles
- `plan.non_sequential_steps` - Warning for gaps in step numbering

---

## CLI Commands Architecture

```mermaid
graph LR
    subgraph Entry["Entry Point"]
        Exoctl[exoctl.ts<br/>Main CLI]
    end

    subgraph Commands["Command Groups"]
        Base[BaseCommand<br/>Shared logic]
        Req[RequestCommands<br/>Create requests]
        Plan[PlanCommands<br/>Review plans]
        Change[ChangesetCommands<br/>Review code]
        Git[GitCommands<br/>Git operations]
        Daemon[DaemonCommands<br/>Daemon control]
        Portal[PortalCommands<br/>External projects]
        Blueprint[BlueprintCommands<br/>Agent templates]
        Dashboard[DashboardCommands<br/>TUI dashboard]
    end

    subgraph Context["Shared Context"]
        Ctx[CommandContext<br/>config + db]
    end

    Exoctl --> Req
    Exoctl --> Plan
    Exoctl --> Change
    Exoctl --> Git
    Exoctl --> Daemon
    Exoctl --> Portal
    Exoctl --> Blueprint
    Exoctl --> Dashboard

    Req -.extends.-> Base
    Plan -.extends.-> Base
    Change -.extends.-> Base
    Git -.extends.-> Base
    Daemon -.extends.-> Base
    Portal -.extends.-> Base
    Blueprint -.extends.-> Base
    Dashboard -.extends.-> Base

    Base --> Ctx

    classDef entry fill:#bbdefb,stroke:#1976d2,stroke-width:2px
    classDef cmd fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef ctx fill:#fff9c4,stroke:#f57f17,stroke-width:2px

    class Exoctl entry
    class Base,Req,Plan,Change,Git,Daemon,Portal,Blueprint,Dashboard cmd
    class Ctx ctx
```

---

## TUI Dashboard Architecture

The dashboard is an interactive terminal UI launched from the CLI, providing a unified cockpit for ExoFrame operations.

### Overview

- **Entry point:** `exoctl dashboard` → `src/cli/dashboard_commands.ts` → `src/tui/tui_dashboard.ts`
- **Multi-pane support:** Split views with independent focus management
- **7 integrated views:** Portal Manager, Plan Reviewer, Monitor, Daemon Control, Agent Status, Request Manager, Memory View
- **Test stability:** Mock services enable comprehensive testing (see `src/tui/tui_dashboard_mocks.ts`)

### Component Architecture

```mermaid
graph TB
    subgraph CLI[CLI Layer]
        Exoctl[exoctl.ts]
        DashCmd[DashboardCommands.show]
    end

    subgraph Dashboard[TUI Dashboard]
        Launch[launchTuiDashboard]
        State[DashboardViewState]
        Theme[TuiTheme]
    end

    subgraph Panes[Pane Management]
        PaneList[Panes Array]
        Focus[Active Pane Focus]
        Layout[Layout Persistence]
    end

    subgraph Views[Dashboard Views]
        Portal[🌀 PortalManagerView]
        Plan[📋 PlanReviewerView]
        Monitor[📊 MonitorView]
        Daemon[⚙️ DaemonControlView]
        Agent[🤖 AgentStatusView]
        Request[📥 RequestManagerView]
        Memory[💾 MemoryView]
    end

    subgraph Infrastructure[Shared Infrastructure]
        Colors[tui_colors.ts<br/>Theme & colorize]
        Help[tui_help.ts<br/>Help overlays]
        Session[tui_session_base.ts<br/>Base class]
        Raw[Raw mode handling]
    end

    subgraph Notifications[Notification System]
        NotifPanel[Notification Panel]
        NotifTypes[info/success/warning/error]
        AutoExpire[Auto-expire timers]
    end

    Exoctl --> DashCmd --> Launch
    Launch --> State
    Launch --> Theme
    Launch --> PaneList
    PaneList --> Focus
    PaneList --> Layout
    Focus --> Views
    Views --> Infrastructure
    Launch --> Notifications
```

### Dashboard State

The `DashboardViewState` manages global UI state:

```typescript
interface DashboardViewState {
  showHelp: boolean; // Help overlay visible
  showNotifications: boolean; // Notification panel visible
  showViewPicker: boolean; // View picker dialog visible
  isLoading: boolean; // Loading indicator
  loadingMessage: string; // Loading message text
  error: string | null; // Error message
  notifications: Notification[]; // Active notifications
  currentTheme: string; // "dark" | "light"
  highContrast: boolean; // Accessibility mode
  screenReader: boolean; // Screen reader support
}
```

### Pane Structure

Each pane manages a view instance with layout information:

```typescript
interface Pane {
  id: string;           // Unique pane identifier
  view: View;           // View instance (PortalManagerView, etc.)
  x: number;            // X position in grid
  y: number;            // Y position in grid
  width: number;        // Pane width (columns)
  height: number;       // Pane height (rows)
  focused: boolean;     // Currently focused
  maximized?: boolean;  // Zoom state
  previousBounds?: {...}; // For restore after maximize
}
```

### Key Bindings

Dashboard uses a declarative key binding system:

| Category        | Keys                      | Actions                           |
| --------------- | ------------------------- | --------------------------------- |
| **Navigation**  | `Tab`, `Shift+Tab`, `1-7` | Pane switching                    |
| **Layout**      | `v`, `h`, `c`, `z`        | Split, close, maximize            |
| **Persistence** | `s`, `r`, `d`             | Save, restore, default            |
| **Dialogs**     | `?`, `n`, `p`, `Esc/q`    | Help, notifications, picker, quit |

### Layout Persistence

Layouts are saved to `~/.exoframe/tui_layout.json`:

```json
{
  "panes": [
    { "id": "main", "viewName": "PortalManagerView", "x": 0, "y": 0, "width": 40, "height": 24 },
    { "id": "pane-1", "viewName": "MonitorView", "x": 40, "y": 0, "width": 40, "height": 24 }
  ],
  "activePaneId": "main",
  "version": "1.1"
}
```

### View Integration

Each view extends `TuiSessionBase` and implements:

- `render()`: View-specific rendering
- `handleKey(key: string)`: Keyboard input handling
- `getFocusableElements()`: List of focusable UI elements
- Service injection for data access

### Raw Mode Handling

Terminal raw mode enables immediate key response:

```typescript
tryEnableRawMode(); // Enable for interactive mode
tryDisableRawMode(); // Restore on exit
```

Falls back to line-based input when raw mode unavailable.

### Testing Strategy

- **Unit tests:** Mock services for isolated view testing
- **Integration tests:** Full dashboard lifecycle with test mode
- **Sanitizer safety:** Test mode skips timers to prevent leaks
- **Coverage:** 591+ TUI tests across all components

For keyboard shortcuts, see [TUI Keyboard Reference](./TUI_Keyboard_Reference.md).

---

## AI Provider Architecture

```mermaid
graph TB
    subgraph Factory["Provider Factory"]
        PF[ProviderFactory.create]
        Info[getProviderInfo]
    end

    subgraph Config["Configuration"]
        Cfg[exo.config.toml<br/>ai.provider<br/>ai.model]
    end

    subgraph Providers["LLM Providers"]
        Ollama[OllamaProvider<br/>localhost:11434]
        Claude[ClaudeProvider<br/>api.anthropic.com]
        GPT[OpenAIProvider<br/>api.openai.com]
        Gemini[GeminiProvider<br/>generativelanguage.googleapis.com]
        Mock[MockLLMProvider<br/>Testing]
    end

    subgraph Interface["Provider Interface"]
        Gen[generateText<br/>generateStream]
    end

    Cfg --> PF
    PF --> Info
    PF -->|provider=ollama| Ollama
    PF -->|provider=anthropic| Claude
    PF -->|provider=openai| GPT
    PF -->|provider=google| Gemini
    PF -->|provider=mock| Mock

    Ollama -.implements.-> Gen
    Claude -.implements.-> Gen
    GPT -.implements.-> Gen
    Gemini -.implements.-> Gen
    Mock -.implements.-> Gen

    classDef factory fill:#e1bee7,stroke:#6a1b9a,stroke-width:2px
    classDef config fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef provider fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef interface fill:#b2dfdb,stroke:#00695c,stroke-width:2px

    class PF,Info factory
    class Cfg config
    class Ollama,Claude,GPT,Gemini,Mock provider
    class Gen interface
```

---

## Storage & Data Flow

```mermaid
graph TB
    subgraph FileSystem["File System (~/ExoFrame)"]
        Inbox["Inbox<br/>Requests & Plans"]
        Blueprint["Blueprints<br/>Agents & Flows"]
        Memory["Memory<br/>Memory Banks"]
        Portals["Portals<br/>Symlinks"]
        System["System<br/>Active & Archive"]
    end

    subgraph Database["SQLite Database"]
        Journal[("journal.db<br/>Activity Journal")]
        Activities["activities table"]
        Schema["Schema migrations"]
    end

    subgraph Services["Services"]
        DB["DatabaseService"]
        Event["EventLogger"]
        Config["ConfigService"]
        Git["GitService"]
    end

    Inbox -->|Watch| Watcher["File Watcher"]
    Blueprint -->|Read| ReqProc["Request Processor"]
    Memory -->|Generate| CtxCard["Context Card Gen"]
    Portals -->|Access| AgentRun["Agent Runner"]
    System -->|Store| Archive["Archive Service"]

    Journal --> DB
    Activities --> Event
    Schema --> DB

    DB --> Event
    Config --> FileSystem
    Git --> FileSystem

    classDef storage fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef db fill:#b2dfdb,stroke:#00695c,stroke-width:2px
    classDef service fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px

    class Inbox,Blueprint,Memory,Portals,System storage
    class Journal,Activities,Schema db
    class DB,Event,Config,Git service
```

---

## Memory Banks Architecture

The Memory Banks system provides persistent knowledge storage for project context, execution history, and cross-project learnings.

> **Enhanced Architecture:** See [agents/planning/phase-12.5-memory-bank-enhanced.md](../agents/planning/phase-12.5-memory-bank-enhanced.md) for the full v2 architecture with Global Memory, Agent Memory Updates, and Simple RAG.

### Directory Structure

```mermaid
graph TB
    subgraph Memory["Memory/"]
        Global["Global/<br/>Cross-project learnings"]
        Projects["Projects/<br/>Project-specific memory"]
        Execution["Execution/<br/>Execution history"]
        Pending["Pending/<br/>Awaiting approval"]
        Tasks["Tasks/<br/>Task tracking"]
        Index["Index/<br/>Search indices"]
    end

    subgraph ProjectMem["Projects/{portal}/"]
        Overview["overview.md"]
        Patterns["patterns.md"]
        Decisions["decisions.md"]
        References["references.md"]
        ContextJson["context.json"]
    end

    subgraph ExecMem["Execution/{trace-id}/"]
        Summary["summary.md"]
        Context["context.json"]
        Changes["changes.diff"]
        Learnings["learnings.md"]
    end

    subgraph GlobalMem["Global/"]
        GLearnings["learnings.md"]
        GPatterns["patterns.md"]
        GAnti["anti-patterns.md"]
        GJson["learnings.json"]
    end

    subgraph IndexDir["Index/"]
        Files["files.json"]
        PatIdx["patterns.json"]
        Tags["tags.json"]
        LearnIdx["learnings.json"]
        Embed["embeddings/"]
    end

    Projects --> ProjectMem
    Execution --> ExecMem
    Global --> GlobalMem
    Index --> IndexDir

    classDef dir fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef file fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef json fill:#b2dfdb,stroke:#00695c,stroke-width:2px

    class Memory,Global,Projects,Execution,Pending,Tasks,Index dir
    class Overview,Patterns,Decisions,References,Summary,Changes,Learnings,GLearnings,GPatterns,GAnti file
    class ContextJson,Context,GJson,Files,PatIdx,Tags,LearnIdx,Embed json
```

### Memory Update Workflow

```mermaid
sequenceDiagram
    participant Agent as Execution Agent
    participant ME as Memory Extractor
    participant MB as MemoryBankService
    participant P as Memory/Pending/
    participant U as User
    participant G as Memory/Global/

    Note over Agent: Execution completes

    Agent->>ME: triggerMemoryExtraction()
    ME->>ME: analyzeExecution()
    ME->>ME: extractLearnings()

    alt Learnings Found
        ME->>MB: createProposal(learnings)
        MB->>P: Write proposal.md
        MB-->>U: "Memory update pending"

        U->>MB: exoctl memory pending approve
        MB->>G: mergeLearning(learning)
        MB->>P: archiveProposal()
    end
```

### CLI Command Tree

```
exoctl memory
├── list                    # List all memory banks
├── search <query>          # Search across memory
├── project list|show       # Project memory ops
├── execution list|show     # Execution history
├── global show|stats       # Global memory
├── pending list|approve    # Pending updates
├── promote|demote          # Move learnings
└── rebuild-index           # Regenerate indices
```

### Key Components

| Component         | Location                                       | Purpose                      | Status      |
| ----------------- | ---------------------------------------------- | ---------------------------- | ----------- |
| MemoryBankService | `src/services/memory_bank.ts`                  | Core CRUD operations         | ✅ Complete |
| Memory Schemas    | `src/schemas/memory_bank.ts`                   | Zod validation schemas       | ✅ Complete |
| Memory Extractor  | `src/services/memory_extractor.ts`             | Learning extraction          | ✅ Complete |
| Memory Embedding  | `src/services/memory_embedding.ts`             | Vector embeddings for search | ✅ Complete |
| Memory CLI        | `src/cli/memory_commands.ts`                   | CLI interface                | ✅ Complete |
| Integration Tests | `tests/integration/memory_integration_test.ts` | End-to-end tests             | ✅ Complete |

---

## Portal System Architecture

```mermaid
graph TB
    subgraph External["External Projects"]
        Proj1[~/Dev/MyWebsite]
        Proj2[~/Dev/MyAPI]
        Proj3[~/Work/Backend]
    end

    subgraph Portals["Portals Directory"]
        Link1[MyWebsite →]
        Link2[MyAPI →]
        Link3[Backend →]
    end

    subgraph Memory["Memory/Banks"]
        Card1[MyWebsite.md<br/>Context Card]
        Card2[MyAPI.md<br/>Context Card]
        Card3[Backend.md<br/>Context Card]
    end

    subgraph Config["Configuration"]
        TOML[exo.config.toml<br/>portals array]
        Deno[deno.json<br/>permissions]
    end

    subgraph CLI["Portal Management"]
        Add[exoctl portal add]
        List[exoctl portal list]
        Show[exoctl portal show]
        Remove[exoctl portal remove]
        Verify[exoctl portal verify]
        Refresh[exoctl portal refresh]
    end

    Proj1 -.symlink.-> Link1
    Proj2 -.symlink.-> Link2
    Proj3 -.symlink.-> Link3

    Link1 --> Card1
    Link2 --> Card2
    Link3 --> Card3

    Card1 --> TOML
    Card2 --> TOML
    Card3 --> TOML
    TOML --> Deno

    Add -->|Creates| Link1
    Add -->|Generates| Card1
    Add -->|Updates| TOML
    List -->|Reads| TOML
    Show -->|Reads| Card1
    Remove -->|Deletes| Link1
    Verify -->|Checks| Link1
    Refresh -->|Regenerates| Card1

    classDef external fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef portal fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef memory fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef config fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef cli fill:#c8e6c9,stroke:#388e3c,stroke-width:2px

    class Proj1,Proj2,Proj3 external
    class Link1,Link2,Link3 portal
    class Card1,Card2,Card3 memory
    class TOML,Deno config
    class Add,List,Show,Remove,Verify,Refresh cli
```

---

## Blueprint Management System

```mermaid
graph TB
    subgraph Templates["Built-in Templates"]
        Def[default<br/>Ollama llama3.2]
        Coder[coder<br/>Claude Sonnet]
        Reviewer[reviewer<br/>GPT-4]
        Architect[architect<br/>Claude Opus]
        Researcher[researcher<br/>GPT-4 Turbo]
        Mock[mock<br/>MockLLMProvider]
        Gemini[gemini<br/>Gemini 2.0 Flash]
    end

    subgraph Storage["Blueprints/Agents"]
        Files[/agent_id.md<br/>TOML frontmatter/]
        Validation[Zod Schema<br/>Validation]
    end

    subgraph CLI["Blueprint Commands"]
        Create[exoctl blueprint create]
        List[exoctl blueprint list]
        Show[exoctl blueprint show]
        Validate[exoctl blueprint validate]
        Edit[exoctl blueprint edit]
        Remove[exoctl blueprint remove]
    end

    subgraph Usage["Runtime Usage"]
        Request[exoctl request --agent]
        Processor[Request Processor]
        Runner[Agent Runner]
    end

    Def --> Create
    Coder --> Create
    Reviewer --> Create
    Architect --> Create
    Researcher --> Create
    Mock --> Create
    Gemini --> Create

    Create -->|Validates| Validation
    Create -->|Writes| Files
    List -->|Reads| Files
    Show -->|Reads| Files
    Validate -->|Checks| Validation
    Edit -->|$EDITOR| Files
    Remove -->|Deletes| Files

    Request --> Processor
    Processor -->|Loads| Files
    Processor --> Runner
    Runner -->|Executes| AI[AI Provider]

    classDef template fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef storage fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef cli fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef usage fill:#e1bee7,stroke:#6a1b9a,stroke-width:2px

    class Def,Coder,Reviewer,Architect,Researcher,Mock,Gemini template
    class Files,Validation storage
    class Create,List,Show,Validate,Edit,Remove cli
    class Request,Processor,Runner,AI usage
```

---

## Daemon Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Stopped: Initial state

    Stopped --> Starting: exoctl daemon start
    Starting --> Running: PID written, watcher active
    Starting --> Failed: Startup error

    Running --> Stopping: exoctl daemon stop
    Running --> Restarting: exoctl daemon restart
    Running --> Crashed: Process died

    Stopping --> Stopped: SIGTERM successful
    Stopping --> ForceKill: Timeout (10s)
    ForceKill --> Stopped: SIGKILL sent

    Restarting --> Stopping: Stop phase
    Stopping --> Starting: Start phase

    Crashed --> Stopped: Cleanup PID file
    Failed --> Stopped: Cleanup resources

    Running --> Running: Process requests

    note right of Running
        File Watcher active
        Request Processor running
        Activity Journal logging
        AI Provider connected
    end note

    note right of Stopped
        PID file removed
        No watchers active
        Database closed
    end note
```

---

## Activity Journal Flow

```mermaid
graph LR
    subgraph Actors["Event Sources"]
        User[User Actions<br/>CLI commands]
        Daemon[Daemon Events<br/>System lifecycle]
        Agent[Agent Actions<br/>Processing]
        Git[Git Operations<br/>Commits]
    end

    subgraph Logger["Event Logger"]
        Log[log method]
        Info[info helper]
        Warn[warn helper]
        Error[error helper]
        Child[child logger]
    end

    subgraph Database["SQLite Journal"]
        Table[(activities table)]
        Cols[id, timestamp,<br/>trace_id, actor,<br/>action, target,<br/>payload, icon]
    end

    subgraph Query["Retrieval"]
        CLI[exoctl log tail]
        Trace[Filter by trace_id]
        Audit[Compliance audit]
    end

    User --> Log
    Daemon --> Info
    Agent --> Warn
    Git --> Error

    Log --> Table
    Info --> Table
    Warn --> Table
    Error --> Table
    Child --> Table

    Table --> CLI
    Table --> Trace
    Table --> Audit

    Cols -.schema.-> Table

    classDef source fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef logger fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef db fill:#b2dfdb,stroke:#00695c,stroke-width:2px
    classDef query fill:#fff3e0,stroke:#e65100,stroke-width:2px

    class User,Daemon,Agent,Git source
    class Log,Info,Warn,Error,Child logger
    class Table,Cols db
    class CLI,Trace,Audit query
```

---

## Key Design Principles

### 1. **Files as API**

- Request input: Markdown files in `Inbox/Requests`
- Plan output: Markdown files in `Inbox/Plans`
- Configuration: TOML with Zod validation
- Context: File system is source of truth

### 2. **Separation of Concerns**

- **CLI Layer**: Human interface (exoctl)
- **Core Layer**: Daemon orchestration (main.ts, watcher)
- **Service Layer**: Business logic (processors, runners)
- **Storage Layer**: SQLite + file system

### 3. **Auditability**

- Every action logged to Activity Journal
- Trace ID links: request → plan → changeset → commit
- Git commit footers with `Exo-Trace` metadata
- Immutable event stream for compliance

### 4. **Multi-Provider Support**

- Local-first: Ollama (no cloud required)
- Cloud options: Claude, GPT, Gemini
- Mock provider for testing
- Provider factory pattern for extensibility

### 5. **Portal System**

- Symlink-based external project access
- Context cards for agent understanding
- Scoped permissions (Deno security model)
- Multi-project refactoring support

---

## Component Responsibilities

| Component              | Responsibility                     | Key Files                           |
| ---------------------- | ---------------------------------- | ----------------------------------- |
| **CLI Layer**          | Human interface for system control | `src/cli/*.ts`                      |
| **Daemon**             | Background orchestration engine    | `src/main.ts`                       |
| **Request Watcher**    | Detect new requests in Inbox       | `src/services/watcher.ts`           |
| **Plan Watcher**       | Detect approved plans              | `src/services/watcher.ts`           |
| **Request Processor**  | Parse requests, generate plans     | `src/services/request_processor.ts` |
| **Plan Executor**      | Execute approved plans             | `src/services/plan_executor.ts`     |
| **Agent Runner**       | Execute agent logic with LLM       | `src/services/agent_runner.ts`      |
| **Event Logger**       | Write to Activity Journal          | `src/services/event_logger.ts`      |
| **Config Service**     | Load and validate exo.config.toml  | `src/config/service.ts`             |
| **Database Service**   | SQLite journal.db operations       | `src/services/db.ts`                |
| **Git Service**        | Git operations with trace metadata | `src/services/git_service.ts`       |
| **Provider Factory**   | Create LLM provider instances      | `src/ai/provider_factory.ts`        |
| **Context Loader**     | Load context for agent execution   | `src/services/context_loader.ts`    |
| **Portal Commands**    | Manage external project access     | `src/cli/portal_commands.ts`        |
| **Blueprint Commands** | Manage agent templates             | `src/cli/blueprint_commands.ts`     |
| **Dashboard Commands** | Launch terminal dashboard          | `src/cli/dashboard_commands.ts`     |
| **TUI Dashboard**      | Multi-view terminal UI             | `src/tui/*.ts`                      |
| **Parsers**            | Parse markdown + frontmatter       | `src/parsers/*.ts`                  |
| **Schemas**            | Zod validation layer               | `src/schemas/*.ts`                  |
| **MCP Server**         | JSON-RPC server for tool execution | `src/mcp/server.ts`                 |

---

## Developer Tooling Architecture

ExoFrame includes repository tooling under `scripts/` to keep development workflows deterministic.

### agents/ Knowledge Base Index & Embeddings

ExoFrame includes a developer-facing knowledge base under `agents/` used to keep AI assistants consistent and repository-aware.

Artifacts:

- `agents/manifest.json`: index of agent docs with metadata and chunk references
- `agents/chunks/*`: chunked doc text used for retrieval
- `agents/embeddings/*`: embedding vectors (often mocked in CI) used for semantic search

Build/validation scripts:

- `scripts/build_agents_index.ts`: rebuilds `agents/manifest.json` and chunks
- `scripts/build_agents_embeddings.ts`: regenerates embeddings (`--mode mock` for deterministic CI)
- `scripts/verify_manifest_fresh.ts`: checks manifest/chunks are up to date
- `scripts/validate_agents_docs.ts`: validates agent-doc frontmatter/schema

### CI, Scaffolding, and Database Tooling

- `scripts/ci.ts`: orchestrates repository checks and tests in CI-like environments
- `scripts/scaffold.sh`: scaffolds a new ExoFrame workspace folder structure and templates
- `scripts/setup_db.ts`: initializes `journal.db` schema
- `scripts/migrate_db.ts` + `migrations/*.sql`: applies incremental database migrations

---

## Viewing This Document

### VS Code

- Built-in Mermaid preview (Markdown Preview Enhanced extension recommended)
- Right-click → "Open Preview" or press `Ctrl+Shift+V`

### GitHub/GitLab

- Native Mermaid rendering in markdown files

### Mermaid Live Editor

- https://mermaid.live/
- Copy/paste diagram code for editing

### Export Options

- PNG/SVG export via Mermaid Live Editor
- PDF export via VS Code extensions
- HTML with mermaid.js for web viewing

---

## Related Documentation

- **[Implementation Plan](ExoFrame_Implementation_Plan.md)** - Detailed development roadmap
- **[User Guide](ExoFrame_User_Guide.md)** - End-user documentation
- **[Technical Spec](ExoFrame_Technical_Spec.md)** - Deep technical details
- **[White Paper](ExoFrame_White_paper.md)** - Vision and philosophy
- **[Building with AI Agents](Building_with_AI_Agents.md)** - Development patterns
