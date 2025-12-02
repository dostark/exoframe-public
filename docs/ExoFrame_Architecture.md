# ExoFrame Architecture

**Version:** 1.7.0\
**Date:** December 2, 2025

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
    end
    
    subgraph Core["⚙️ Core System"]
        Main[main.ts - Daemon]
        Watcher[File Watcher]
        ReqProc[Request Processor]
        AgentRun[Agent Runner]
        FlowEng[Flow Engine]
        ExecLoop[Execution Loop]
    end
    
    subgraph Services["🔧 Services"]
        ConfigSvc[Config Service]
        DBSvc[Database Service]
        GitSvc[Git Service]
        EventLog[Event Logger]
        ContextLoad[Context Loader]
        PlanWriter[Plan Writer]
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
        Knowledge[/Knowledge/<br/>Context Cards/]
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
    
    %% CLI to Services
    ReqCmd --> Inbox
    PlanCmd --> Inbox
    ChangeCmd --> GitSvc
    GitCmd --> GitSvc
    DaemonCmd --> Main
    PortalCmd --> ConfigSvc
    PortalCmd --> CtxCard
    BlueprintCmd --> Blueprint
    
    %% Core daemon flow
    Main --> ConfigSvc
    Main --> DBSvc
    Main --> Factory
    Main --> Watcher
    Main --> ReqProc
    Watcher --> Inbox
    ReqProc --> AgentRun
    AgentRun --> ExecLoop
    ExecLoop --> FlowEng
    
    %% Services integration
    AgentRun --> ContextLoad
    AgentRun --> PlanWriter
    AgentRun --> MissionRpt
    AgentRun --> EventLog
    ExecLoop --> ToolReg
    ExecLoop --> GitSvc
    ContextLoad --> Knowledge
    ContextLoad --> Portals
    PlanWriter --> Inbox
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
    Watcher --> System
    
    %% Styling
    classDef actor fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef cli fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef core fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef service fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef storage fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef ai fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    
    class User,Agent actor
    class Exoctl,ReqCmd,PlanCmd,ChangeCmd,GitCmd,DaemonCmd,PortalCmd,BlueprintCmd cli
    class Main,Watcher,ReqProc,AgentRun,FlowEng,ExecLoop core
    class ConfigSvc,DBSvc,GitSvc,EventLog,ContextLoad,PlanWriter,MissionRpt,PathRes,ToolReg,CtxCard service
    class DB,FS,Inbox,Blueprint,Knowledge,Portals,System storage
    class Factory,Ollama,Claude,GPT,Gemini,Mock ai
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
    participant AR as Agent Runner
    participant AI as AI Provider
    participant P as Inbox/Plans
    participant DB as Activity Journal
    
    U->>CLI: exoctl request "Fix bug"
    CLI->>I: Create request-{uuid}.md
    CLI->>DB: Log request.created
    CLI-->>U: Request created ✓
    
    W->>I: Detect new file
    W->>RP: Trigger processing
    RP->>I: Read request.md
    RP->>AR: Load blueprint
    AR->>AI: Generate plan
    AI-->>AR: Plan response
    AR->>P: Write plan-{uuid}.md
    AR->>DB: Log plan.generated
    P-->>U: Ready for review
    
    U->>CLI: exoctl plan list
    CLI->>P: Read plans
    CLI-->>U: Show pending plans
    
    U->>CLI: exoctl plan approve {uuid}
    CLI->>P: Update plan status
    CLI->>DB: Log plan.approved
    CLI-->>U: Approved ✓
```

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
    
    Req -.extends.-> Base
    Plan -.extends.-> Base
    Change -.extends.-> Base
    Git -.extends.-> Base
    Daemon -.extends.-> Base
    Portal -.extends.-> Base
    Blueprint -.extends.-> Base
    
    Base --> Ctx
    
    classDef entry fill:#bbdefb,stroke:#1976d2,stroke-width:2px
    classDef cmd fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef ctx fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    
    class Exoctl entry
    class Base,Req,Plan,Change,Git,Daemon,Portal,Blueprint cmd
    class Ctx ctx
```

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
        Knowledge["Knowledge<br/>Context Cards"]
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
    Knowledge -->|Generate| CtxCard["Context Card Gen"]
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
    
    class Inbox,Blueprint,Knowledge,Portals,System storage
    class Journal,Activities,Schema db
    class DB,Event,Config,Git service
```

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
    
    subgraph Knowledge["Knowledge/Portals"]
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
    classDef knowledge fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef config fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef cli fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    
    class Proj1,Proj2,Proj3 external
    class Link1,Link2,Link3 portal
    class Card1,Card2,Card3 knowledge
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
| **File Watcher**       | Detect new requests in Inbox       | `src/services/watcher.ts`           |
| **Request Processor**  | Parse requests, generate plans     | `src/services/request_processor.ts` |
| **Agent Runner**       | Execute agent logic with LLM       | `src/services/agent_runner.ts`      |
| **Event Logger**       | Write to Activity Journal          | `src/services/event_logger.ts`      |
| **Config Service**     | Load and validate exo.config.toml  | `src/config/service.ts`             |
| **Database Service**   | SQLite journal.db operations       | `src/services/db.ts`                |
| **Git Service**        | Git operations with trace metadata | `src/services/git_service.ts`       |
| **Provider Factory**   | Create LLM provider instances      | `src/ai/provider_factory.ts`        |
| **Context Loader**     | Load context for agent execution   | `src/services/context_loader.ts`    |
| **Portal Commands**    | Manage external project access     | `src/cli/portal_commands.ts`        |
| **Blueprint Commands** | Manage agent templates             | `src/cli/blueprint_commands.ts`     |

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
